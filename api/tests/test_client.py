import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx2 as httpx
import openai
import pytest

from infinite_bookshelf.engine.client import chat_completion, create_llm_client, list_models
from infinite_bookshelf.engine.errors import (
    APIAuthenticationError,
    APIConnectionError,
    APIRateLimitError,
    APIRequestError,
    ModelBusyError,
    QuotaExceededError,
)

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


def test_presets_are_complete():
    from infinite_bookshelf.engine.client import PROVIDER_PRESETS

    for pid, preset in PROVIDER_PRESETS.items():
        assert preset["name"] and preset["base_url"].startswith(("https://", "http://localhost")), pid
        # The default is offered in the picker (local servers list theirs with "Test")
        assert preset["default_model"] in preset["models"] or (preset.get("local") and not preset["models"]), pid
        assert len(set(preset["models"])) == len(preset["models"]), pid
        # Tiers only label models the preset offers
        assert set(preset.get("tiers", {})) <= set(preset["models"]), pid
        assert set(preset.get("tiers", {}).values()) <= {"best", "balanced", "fast"}, pid


@pytest.fixture
def redirecting_server():
    """A server whose /v1 redirects to /internal, standing in for an internal address; records hits."""
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            if self.path.startswith("/v1/"):
                self.send_response(307)
                self.send_header("Location", "/internal/models")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            body = json.dumps({"object": "list", "data": [{"id": "internal-secret", "object": "model"}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1", hits
    server.shutdown()


def test_redirects_are_refused_when_asked(redirecting_server):
    base_url, hits = redirecting_server
    client = create_llm_client("", base_url, requires_key=False, follow_redirects=False)
    with pytest.raises(APIConnectionError) as error:
        list_models(client)
    assert "redirects somewhere else" in error.value.hint
    assert hits == ["/v1/models"]  # The redirect's target is never contacted


def test_redirects_are_followed_by_default(redirecting_server):
    # Built-in providers and self-hosted setups keep the SDK's usual behaviour
    base_url, hits = redirecting_server
    assert list_models(create_llm_client("", base_url, requires_key=False)) == ["internal-secret"]
    assert hits == ["/v1/models", "/internal/models"]


@pytest.fixture
def failing_server():
    """A provider that answers every chat request with the status and JSON body set in `reply`."""
    reply = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            body = json.dumps(reply["body"]).encode()
            self.send_response(reply["status"])
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1", reply
    server.shutdown()


@pytest.mark.parametrize(
    "status, body, expected, message",
    [
        (
            429,
            {
                "error": {
                    "message": "You have no credits remaining.",
                    "type": "insufficient_quota",
                    "code": "credit_balance_exhausted",
                }
            },
            QuotaExceededError,
            "You have no credits remaining.",
        ),
        (
            503,
            [
                {
                    "error": {
                        "code": 503,
                        "message": "This model is currently experiencing high demand.",
                        "status": "UNAVAILABLE",
                    }
                }
            ],
            ModelBusyError,
            "This model is currently experiencing high demand.",
        ),
        (
            429,
            {
                "error": {
                    "message": "Provider returned error",
                    "code": 429,
                    "metadata": {"raw": "Rate-limited upstream."},
                }
            },
            APIRateLimitError,
            "Rate-limited upstream.",
        ),
    ],
)
def test_real_provider_errors_give_their_readable_message(failing_server, status, body, expected, message):
    base_url, reply = failing_server
    reply.update(status=status, body=body)
    client = create_llm_client("key", base_url).with_options(max_retries=0)
    with pytest.raises(expected) as error:
        chat_completion(client, model="m", messages=[{"role": "user", "content": "hi"}])
    assert error.value.message == message
    assert error.value.detail.startswith(f"Error code: {status}")


def test_clients_have_a_bounded_timeout_and_one_retry():
    client = create_llm_client("key", "https://example.com/v1")
    assert client.max_retries == 1
    assert client.timeout.read == 180.0
