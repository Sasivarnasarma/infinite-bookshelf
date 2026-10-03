import httpx2 as httpx
import openai
import pytest

from infinite_bookshelf.engine.client import chat_completion
from infinite_bookshelf.engine.errors import APIAuthenticationError, APIRequestError

REQUEST = httpx.Request("POST", "https://example.com/v1/chat/completions")


def bad_request(message):
    return openai.BadRequestError(message, response=httpx.Response(400, request=REQUEST), body=None)


class FakeClient:
    """Mimics client.chat.completions.create, rejecting any parameter in `rejected`."""

    def __init__(self, rejected=(), error=None):
        self.rejected = rejected
        self.error = error
        self.calls = []
        self.chat = self
        self.completions = self

    def create(self, **kwargs):
        self.calls.append(dict(kwargs))
        if self.error:
            raise self.error
        for param in self.rejected:
            if param in kwargs:
                raise bad_request(f"Unsupported parameter: '{param}' is not supported with this model.")
        return "ok"


def test_reasoning_models_get_compatible_params_up_front():
    client = FakeClient()
    chat_completion(client, model="o4-mini", messages=[], temperature=0.3, max_tokens=100)
    assert client.calls == [{"model": "o4-mini", "messages": [], "max_completion_tokens": 100}]


def test_regular_models_keep_params():
    client = FakeClient()
    chat_completion(client, model="gemini-2.5-flash", messages=[], temperature=0.3, max_tokens=100)
    assert client.calls[0]["temperature"] == 0.3
    assert client.calls[0]["max_tokens"] == 100


def test_rejected_params_are_adjusted_and_retried():
    client = FakeClient(rejected=("response_format", "stream_options", "max_tokens"))
    result = chat_completion(
        client,
        model="some-proxy-model",
        messages=[],
        temperature=0.3,
        max_tokens=100,
        response_format={"type": "json_object"},
        stream_options={"include_usage": True},
    )
    assert result == "ok"
    final = client.calls[-1]
    assert "response_format" not in final and "stream_options" not in final
    assert final["max_completion_tokens"] == 100


def test_unfixable_bad_request_is_raised_as_app_error():
    client = FakeClient(error=bad_request("messages: field required"))
    with pytest.raises(APIRequestError):
        chat_completion(client, model="m", messages=[])
    assert len(client.calls) == 1


def test_auth_errors_are_not_retried():
    error = openai.AuthenticationError("bad key", response=httpx.Response(401, request=REQUEST), body=None)
    client = FakeClient(error=error)
    with pytest.raises(APIAuthenticationError):
        chat_completion(client, model="m", messages=[])
    assert len(client.calls) == 1
