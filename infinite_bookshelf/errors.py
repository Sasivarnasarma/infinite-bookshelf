"""
Custom exceptions and Streamlit error UI components for Infinite Bookshelf
"""

import re

import openai
import streamlit as st


class InfiniteBookshelfError(Exception):
    """Base exception class for Infinite Bookshelf"""
    title = "⚠️ Generation Error"
    default_hint = "An error occurred during book generation."

    def __init__(self, message: str, hint: str = None):
        super().__init__(message)
        self.message = message
        self.hint = hint or self.default_hint


class APIAuthenticationError(InfiniteBookshelfError):
    """Raised when the API key is missing or invalid (HTTP 401 / 403)"""
    title = "🔑 Authentication Error"
    default_hint = "Check this provider's API key in Settings (use Test & load models to verify it)."


class APIRateLimitError(InfiniteBookshelfError):
    """Raised when API quota or rate limit is exceeded (HTTP 429)"""
    title = "⏳ Rate Limit Exceeded"
    default_hint = (
        "You have hit your provider's rate limit. Wait a minute, then press Resume. "
        "Raising the delay between requests in Settings helps on free tiers."
    )


class ModelUnavailableError(InfiniteBookshelfError):
    """Raised when the model does not exist or is at capacity (HTTP 404 / 503)"""
    title = "🤖 Model Unavailable"
    default_hint = (
        "The model identifier was not found or is temporarily at capacity. "
        "Pick another model, or update this provider's model list in Settings."
    )


class APIRequestError(InfiniteBookshelfError):
    """Raised when the provider rejects the request (HTTP 400 / 422)"""
    title = "🚫 Request Rejected"
    default_hint = "The provider rejected the request. The model may not support one of the options used."


class APIConnectionError(InfiniteBookshelfError):
    """Raised when connecting to the API provider fails or times out"""
    title = "🌐 Network Connection Error"
    default_hint = "Could not reach the provider. Check your internet connection, or the Base URL in Settings."


class StructureGenerationError(InfiniteBookshelfError):
    """Raised when generating or parsing the JSON book structure fails"""
    title = "📖 Structure Generation Failed"
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


def render_error_ui(e: Exception) -> None:
    """
    Renders a styled, actionable Streamlit alert callout for any exception.
    """
    if isinstance(e, ValueError):
        st.error(f"### ⚠️ Can't start yet\n\n{e}")
        return

    err = classify_api_error(e)
    st.error(f"### {err.title}\n\n**Details**: {err.message}\n\n💡 **Tip**: {err.hint}")
