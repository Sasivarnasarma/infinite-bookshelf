import json
import re
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from infinite_bookshelf.server import app as app_module
from infinite_bookshelf.server import security
from infinite_bookshelf.server.app import create_app
from infinite_bookshelf.server.config import Settings

SECRET = "sk-test-SECRET-key-1234567890"
OUTLINE = {"Chapter 1": "Basics", "Chapter 2": {"Intro": "Why", "Deep dive": "How"}}


class FakeClient:
    """Mimics the OpenAI client: JSON outline, a title, streamed sections, a model list."""

    def __init__(self, api_key="", base_url=None, fail_with=None):
        self.api_key, self.base_url, self.fail_with = api_key, base_url, fail_with
        self.requests = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))
        self.models = SimpleNamespace(list=lambda: [SimpleNamespace(id="model-b"), SimpleNamespace(id="model-a")])

    def create(self, **kwargs):
        self.requests.append(kwargs)
        if self.fail_with:
            raise self.fail_with
        system = kwargs["messages"][0]["content"]
        if kwargs.get("stream"):
            words = ["Hello ", "from ", "the ", "section."]
            chunks = [
                SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=w))], usage=None) for w in words
            ]
            usage = SimpleNamespace(prompt_tokens=10, completion_tokens=4)
            return iter(chunks + [SimpleNamespace(choices=[], usage=usage)])
        content = json.dumps(OUTLINE) if "valid JSON" in system else "A Great Title"
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
            usage=SimpleNamespace(prompt_tokens=5, completion_tokens=7),
        )


@pytest.fixture
def clients(monkeypatch):
    made = []

    def factory(api_key, base_url=None, requires_key=True):
        client = FakeClient(api_key, base_url)
        made.append(client)
        return client

    monkeypatch.setattr(app_module, "create_llm_client", factory)
    return made


def make_client(**settings) -> TestClient:
    # Ignore any local api/.env so tests see the secure defaults
    return TestClient(create_app(Settings(_env_file=None, **settings)))


def sse(response):
    """Parses an SSE body into [(event, data)]."""
    events = []
    for block in response.text.replace("\r\n", "\n").split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line and not line.startswith(":"))
        if "event" in lines:
            events.append((lines["event"], json.loads(lines.get("data", "{}"))))
    return events


def choice(model="m", preset="openai", **extra):
    return {"provider": {"preset": preset, "api_key": SECRET, **extra}, "model": model}


OPTIONS = {"topic": "Testing software", "section_length": "short"}


# --- Config ------------------------------------------------------------------------------------


def test_config_hides_local_providers_on_public_servers():
    ids = [p["id"] for p in make_client().get("/api/config").json()["providers"]]
    assert "openai" in ids and "ollama" not in ids


def test_config_offers_local_providers_when_private_endpoints_allowed():
    config = make_client(allow_private_endpoints=True).get("/api/config").json()
    assert "ollama" in [p["id"] for p in config["providers"]]
    assert config["section_lengths"] == {"short": 500, "medium": 1000, "long": 2000}


# --- Models ------------------------------------------------------------------------------------


def test_models_lists_sorted_ids(clients):
    response = make_client().post("/api/models", json={"provider": {"preset": "openai", "api_key": SECRET}})
    assert response.json() == {"models": ["model-a", "model-b"]}
    assert clients[0].api_key == SECRET


def test_unknown_preset_is_a_clear_error(clients):
    response = make_client().post("/api/models", json={"provider": {"preset": "nope"}})
    assert response.status_code == 400
    assert "Unknown provider" in response.json()["error"]["message"]


# --- Outline -----------------------------------------------------------------------------------


def test_outline_streams_stages_outline_and_title(clients):
    response = make_client().post(
        "/api/outline", json={"outline_model": choice(), "title_model": choice(), "options": OPTIONS}
    )
    events = sse(response)
    names = [name for name, _ in events]
    assert names == ["stage", "outline", "stage", "title", "stats", "done"]
    assert dict(events)["outline"]["structure"] == OUTLINE
    assert dict(events)["title"]["title"] == "A Great Title"


# --- Sections ----------------------------------------------------------------------------------


def section_body(**overrides):
    body = {
        "model": choice(),
        "options": OPTIONS,
        "book": {
            "title": "Book",
            "structure": OUTLINE,
            "written": [{"path": ["Chapter 1"], "text": "First chapter text."}],
        },
        "path": ["Chapter 2", "Intro"],
    }
    body.update(overrides)
    return body


