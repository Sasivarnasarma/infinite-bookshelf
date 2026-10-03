"""
Exceptions, provider error classification, and safe error payloads for the API
"""

import re
from typing import Dict, Iterable

import openai


class InfiniteBookshelfError(Exception):
    """Base exception class for Infinite Bookshelf"""
    code = "generation_error"
    title = "Generation error"
    default_hint = "An error occurred during book generation."

    def __init__(self, message: str, hint: str = None):
        super().__init__(message)
        self.message = message
        self.hint = hint or self.default_hint


class APIAuthenticationError(InfiniteBookshelfError):
    """Raised when the API key is missing or invalid (HTTP 401 / 403)"""
    code = "auth"
    title = "Authentication failed"
    default_hint = "Check this provider's API key in Settings (use Test connection to verify it)."


class APIRateLimitError(InfiniteBookshelfError):
    """Raised when API quota or rate limit is exceeded (HTTP 429)"""
    code = "rate_limit"
    title = "Rate limit reached"
    default_hint = (
        "You have hit your provider's rate limit. Wait a minute, then press Resume. "
        "Raising the delay between requests in Settings helps on free tiers."
    )


class ModelUnavailableError(InfiniteBookshelfError):
    """Raised when the model does not exist or is at capacity (HTTP 404 / 503)"""
    code = "model_unavailable"
    title = "Model unavailable"
    default_hint = (
        "The model identifier was not found or is temporarily at capacity. "
        "Pick another model, or update this provider's model list in Settings."
    )


class APIRequestError(InfiniteBookshelfError):
    """Raised when the provider rejects the request (HTTP 400 / 422)"""
    code = "bad_request"
    title = "Request rejected"
    default_hint = "The provider rejected the request. The model may not support one of the options used."


class APIConnectionError(InfiniteBookshelfError):
    """Raised when connecting to the API provider fails or times out"""
    code = "connection"
    title = "Couldn't reach the provider"
    default_hint = "Could not reach the provider. Check your internet connection, or the Base URL in Settings."


class StructureGenerationError(InfiniteBookshelfError):
    """Raised when generating or parsing the JSON book structure fails"""
    code = "outline"
    title = "Outline generation failed"
    default_hint = "The model returned an invalid outline. Try a larger or different model."


def _mentions(text: str, *words: str) -> bool:
    """Whole-word, case-insensitive match (so 'rate' does not match 'generate')."""
    return any(re.search(rf"\b{re.escape(w)}\b", text, re.IGNORECASE) for w in words)


def classify_api_error(e: Exception, context: str = "") -> InfiniteBookshelfError:
    """
    Converts an OpenAI SDK (or other) exception into an InfiniteBookshelfError subclass.
    """
    if isinstance(e, InfiniteBookshelfError):
        return e

    detail = f"{context}: {e}" if context else str(e)

    if isinstance(e, openai.AuthenticationError | openai.PermissionDeniedError):
        return APIAuthenticationError(detail)
    if isinstance(e, openai.RateLimitError):
        return APIRateLimitError(detail)
    if isinstance(e, openai.NotFoundError):
        return ModelUnavailableError(detail)
    if isinstance(e, openai.APIConnectionError):  # includes APITimeoutError
        return APIConnectionError(detail)
    if isinstance(e, openai.BadRequestError | openai.UnprocessableEntityError):
        return APIRequestError(detail)
    if isinstance(e, openai.APIStatusError):
        if e.status_code in (502, 503, 529):
            return ModelUnavailableError(detail)
        return InfiniteBookshelfError(detail)

    # Non-SDK exceptions (e.g. raised mid-stream by a proxy): fall back to message matching
    msg = str(e)
    if _mentions(msg, "401", "403", "unauthorized", "authentication"):
        return APIAuthenticationError(detail)
    if _mentions(msg, "429", "rate limit", "quota"):
        return APIRateLimitError(detail)
    if _mentions(msg, "503", "overloaded", "capacity"):
        return ModelUnavailableError(detail)
    if _mentions(msg, "timeout", "timed out", "connection"):
        return APIConnectionError(detail)
    return InfiniteBookshelfError(detail)


_KEY_LIKE = re.compile(r"\b(?:sk|gsk|pk|rk|xai|AIza)[-_A-Za-z0-9]{12,}")


def scrub(text: str, secrets: Iterable[str] = ()) -> str:
    """Removes API keys (the given ones, and anything key-shaped) from a message."""
    for secret in secrets:
        if secret and len(secret) >= 6:
            text = text.replace(secret, "[redacted]")
    return _KEY_LIKE.sub("[redacted]", text)


def error_payload(e: Exception, secrets: Iterable[str] = ()) -> Dict[str, str]:
    """A JSON-safe description of any error, with keys scrubbed, for the web app to display."""
    if isinstance(e, ValueError) and not isinstance(e, InfiniteBookshelfError):
        return {"code": "invalid_input", "title": "Can't start yet", "message": scrub(str(e), secrets), "hint": ""}
    err = classify_api_error(e)
    return {
        "code": err.code,
        "title": err.title,
        "message": scrub(err.message, secrets),
        "hint": err.hint,
    }
