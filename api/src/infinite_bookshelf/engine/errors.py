"""
Exceptions, provider error classification, and safe error payloads for the API
"""

import json
import re
from collections.abc import Iterable

import openai


class InfiniteBookshelfError(Exception):
    """Base exception class for Infinite Bookshelf"""

    code = "generation_error"
    title = "Generation error"
    default_hint = "An error occurred during book generation."

    def __init__(self, message: str, hint: str = None, detail: str = ""):
        super().__init__(message)
        self.message = message
        self.hint = hint or self.default_hint
        # The provider's full error, when `message` is only the readable part of it
        self.detail = detail if detail != message else ""


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
        "You have hit your provider's rate limit. Wait a minute and try again, or switch to another model. "
        "Raising the delay between requests in Settings helps on free tiers."
    )


class QuotaExceededError(InfiniteBookshelfError):
    """Raised when the key's account has no credits or quota left (HTTP 402, or 429 insufficient_quota)"""

    code = "quota"
    title = "Out of credits"
    default_hint = (
        "This key's account has no credits or quota left, so waiting won't help. "
        "Add credits with the provider, or switch to another key or model."
    )


class ModelUnavailableError(InfiniteBookshelfError):
    """Raised when the model does not exist, or this key can't use it (HTTP 404)"""

    code = "model_unavailable"
    title = "Model not found"
    default_hint = (
        "The provider doesn't offer this model, or this key can't use it. "
        "Switch to another model, or update this provider's model list in Settings."
    )


