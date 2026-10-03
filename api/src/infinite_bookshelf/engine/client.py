"""
OpenAI-compatible provider client, request adaptation, and built-in provider presets.

Presets are what the web app offers out of the box. Users add their own keys (kept in their
browser) and can add custom endpoints; the API never stores either.
"""

import re
from typing import Any, Dict, List

import openai
from openai import OpenAI

from .errors import APIAuthenticationError, APIConnectionError, classify_api_error

PROVIDER_PRESETS: Dict[str, Dict[str, Any]] = {
    "gemini": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "key_url": "https://aistudio.google.com/apikey",
        "default_model": "gemini-2.5-flash",
        "models": ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-2.5-flash"],
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "key_url": "https://platform.openai.com/api-keys",
        "default_model": "gpt-4o-mini",
        "models": ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "o4-mini", "o3", "gpt-4o-mini", "gpt-4o"],
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "key_url": "https://openrouter.ai/settings/keys",
        "default_model": "google/gemini-2.5-flash",
        "models": [
            "google/gemini-3.8-flash",
            "google/gemini-2.5-flash",
            "anthropic/claude-sonnet-5",
            "meta-llama/llama-4-maverick",
            "deepseek/deepseek-r1",
        ],
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "key_url": "https://platform.deepseek.com/api_keys",
        "default_model": "deepseek-chat",
        "models": ["deepseek-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "key_url": "https://console.groq.com/keys",
        "default_model": "meta-llama/llama-4-maverick-17b-128e-instruct",
        "models": ["meta-llama/llama-4-maverick-17b-128e-instruct", "qwen-2.5-72b-instruct"],
    },
    "ollama": {
        "name": "Ollama",
        "base_url": "http://localhost:11434/v1",
        "key_url": "",
        "default_model": "llama3.3:latest",
        "models": ["llama3.3:latest", "deepseek-r1:latest", "mistral:latest"],
        "requires_key": False,
        "local": True,  # Only offered where the server may reach private addresses (self-hosting)
    },
}

# Reasoning models reject `temperature` and use `max_completion_tokens` instead of `max_tokens`
_REASONING_MODEL_RE = re.compile(r"^(?:.*/)?(?:o\d|gpt-5|gpt-6)", re.IGNORECASE)

# Optional request parameters that some OpenAI-compatible providers reject
_DROPPABLE_PARAMS = ("stream_options", "response_format", "temperature")


def create_llm_client(api_key: str, base_url: str = None, requires_key: bool = True) -> OpenAI:
    """
    Creates and validates an OpenAI-compatible client instance.
    """
    api_key = (api_key or "").strip()
    if not api_key:
        if requires_key:
            raise APIAuthenticationError("API Key is missing. Please provide a valid API key.")
        api_key = "not-needed"  # Local servers (e.g. Ollama) ignore the key, but the SDK requires one

    client_kwargs = {"api_key": api_key}
    if base_url and base_url.strip():
        client_kwargs["base_url"] = base_url.strip()

    try:
        return OpenAI(**client_kwargs)
    except Exception as e:
        raise APIConnectionError(f"Failed to initialize API client: {e}")


def list_models(llm_client: OpenAI) -> List[str]:
    """Fetches the model IDs the provider currently offers."""
    try:
        return sorted(m.id for m in llm_client.models.list())
    except Exception as e:
        raise classify_api_error(e, "Could not list models")


def _adjust_for_rejection(kwargs: Dict[str, Any], error_text: str) -> bool:
    """
    Modifies kwargs in place to work around a rejected parameter.
    Returns True if something was changed (so the request is worth retrying).
    """
    text = error_text.lower()
    if "max_tokens" in text and "max_tokens" in kwargs:
        kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")
        return True
    for param in _DROPPABLE_PARAMS:
        if param in text and param in kwargs:
            kwargs.pop(param)
            return True
    return False


def chat_completion(llm_client: OpenAI, **kwargs: Any):
    """
    Calls chat.completions.create, adapting parameters to what the model accepts.

    Reasoning models get `max_completion_tokens` and no `temperature` up front; for any other
    provider that rejects an optional parameter (400/422), the parameter is adjusted and the
    request retried. Errors are converted to InfiniteBookshelfError subclasses.
    """
    if _REASONING_MODEL_RE.match(kwargs.get("model", "")):
        kwargs.pop("temperature", None)
        if "max_tokens" in kwargs:
            kwargs["max_completion_tokens"] = kwargs.pop("max_tokens")

    # Terminates: every retry removes or renames a parameter, and each can only be adjusted once
    while True:
        try:
            return llm_client.chat.completions.create(**kwargs)
        except (openai.BadRequestError, openai.UnprocessableEntityError) as e:
            if not _adjust_for_rejection(kwargs, str(e)):
                raise classify_api_error(e)
        except Exception as e:
            raise classify_api_error(e)
