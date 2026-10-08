import httpx2 as httpx
import openai
import pytest

from infinite_bookshelf.engine.errors import (
    APIAuthenticationError,
    APIConnectionError,
    APIRateLimitError,
    APIRequestError,
    InfiniteBookshelfError,
    ModelBusyError,
    ModelUnavailableError,
    ProviderTimeoutError,
    QuotaExceededError,
    classify_api_error,
    error_payload,
)

REQUEST = httpx.Request("POST", "https://example.com/v1/chat/completions")


def status_error(cls, code, message="error", body=None):
    return cls(message, response=httpx.Response(code, request=REQUEST), body=body)


@pytest.mark.parametrize(
    "exc, expected",
    [
        (status_error(openai.AuthenticationError, 401), APIAuthenticationError),
        (status_error(openai.PermissionDeniedError, 403), APIAuthenticationError),
        (status_error(openai.RateLimitError, 429), APIRateLimitError),
        (status_error(openai.NotFoundError, 404), ModelUnavailableError),
        (status_error(openai.BadRequestError, 400), APIRequestError),
        (status_error(openai.InternalServerError, 503), ModelBusyError),
        (status_error(openai.APIStatusError, 529), ModelBusyError),
        (status_error(openai.APIStatusError, 402), QuotaExceededError),
        (openai.APIConnectionError(request=REQUEST), APIConnectionError),
        (openai.APITimeoutError(request=REQUEST), ProviderTimeoutError),
    ],
)
def test_sdk_errors_are_classified_by_type(exc, expected):
    assert type(classify_api_error(exc)) is expected


def test_generate_is_not_mistaken_for_rate_limit():
    # Gemini's model-not-found message contains "generateContent"
    exc = status_error(
        openai.NotFoundError,
        404,
        "models/foo is not found for API version v1beta, or is not supported for generateContent",
    )
    assert type(classify_api_error(exc)) is ModelUnavailableError

    plain = RuntimeError("Could not generate the requested content")
    assert type(classify_api_error(plain)) is InfiniteBookshelfError


def test_plain_exceptions_fall_back_to_whole_word_matching():
    assert type(classify_api_error(RuntimeError("HTTP 429 Too Many Requests"))) is APIRateLimitError
    assert type(classify_api_error(RuntimeError("Read timed out"))) is ProviderTimeoutError
    assert type(classify_api_error(RuntimeError("Connection reset by peer"))) is APIConnectionError
    assert type(classify_api_error(RuntimeError("Model is overloaded"))) is ModelBusyError


def test_existing_app_errors_pass_through_with_their_hint():
    err = APIRateLimitError("slow down", hint="custom hint")
    assert classify_api_error(err) is err
    assert err.hint == "custom hint"


def test_scrub_removes_given_keys_and_key_shaped_strings():
    from infinite_bookshelf.engine.errors import scrub

    assert scrub("bad key my-own-secret-123", ["my-own-secret-123"]) == "bad key [redacted]"
    assert "sk-abcdefghijklmnop1234" not in scrub("Incorrect API key provided: sk-abcdefghijklmnop1234")
    assert "AIzaSyA1234567890abcdefg" not in scrub("key=AIzaSyA1234567890abcdefg")


def test_error_payload_shape():
    from infinite_bookshelf.engine.errors import APIRateLimitError, error_payload

    payload = error_payload(APIRateLimitError("slow down"))
    assert payload["code"] == "rate_limit" and payload["title"] and payload["hint"]
    assert error_payload(ValueError("Bad input"))["code"] == "invalid_input"


# --- Provider messages --------------------------------------------------------------------------


def test_openai_out_of_credits_is_quota_not_rate_limit():
    body = {
        "message": "You have no credits remaining. Add credits to continue using the API.",
        "type": "insufficient_quota",
        "param": None,
        "code": "credit_balance_exhausted",
    }
    err = classify_api_error(status_error(openai.RateLimitError, 429, f"Error code: 429 - {{'error': {body}}}", body))
    assert type(err) is QuotaExceededError
    assert err.message == "You have no credits remaining. Add credits to continue using the API."
    assert err.detail.startswith("Error code: 429 - ")


def test_a_plain_rate_limit_stays_a_rate_limit():
    body = {"message": "Rate limit reached for requests per minute.", "type": "requests", "code": "rate_limit_exceeded"}
    err = classify_api_error(status_error(openai.RateLimitError, 429, "Error code: 429", body))
    assert type(err) is APIRateLimitError
    assert err.message == "Rate limit reached for requests per minute."


def test_gemini_error_list_gives_its_message():
    body = [
        {
            "error": {
                "code": 503,
                "message": "This model is currently experiencing high demand. Please try again later.",
                "status": "UNAVAILABLE",
            }
        }
    ]
    err = classify_api_error(status_error(openai.InternalServerError, 503, f"Error code: 503 - {body}", body))
    assert type(err) is ModelBusyError
    assert err.message == "This model is currently experiencing high demand. Please try again later."


def test_openrouter_upstream_message_is_preferred():
    body = {
        "message": "Provider returned error",
        "code": 429,
        "metadata": {"raw": "qwen/qwen3.8-flash is temporarily rate-limited upstream.", "provider_name": "Alibaba"},
    }
    err = classify_api_error(status_error(openai.RateLimitError, 429, "Error code: 429", body))
    assert type(err) is APIRateLimitError
    assert err.message == "qwen/qwen3.8-flash is temporarily rate-limited upstream."


def test_json_inside_a_string_is_read():
    body = {"error": {"message": '{"error": {"message": "Upstream says no"}}'}}
    err = classify_api_error(status_error(openai.BadRequestError, 400, "Error code: 400", body))
    assert err.message == "Upstream says no"


def test_unparseable_errors_keep_the_full_text():
    err = classify_api_error(status_error(openai.BadRequestError, 400, "Error code: 400 - something odd", None))
    assert err.message == "Error code: 400 - something odd"
    assert err.detail == ""  # Nothing to add when the message already is the full error


def test_payload_carries_the_scrubbed_detail():
    body = {"message": "Incorrect API key provided: sk-abcdefghijklmnop1234"}
    exc = status_error(openai.AuthenticationError, 401, f"Error code: 401 - {body}", body)
    payload = error_payload(exc)
    assert payload["code"] == "auth"
    assert "sk-abcdefghijklmnop1234" not in payload["message"] + payload["detail"]
    assert payload["detail"].startswith("Error code: 401")