class ModelBusyError(InfiniteBookshelfError):
    """Raised when the model is overloaded (HTTP 502 / 503 / 529)"""

    code = "model_busy"
    title = "Model is busy"
    default_hint = (
        "The provider has more requests for this model than it can handle right now. "
        "Try again in a few minutes, or switch to another model."
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


class ProviderTimeoutError(APIConnectionError):
    """Raised when the provider stops answering for longer than the client's timeout"""

    code = "timeout"
    title = "The provider didn't answer in time"
    default_hint = "The model may be busy. Try again, or switch to another model."


class EmptyResponseError(InfiniteBookshelfError):
    """Raised when the model finishes without writing any text"""

    code = "empty_response"
    title = "The model wrote nothing"
    default_hint = (
        "Reasoning models can spend their whole budget thinking before they write. "
        "Try a longer section length, or another model, then try again."
    )


class StructureGenerationError(InfiniteBookshelfError):
    """Raised when generating or parsing the JSON book structure fails"""

    code = "outline"
    title = "Outline generation failed"
    default_hint = "The model returned an invalid outline. Try a larger or different model."


def _mentions(text: str, *words: str) -> bool:
    """Whole-word, case-insensitive match (so 'rate' does not match 'generate')."""
    return any(re.search(rf"\b{re.escape(w)}\b", text, re.IGNORECASE) for w in words)


def _message_in(body: object) -> str | None:
    """
    The human-readable message in a provider's error body, or None if there isn't one. Handles
    OpenAI-style {"error": {"message": ...}}, a bare {"message": ...}, Gemini's list of errors,
    and OpenRouter, which puts the upstream provider's own words in error.metadata.raw.
    """
    if isinstance(body, str):
        text = body.strip()
        if text.startswith(("{", "[")):
            try:
                return _message_in(json.loads(text))
            except ValueError:
                pass
        return text or None
    if isinstance(body, list):
        return next((m for m in map(_message_in, body) if m), None)
    if not isinstance(body, dict):
        return None
    inner = body.get("error", body)
    if inner is not body and not isinstance(inner, dict):
        return _message_in(inner)
    metadata = inner.get("metadata")
    raw = _message_in(metadata.get("raw")) if isinstance(metadata, dict) else None
    message = inner.get("message")
    return raw or (_message_in(message) if isinstance(message, str) else None)


_QUOTA_CODES = {"insufficient_quota", "credit_balance_exhausted", "insufficient_credits"}


def _is_quota(e: openai.APIStatusError, message: str) -> bool:
    """True when the account is out of credits, as opposed to sending too many requests."""
    if e.status_code == 402:
        return True
    codes = {str(getattr(e, "code", "") or ""), str(getattr(e, "type", "") or "")}
    return bool(codes & _QUOTA_CODES) or _mentions(message, "insufficient_quota", "credits", "credit balance")


def _is_busy(message: str) -> bool:
    return _mentions(message, "overloaded", "high demand", "capacity", "temporarily unavailable")


def classify_api_error(e: Exception, context: str = "") -> InfiniteBookshelfError:
    """
    Converts an OpenAI SDK (or other) exception into an InfiniteBookshelfError subclass. The
    message is the provider's own explanation when it can be found in the error; the full error
    is kept as `detail`.
    """
    if isinstance(e, InfiniteBookshelfError):
        return e

    prefix = f"{context}: " if context else ""
    raw = str(e)
    readable = _message_in(getattr(e, "body", None)) if isinstance(e, openai.APIStatusError) else None
    message, detail = prefix + (readable or raw), prefix + raw

    if isinstance(e, openai.AuthenticationError | openai.PermissionDeniedError):
        return APIAuthenticationError(message, detail=detail)
    if isinstance(e, openai.APIStatusError) and _is_quota(e, readable or raw):
        return QuotaExceededError(message, detail=detail)
    if isinstance(e, openai.RateLimitError):
        return APIRateLimitError(message, detail=detail)
    if isinstance(e, openai.NotFoundError):
        return ModelUnavailableError(message, detail=detail)
    if isinstance(e, openai.APITimeoutError):
        return ProviderTimeoutError(message, detail=detail)
    if isinstance(e, openai.APIConnectionError):
        return APIConnectionError(message, detail=detail)
    if isinstance(e, openai.BadRequestError | openai.UnprocessableEntityError):
        return APIRequestError(message, detail=detail)
    if isinstance(e, openai.APIStatusError):
        if 300 <= e.status_code < 400:  # Custom endpoints' redirects aren't followed on public servers
            return APIConnectionError(
                message,
                hint="This address redirects somewhere else, which this server doesn't follow. "
                "Enter the address it redirects to as the Base URL.",
                detail=detail,
            )
        if e.status_code in (502, 503, 504, 529) or _is_busy(message):
            return ModelBusyError(message, detail=detail)
        return InfiniteBookshelfError(message, detail=detail)

    # Non-SDK exceptions (e.g. raised mid-stream by a proxy): fall back to message matching
    if _mentions(raw, "401", "403", "unauthorized", "authentication"):
        return APIAuthenticationError(message)
    if _mentions(raw, "insufficient_quota", "credits"):
        return QuotaExceededError(message)
    if _mentions(raw, "429", "rate limit", "quota"):
        return APIRateLimitError(message)
    if _mentions(raw, "503", "529") or _is_busy(raw):
        return ModelBusyError(message)
    if _mentions(raw, "timeout", "timed out"):
        return ProviderTimeoutError(message)
    if _mentions(raw, "connection"):
        return APIConnectionError(message)
    return InfiniteBookshelfError(message)


_KEY_LIKE = re.compile(r"\b(?:sk|gsk|pk|rk|xai|AIza)[-_A-Za-z0-9]{12,}")


def scrub(text: str, secrets: Iterable[str] = ()) -> str:
    """Removes API keys (the given ones, and anything key-shaped) from a message."""
    for secret in secrets:
        if secret and len(secret) >= 6:
            text = text.replace(secret, "[redacted]")
    return _KEY_LIKE.sub("[redacted]", text)


def error_payload(e: Exception, secrets: Iterable[str] = ()) -> dict[str, str]:
    """A JSON-safe description of any error, with keys scrubbed, for the web app to display."""
    if isinstance(e, ValueError) and not isinstance(e, InfiniteBookshelfError):
        return {
            "code": "invalid_input",
            "title": "Can't start yet",
            "message": scrub(str(e), secrets),
            "hint": "",
            "detail": "",
        }
    err = classify_api_error(e)
    return {
        "code": err.code,
        "title": err.title,
        "message": scrub(err.message, secrets),
        "hint": err.hint,
        "detail": scrub(err.detail, secrets),
    }
