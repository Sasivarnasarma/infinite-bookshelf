"""
OpenAI-compatible provider client, request adaptation, and built-in provider presets.

Presets are what the web app offers out of the box. Users add their own keys (kept in their
browser) and can add custom endpoints; the API never stores either.
"""

import re
from typing import Any

import openai
from openai import OpenAI

from .errors import APIAuthenticationError, APIConnectionError, classify_api_error

# Built-in providers, in the order the web app lists them; all speak the OpenAI Chat Completions
# API. `models` are suggestions (users can load the live list or type any model ID), and `tiers`
# marks each as best / balanced / fast, which the web app uses to suggest models per step.
# A stalled provider fails within minutes rather than the SDK's 10-minute default. `read` is the
# longest wait for the next bytes: a streamed section gets one chunk at a time, but the outline
# arrives whole, after the model has finished writing it.
PROVIDER_TIMEOUT = openai.Timeout(connect=15.0, read=180.0, write=30.0, pool=15.0)
PROVIDER_RETRIES = 1

PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "key_url": "https://platform.openai.com/api-keys",
        "default_model": "gpt-6-luna",
        "models": ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"],
        "tiers": {"gpt-6-astra": "best", "gpt-6.1-sol": "balanced", "gpt-6-luna": "fast"},
    },
    "anthropic": {
        # Anthropic's OpenAI-compatible endpoint (streaming, max_tokens, temperature supported)
        "name": "Anthropic Claude",
        "base_url": "https://api.anthropic.com/v1/",
        "key_url": "https://platform.claude.com/settings/keys",
        "default_model": "claude-sonnet-5-5",
        "models": ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-haiku-4-5"],
        "tiers": {
            "claude-fable-5-1": "best",
            "claude-opus-5-5": "best",
            "claude-sonnet-5-5": "balanced",
            "claude-haiku-4-5": "fast",
        },
    },
    "gemini": {
        "name": "Google Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "key_url": "https://aistudio.google.com/apikey",
        "default_model": "gemini-3.8-flash",
        "models": ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
        "tiers": {
            "gemini-3.1-pro-preview": "best",
            "gemini-3.8-flash": "balanced",
            "gemini-3.7-flash": "balanced",
            "gemini-3.5-flash-lite": "fast",
        },
    },
    "xai": {
        "name": "xAI Grok",
        "base_url": "https://api.x.ai/v1",
        "key_url": "https://console.x.ai",
        "default_model": "grok-4.7",
        "models": ["grok-4.7", "grok-4.3"],
        "tiers": {"grok-4.7": "best", "grok-4.3": "fast"},
    },
    "openrouter": {
        "name": "OpenRouter",
        "base_url": "https://openrouter.ai/api/v1",
        "key_url": "https://openrouter.ai/settings/keys",
        "default_model": "google/gemini-3.8-flash",
        "models": [
            "google/gemini-3.8-flash",
            "anthropic/claude-sonnet-5.5",
            "openai/gpt-6.1-sol",
            "x-ai/grok-4.7",
            "deepseek/deepseek-v4.1-flash",
            "moonshotai/kimi-k3",
            "qwen/qwen3.8-flash",
            "z-ai/glm-5.3",
        ],
        "tiers": {
            "openai/gpt-6.1-sol": "best",
            "anthropic/claude-sonnet-5.5": "best",
            "google/gemini-3.8-flash": "balanced",
            "x-ai/grok-4.7": "balanced",
            "moonshotai/kimi-k3": "balanced",
            "z-ai/glm-5.3": "balanced",
            "deepseek/deepseek-v4.1-flash": "fast",
            "qwen/qwen3.8-flash": "fast",
        },
    },
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "key_url": "https://platform.deepseek.com/api_keys",
        "default_model": "deepseek-flash",
        "models": ["deepseek-flash", "deepseek-v4-pro"],
        "tiers": {"deepseek-v4-pro": "best", "deepseek-flash": "fast"},
    },
    "mistral": {
        "name": "Mistral AI",
        "base_url": "https://api.mistral.ai/v1",
        "key_url": "https://console.mistral.ai/api-keys",
        "default_model": "mistral-medium-latest",
        "models": ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
        "tiers": {"mistral-large-latest": "best", "mistral-medium-latest": "balanced", "mistral-small-latest": "fast"},
    },
    "groq": {
        "name": "Groq",
        "base_url": "https://api.groq.com/openai/v1",
        "key_url": "https://console.groq.com/keys",
        "default_model": "llama-3.3-70b-versatile",
        "models": ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"],
        "tiers": {
            "openai/gpt-oss-120b": "balanced",
            "llama-3.3-70b-versatile": "balanced",
            "openai/gpt-oss-20b": "fast",
            "qwen/qwen3.8-27b": "fast",
        },
    },
    "moonshot": {
        "name": "Moonshot Kimi",
        "base_url": "https://api.moonshot.ai/v1",
        "key_url": "https://platform.kimi.ai/console/api-keys",
        "default_model": "kimi-k3",
        "models": ["kimi-k3", "kimi-k2.6"],
        "tiers": {"kimi-k3": "best", "kimi-k2.6": "balanced"},
    },
    "qwen": {
        # Alibaba Cloud Model Studio, international region
        "name": "Alibaba Qwen",
        "base_url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        "key_url": "https://modelstudio.console.alibabacloud.com/",
        "default_model": "qwen3.8-flash",
        "models": ["qwen3.8-max", "qwen3.7-plus", "qwen3.8-flash"],
        "tiers": {"qwen3.8-max": "best", "qwen3.7-plus": "balanced", "qwen3.8-flash": "fast"},
    },
    "zai": {
        "name": "Z.ai GLM",
        "base_url": "https://api.z.ai/api/paas/v4/",
        "key_url": "https://z.ai/manage-apikey/apikey-list",
        "default_model": "glm-5.3-flash",
        "models": ["glm-5.3", "glm-5.3-flash"],
        "tiers": {"glm-5.3": "best", "glm-5.3-flash": "fast"},
    },
    "together": {
        "name": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "key_url": "https://api.together.ai/settings/api-keys",
        "default_model": "deepseek-ai/DeepSeek-V4-Flash-0731",
        "models": [
            "deepseek-ai/DeepSeek-V4-Flash-0731",
            "deepseek-ai/DeepSeek-V4-Pro-0813",
            "moonshotai/Kimi-K3",
            "zai-org/GLM-5.3",
            "openai/gpt-oss-120b",
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        ],
        "tiers": {
            "moonshotai/Kimi-K3": "best",
            "deepseek-ai/DeepSeek-V4-Pro-0813": "best",
            "zai-org/GLM-5.3": "balanced",
            "openai/gpt-oss-120b": "balanced",
            "deepseek-ai/DeepSeek-V4-Flash-0731": "fast",
            "meta-llama/Llama-3.3-70B-Instruct-Turbo": "fast",
        },
    },
    "fireworks": {
        "name": "Fireworks AI",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "key_url": "https://app.fireworks.ai/settings/users/api-keys",
        "default_model": "accounts/fireworks/models/glm-5p3-flash",
        "models": [
            "accounts/fireworks/models/glm-5p3-flash",
            "accounts/fireworks/models/glm-5p3",
            "accounts/fireworks/models/kimi-k3",
            "accounts/fireworks/models/deepseek-v3p1",
        ],
        "tiers": {
            "accounts/fireworks/models/kimi-k3": "best",
            "accounts/fireworks/models/glm-5p3": "balanced",
            "accounts/fireworks/models/deepseek-v3p1": "balanced",
            "accounts/fireworks/models/glm-5p3-flash": "fast",
        },
    },
    "cerebras": {
        "name": "Cerebras",
        "base_url": "https://api.cerebras.ai/v1",
        "key_url": "https://cloud.cerebras.ai",
        "default_model": "gpt-oss-120b",
        "models": ["gpt-oss-120b", "qwen-3.8-27b"],
        "tiers": {"gpt-oss-120b": "balanced", "qwen-3.8-27b": "fast"},
    },
    "ollama": {
        "name": "Ollama",
        "base_url": "http://localhost:11434/v1",
        "key_url": "",
        "default_model": "gemma4:latest",
        "models": ["gemma4:latest", "qwen3:latest", "llama3.1:latest", "deepseek-r1:latest"],
        "requires_key": False,
        "local": True,  # Only offered where the server may reach private addresses (self-hosting)
    },
    "lmstudio": {
        # Models are whatever is loaded in LM Studio: "Test" lists them
        "name": "LM Studio",
        "base_url": "http://localhost:1234/v1",
        "key_url": "",
        "default_model": "",
        "models": [],
        "requires_key": False,
        "local": True,
    },
}