def test_section_streams_deltas_with_book_context(clients):
    events = sse(make_client().post("/api/sections/stream", json=section_body()))
    names = [name for name, _ in events]
    assert names[0] == "start" and names[-1] == "done" and "stats" in names
    assert "".join(data["text"] for name, data in events if name == "delta") == "Hello from the section."

    sent = clients[0].requests[0]
    user_message = sent["messages"][1]["content"]
    assert "<-- THIS SECTION" in user_message
    assert "First chapter text." in user_message  # Earlier section used as context
    assert sent["max_tokens"] == 4000  # "short" length budget


def test_section_rewrite_sends_note_and_previous_text(clients):
    body = section_body(revision={"note": "Add an example", "previous": "Old version"})
    sse(make_client().post("/api/sections/stream", json=body))
    user_message = clients[0].requests[0]["messages"][1]["content"]
    assert "Requested changes: Add an example" in user_message and "Old version" in user_message


def test_section_for_a_heading_is_an_error_event(clients):
    events = sse(make_client().post("/api/sections/stream", json=section_body(path=["Chapter 2"])))
    assert events[-1][0] == "error" and "No section" in events[-1][1]["message"]


# --- Keys never leak ---------------------------------------------------------------------------


def test_provider_errors_are_scrubbed_of_the_key(monkeypatch):
    def failing(api_key, base_url=None, requires_key=True):
        return FakeClient(fail_with=RuntimeError(f"401 Incorrect API key provided: {api_key}"))

    monkeypatch.setattr(app_module, "create_llm_client", failing)
    events = sse(make_client().post("/api/sections/stream", json=section_body()))
    name, payload = events[-1]
    assert name == "error" and payload["code"] == "auth"
    assert SECRET not in json.dumps(payload) and "[redacted]" in payload["message"]


def test_validation_errors_never_echo_the_request():
    body = section_body()
    del body["model"]["model"]  # Invalid: the error would normally include the input (with the key)
    response = make_client().post("/api/sections/stream", json=body)
    assert response.status_code == 422
    assert SECRET not in response.text


# --- Endpoint rules (SSRF) ---------------------------------------------------------------------


@pytest.fixture
def public_dns(monkeypatch):
    monkeypatch.setattr(
        security.socket, "getaddrinfo", lambda host, *a, **k: [(None, None, None, "", ("93.184.216.34", 443))]
    )


@pytest.mark.parametrize(
    "url, reason",
    [
        ("http://localhost:11434/v1", "https://"),
        ("https://127.0.0.1/v1", "Private and local"),
        ("https://10.0.0.5/v1", "Private and local"),
        ("https://[::1]/v1", "Private and local"),
        ("https://169.254.169.254/latest", "Private and local"),
        ("ftp://example.com", "look like"),
        ("https://user:pass@example.com/v1", "credentials"),
    ],
)
def test_private_and_malformed_endpoints_are_refused(clients, url, reason):
    response = make_client().post("/api/models", json={"provider": {"base_url": url}})
    assert response.status_code == 400
    assert reason in response.json()["error"]["message"]
    assert clients == []  # No request was made


def test_public_https_endpoints_are_allowed(clients, public_dns):
    response = make_client().post("/api/models", json={"provider": {"base_url": "https://llm.example.com/v1"}})
    assert response.status_code == 200
    assert clients[0].base_url == "https://llm.example.com/v1"


def test_self_hosters_can_reach_local_servers(clients):
    client = make_client(allow_private_endpoints=True)
    assert client.post("/api/models", json={"provider": {"base_url": "http://localhost:1234/v1"}}).status_code == 200
    ollama = client.post(
        "/api/models", json={"provider": {"preset": "ollama", "base_url": "http://192.168.1.20:11434/v1"}}
    )
    assert ollama.status_code == 200 and clients[-1].base_url == "http://192.168.1.20:11434/v1"


def test_local_preset_is_blocked_on_public_servers(clients):
    response = make_client().post("/api/models", json={"provider": {"preset": "ollama"}})
    assert response.status_code == 400


def test_custom_endpoints_can_be_disabled(clients, public_dns):
    response = make_client(allow_custom_endpoints=False).post(
        "/api/models", json={"provider": {"base_url": "https://llm.example.com/v1"}}
    )
    assert "only allows the built-in providers" in response.json()["error"]["message"]


