import httpx2 as httpx
import openai
import pytest

from infinite_bookshelf.errors import (
    APIAuthenticationError,
    APIConnectionError,
    APIRateLimitError,
    APIRequestError,
    InfiniteBookshelfError,
    ModelUnavailableError,
    classify_api_error,
)

REQUEST = httpx.Request("POST", "https://example.com/v1/chat/completions")


def status_error(cls, code, message="error"):
    return cls(message, response=httpx.Response(code, request=REQUEST), body=None)


@pytest.mark.parametrize(
    "exc, expected",
    [
        (status_error(openai.AuthenticationError, 401), APIAuthenticationError),
        (status_error(openai.PermissionDeniedError, 403), APIAuthenticationError),
        (status_error(openai.RateLimitError, 429), APIRateLimitError),
        (status_error(openai.NotFoundError, 404), ModelUnavailableError),
        (status_error(openai.BadRequestError, 400), APIRequestError),
        (status_error(openai.InternalServerError, 503), ModelUnavailableError),
        (openai.APIConnectionError(request=REQUEST), APIConnectionError),
        (openai.APITimeoutError(request=REQUEST), APIConnectionError),
    ],
)
def test_sdk_errors_are_classified_by_type(exc, expected):
    assert type(classify_api_error(exc)) is expected


def test_generate_is_not_mistaken_for_rate_limit():
    # Gemini's model-not-found message contains "generateContent"
    exc = status_error(
        openai.NotFoundError, 404, "models/foo is not found for API version v1beta, or is not supported for generateContent"
    )
    assert type(classify_api_error(exc)) is ModelUnavailableError

    plain = RuntimeError("Could not generate the requested content")
    assert type(classify_api_error(plain)) is InfiniteBookshelfError


def test_plain_exceptions_fall_back_to_whole_word_matching():
    assert type(classify_api_error(RuntimeError("HTTP 429 Too Many Requests"))) is APIRateLimitError
    assert type(classify_api_error(RuntimeError("Read timed out"))) is APIConnectionError


def test_existing_app_errors_pass_through_with_their_hint():
    err = APIRateLimitError("slow down", hint="custom hint")
    assert classify_api_error(err) is err
    assert err.hint == "custom hint"