# Reasoning models reject `temperature` and use `max_completion_tokens` instead of `max_tokens`
_REASONING_MODEL_RE = re.compile(r"^(?:.*/)?(?:o\d|gpt-5|gpt-6)", re.IGNORECASE)

# Optional request parameters that some OpenAI-compatible providers reject
_DROPPABLE_PARAMS = ("stream_options", "response_format", "temperature")


def create_llm_client(
    api_key: str, base_url: str = None, requires_key: bool = True, follow_redirects: bool = True
) -> OpenAI:
    """
    Creates and validates an OpenAI-compatible client instance. `follow_redirects=False` keeps
    every request on the base URL that was checked.
    """
    api_key = (api_key or "").strip()
    if not api_key:
        if requires_key:
            raise APIAuthenticationError("API Key is missing. Please provide a valid API key.")
        api_key = "not-needed"  # Local servers (e.g. Ollama) ignore the key, but the SDK requires one

    client_kwargs = {"api_key": api_key, "timeout": PROVIDER_TIMEOUT, "max_retries": PROVIDER_RETRIES}
    if base_url and base_url.strip():
        client_kwargs["base_url"] = base_url.strip()
    if not follow_redirects:
        client_kwargs["http_client"] = openai.DefaultHttpxClient(follow_redirects=False)

    try:
        return OpenAI(**client_kwargs)
    except Exception as e:
        raise APIConnectionError(f"Failed to initialize API client: {e}") from None


def list_models(llm_client: OpenAI) -> list[str]:
    """Fetches the model IDs the provider currently offers."""
    try:
        return sorted(m.id for m in llm_client.models.list())
    except Exception as e:
        raise classify_api_error(e, "Could not list models") from None


def _adjust_for_rejection(kwargs: dict[str, Any], error_text: str) -> bool:
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
                raise classify_api_error(e) from None
        except Exception as e:
            raise classify_api_error(e) from None