# --- Limits & headers --------------------------------------------------------------------------


def test_rate_limit(clients):
    client = make_client(rate_limit_per_minute=2)
    statuses = [
        client.post("/api/models", json={"provider": {"preset": "openai", "api_key": "k"}}).status_code
        for _ in range(3)
    ]
    assert statuses == [200, 200, 429]
    assert client.get("/api/health").status_code == 200  # Only generation endpoints are limited


def test_oversized_requests_are_refused(clients):
    response = make_client(max_request_bytes=1000).post("/api/export/pdf", json={"title": "T", "markdown": "x" * 5000})
    assert response.status_code == 413


def test_security_headers_are_set():
    headers = make_client().get("/api/health").headers
    assert "script-src 'self'" in headers["content-security-policy"]
    assert headers["x-content-type-options"] == "nosniff"


# --- PDF ---------------------------------------------------------------------------------------


def test_pdf_export(clients):
    response = make_client().post("/api/export/pdf", json={"title": "T", "markdown": "# Title\n\nSome **text**."})
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF-")


# --- Serving the web app -----------------------------------------------------------------------


def test_serves_the_web_app_with_client_side_routing(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path.parent / "secret.txt").write_text("nope")
    client = make_client(web_dist=tmp_path)

    assert client.get("/").text == "<html>app</html>"
    assert client.get("/books/123").text == "<html>app</html>"  # Client-side route
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert "nope" not in client.get("/..%2Fsecret.txt").text
    assert client.get("/api/missing").status_code == 404
    assert "Swagger" not in client.get("/").text
    assert "swagger-ui" in client.get("/api/docs").text  # Docs still win over the app's catch-all
    assert client.get("/api").json()["name"] == "Infinite Bookshelf API"  # /api still describes the API


def test_root_and_api_describe_the_service_when_no_web_app_is_bundled():
    client = make_client()
    info = client.get("/api").json()
    assert info == client.get("/").json()
    assert info["name"] == "Infinite Bookshelf API"
    assert info["docs"] == "/api/docs"
    assert info["health"] == "/api/health"


# --- API docs ----------------------------------------------------------------------------------


def test_docs_are_served_locally_under_the_strict_csp():
    client = make_client()
    page = client.get("/api/docs")
    assert page.status_code == 200
    assert "script-src 'self'" in page.headers["content-security-policy"]
    assert "<script>" not in page.text  # No inline scripts
    # Scripts, styles, and fonts all come from this server, never a CDN
    for url in re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"]+)"', page.text):
        assert url.startswith("/api/docs/"), url
    for asset in (
        "vendor/swagger-ui-bundle.js",
        "vendor/swagger-ui.css",
        "static/docs.js",
        "static/docs.css",
        "static/fonts/geist-latin-wght-normal.woff2",
    ):
        assert client.get(f"/api/docs/{asset}").status_code == 200


def test_openapi_documents_the_event_streams():
    schema = make_client().get("/api/openapi.json").json()
    stream = schema["paths"]["/api/sections/stream"]["post"]
    assert "text/event-stream" in stream["responses"]["200"]["content"]
    assert {t["name"] for t in schema["tags"]} == {"Service", "Providers", "Generation", "Export"}


def test_docs_can_be_disabled():
    client = make_client(docs_enabled=False)
    assert client.get("/api/docs").status_code == 404
    assert client.get("/api/openapi.json").status_code == 404
    assert client.get("/").json()["docs"] is None
    assert client.get("/api").json()["openapi"] is None


def test_docs_examples_are_valid_requests():
    from infinite_bookshelf.server import openapi, schemas

    for examples, model in [
        (openapi.MODELS_EXAMPLES, schemas.ModelsRequest),
        (openapi.OUTLINE_EXAMPLES, schemas.OutlineRequest),
        (openapi.SECTION_EXAMPLES, schemas.SectionRequest),
        (openapi.PDF_EXAMPLES, schemas.PdfRequest),
    ]:
        for example in examples.values():
            model.model_validate(example["value"])


def test_docs_link_to_the_web_app_only_when_it_is_bundled(tmp_path):
    assert "Open app" not in make_client().get("/api/docs").text
    (tmp_path / "index.html").write_text("<html>app</html>")
    assert "Open app" in make_client(web_dist=tmp_path).get("/api/docs").text
