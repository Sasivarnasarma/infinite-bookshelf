"""
The Infinite Bookshelf API: a stateless engine for the web app.

Nothing is stored. Each request carries what it needs (including the user's API key, from
their browser), is turned into model calls, and is forgotten. Long operations stream their
progress as Server-Sent Events:

    POST /api/outline           stage → outline → stage → title → stats → done
    POST /api/sections/stream   start → delta* → stats → done
    (any of them may end with an `error` event instead)
"""

from collections.abc import Iterator
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Body, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from sse_starlette import EventSourceResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from .. import __version__
from ..engine.agents import generate_book_structure, generate_book_title, generate_section
from ..engine.agents.structure_writer import normalize_structure
from ..engine.book import Book, outline_nodes
from ..engine.client import PROVIDER_PRESETS, create_llm_client
from ..engine.client import list_models as fetch_model_ids
from ..engine.errors import InfiniteBookshelfError, error_payload
from ..engine.generation import SECTION_LENGTHS, section_inputs
from ..engine.pdf import create_pdf_file
from ..engine.stats import GenerationStatistics
from . import openapi
from .config import Settings, get_settings
from .docs import DOCS_URL, OPENAPI_URL, mount_docs
from .schemas import (
    HealthStatus,
    ModelsRequest,
    ModelsResponse,
    OutlineRequest,
    PdfRequest,
    ProviderAuth,
    ProviderPreset,
    SectionRequest,
    ServerConfig,
    ServiceInfo,
)
from .security import EndpointNotAllowed, RateLimiter, check_endpoint
from .streaming import Event, sse_events

MAX_OUTLINE_NODES = 400
SSE_PING_SECONDS = 15  # Keeps proxies from closing the connection while a model is thinking

RATE_LIMITED_PATHS = {"/api/models", "/api/outline", "/api/sections/stream", "/api/export/pdf"}

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    # API keys live in the browser's localStorage, so no third-party scripts may run on the page
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; "
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    ),
}


# --- Provider access -------------------------------------------------------------------------


def _client_for(auth: ProviderAuth, settings: Settings) -> tuple[Any, list[str]]:
    """Returns (client, secrets) for a request's provider, enforcing the endpoint rules."""
    key = auth.api_key.get_secret_value().strip()
    if auth.preset:
        preset = PROVIDER_PRESETS.get(auth.preset)
        if preset is None:
            raise ValueError(f"Unknown provider '{auth.preset}'.")
        base_url = preset["base_url"]
        if preset.get("local"):
            # Offered only where private endpoints are allowed (as GET /api/config shows); otherwise
            # its base URL would let anyone reach any address, even with custom endpoints turned off
            if not settings.allow_private_endpoints:
                raise EndpointNotAllowed(f"{preset['name']} runs on your own machine, so this server can't use it.")
            base_url = auth.base_url or base_url  # Local servers may run on another host/port
            check_endpoint(base_url, settings, is_preset=True)
        requires_key = preset.get("requires_key", True)
    else:
        if not auth.base_url:
            raise ValueError("Choose a provider or enter a base URL.")
        base_url = auth.base_url
        check_endpoint(base_url, settings)
        requires_key = False  # Many self-hosted servers don't use keys
    return create_llm_client(key, base_url, requires_key=requires_key), [key]


def _stats(stats: GenerationStatistics) -> dict[str, Any]:
    return {
        "input_tokens": stats.input_tokens,
        "output_tokens": stats.output_tokens,
        "input_time": round(stats.input_time, 3),
        "output_time": round(stats.output_time, 3),
        "total_time": round(stats.total_time, 3),
    }


# --- Event streams (run in a worker thread) ------------------------------------------------


def _outline_events(req: OutlineRequest, settings: Settings) -> Iterator[Event]:
    secrets: list[str] = []
    try:
        options = req.options.to_engine()
        yield "stage", {"stage": "outline"}
        outline_client, outline_secrets = _client_for(req.outline_model.provider, settings)
        secrets += outline_secrets
        stats, structure = generate_book_structure(
            prompt=options.topic,
            additional_instructions=options.extra_context(),
            model=req.outline_model.model,
            llm_client=outline_client,
            long=options.long_outline,
        )
        yield "outline", {"structure": structure}

        yield "stage", {"stage": "title"}
        title_client, title_secrets = _client_for(req.title_model.provider, settings)
        secrets += title_secrets
        title = generate_book_title(prompt=options.topic, model=req.title_model.model, llm_client=title_client)
        yield "title", {"title": title}
        yield "stats", _stats(stats)
        yield "done", {}
    except Exception as e:
        yield "error", error_payload(e, secrets)


def _section_events(req: SectionRequest, settings: Settings) -> Iterator[Event]:
    secrets: list[str] = []
    try:
        structure = normalize_structure(req.book.structure)
        if len(outline_nodes(structure)) > MAX_OUTLINE_NODES:
            raise ValueError(f"The outline is too large (over {MAX_OUTLINE_NODES} entries).")
        book = Book.from_written(req.book.title, structure, [(w.path, w.text) for w in req.book.written])
        revision = req.revision
        inputs = section_inputs(
            book,
            req.path,
            req.options.to_engine(),
            revision_note=revision.note if revision else None,
            previous_text=revision.previous if revision else "",
        )
        client, secrets = _client_for(req.model.provider, settings)

        yield "start", {"path": req.path}
        for chunk in generate_section(model=req.model.model, llm_client=client, **inputs):
            if isinstance(chunk, GenerationStatistics):
                yield "stats", _stats(chunk)
            elif chunk:
                yield "delta", {"text": chunk}
        yield "done", {}
    except KeyError as e:
        yield "error", error_payload(ValueError(str(e).strip("'\"")), secrets)
    except Exception as e:
        yield "error", error_payload(e, secrets)


# --- ASGI middleware -------------------------------------------------------------------------


class RequestGuard:
    """Body-size limit for every request, and the per-IP rate limit for generation endpoints."""

    def __init__(self, app: ASGIApp, settings: Settings):
        self.app = app
        self.max_bytes = settings.max_request_bytes
        self.limiter = RateLimiter(settings.rate_limit_per_minute)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path", "")
        if scope.get("method") == "POST" and path in RATE_LIMITED_PATHS:
            client_ip = (scope.get("client") or ("unknown", 0))[0]
            if not self.limiter.allow(client_ip):
                return await _json(
                    send,
                    429,
                    _error("rate_limited", "Too many requests", "Slow down a little and try again in a minute."),
                )

        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared and declared.isdigit() and int(declared) > self.max_bytes:
            return await _json(
                send, 413, _error("too_large", "Request too large", "This book is larger than this server accepts.")
            )

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise ValueError("Request body too large")
            return message

        await self.app(scope, limited_receive, send)


class SecurityHeaders:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message.get("headers", [])}
                extra = [
                    (k.lower().encode(), v.encode())
                    for k, v in SECURITY_HEADERS.items()
                    if k.lower().encode() not in existing
                ]
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receive, send_with_headers)


def _error(code: str, title: str, hint: str, message: str = "") -> dict[str, Any]:
    return {"error": {"code": code, "title": title, "message": message or title, "hint": hint}}


async def _json(send: Send, status: int, body: dict[str, Any]) -> None:
    response = JSONResponse(body, status_code=status)
    await response({"type": "http"}, None, send)  # type: ignore[arg-type]


# --- App -------------------------------------------------------------------------------------


def create_app(settings: Settings = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(
        title="Infinite Bookshelf API",
        version=__version__,
        summary=openapi.SUMMARY,
        description=openapi.description(settings),
        openapi_tags=openapi.TAGS,
        license_info={"name": "MIT", "identifier": "MIT"},
        contact={"name": "Infinite Bookshelf on GitHub", "url": openapi.REPO_URL},
        # Operation ids are the function names: stream_section, not stream_section_api_sections_stream_post
        generate_unique_id_function=lambda route: route.name,
        # The docs page is our own (see docs.py); FastAPI's would break the CSP
        docs_url=None,
        redoc_url=None,
        openapi_url=OPENAPI_URL if settings.docs_enabled else None,
    )
    app.state.settings = settings

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Never echo request input back: it can contain API keys
        problems = [f"{'.'.join(str(p) for p in err['loc'][1:])}: {err['msg']}" for err in exc.errors()]
        return JSONResponse(_error("invalid_input", "Invalid request", "", "; ".join(problems)), status_code=422)

    @app.exception_handler(EndpointNotAllowed)
    async def endpoint_not_allowed(request: Request, exc: EndpointNotAllowed):
        return JSONResponse(_error("endpoint_not_allowed", "Endpoint not allowed", "", str(exc)), status_code=400)

    @app.exception_handler(InfiniteBookshelfError)
    async def provider_error(request: Request, exc: InfiniteBookshelfError):
        return JSONResponse({"error": error_payload(exc)}, status_code=502)

    @app.exception_handler(ValueError)
    async def bad_value(request: Request, exc: ValueError):
        return JSONResponse({"error": error_payload(exc)}, status_code=400)

    api = APIRouter(prefix="/api")

    @api.get("", response_model=ServiceInfo, tags=["Service"], summary="About this service")
    def service_info() -> ServiceInfo:
        """Name, version, and where to find the docs."""
        return _service_info(app.title, settings)

    @api.get("/health", response_model=HealthStatus, tags=["Service"], summary="Health check")
    def health() -> HealthStatus:
        """Returns `ok` while the server is running. Used by the Docker health check."""
        return HealthStatus(version=__version__)

    @api.get("/config", response_model=ServerConfig, tags=["Service"], summary="Server configuration")
    def server_config() -> ServerConfig:
        """Built-in providers and what this server allows (custom and private endpoints, limits)."""
        presets = [
            ProviderPreset(id=pid, **{k: v for k, v in p.items() if k in ProviderPreset.model_fields})
            for pid, p in PROVIDER_PRESETS.items()
            if settings.allow_private_endpoints or not p.get("local")
        ]
        return ServerConfig(
            version=__version__,
            providers=presets,
            allow_custom_endpoints=settings.allow_custom_endpoints,
            allow_private_endpoints=settings.allow_private_endpoints,
            section_lengths={name: words for name, (words, _) in SECTION_LENGTHS.items()},
        )

    @api.post(
        "/models",
        response_model=ModelsResponse,
        tags=["Providers"],
        summary="List models",
        responses=openapi.errors(400, 413, 422, 429, 502),
    )
    def list_models(req: Annotated[ModelsRequest, Body(openapi_examples=openapi.MODELS_EXAMPLES)]) -> ModelsResponse:
        """
        Lists a provider's models, sorted. It's also the quickest way to check that a key or a
        custom endpoint works.
        """
        client, secrets = _client_for(req.provider, settings)
        try:
            return ModelsResponse(models=fetch_model_ids(client))
        except Exception as e:
            return JSONResponse({"error": error_payload(e, secrets)}, status_code=502)

    @api.post(
        "/outline",
        tags=["Generation"],
        summary="Draft an outline and title",
        response_class=EventSourceResponse,
        responses=openapi.event_stream(
            "A stream of events: `stage`, `outline`, `stage`, `title`, `stats`, then `done`, or `error` at any point.",
            openapi.OUTLINE_STREAM,
            413,
            422,
            429,
        ),
    )
    async def stream_outline(
        req: Annotated[OutlineRequest, Body(openapi_examples=openapi.OUTLINE_EXAMPLES)],
    ) -> EventSourceResponse:
        """
        Drafts the book's outline with `outline_model`, then its title with `title_model`. The two
        can use different providers.

        The `outline` event carries the structure: each heading maps either to a short description
        (a section to write) or to more headings (a chapter). Edit it freely before writing.
        """
        return EventSourceResponse(sse_events(_outline_events(req, settings)), ping=SSE_PING_SECONDS)

    @api.post(
        "/sections/stream",
        tags=["Generation"],
        summary="Write one section",
        response_class=EventSourceResponse,
        responses=openapi.event_stream(
            "A stream of events: `start`, a `delta` for each piece of text, `stats`, then `done`, or `error` at any point.",
            openapi.SECTION_STREAM,
            413,
            422,
            429,
        ),
    )
    async def stream_section(
        req: Annotated[SectionRequest, Body(openapi_examples=openapi.SECTION_EXAMPLES)],
    ) -> EventSourceResponse:
        """
        Writes the section at `path`, streaming its text as the model generates it. Append each
        `delta` to build the section.

        - **Context:** send the sections already finished in `book.written`. The model sees the
          outline and a digest of them, so chapters build on each other instead of repeating.
        - **Rewrite:** add `revision` with a note and the current text.
        - **Pause:** close the connection. The model call stops; send the request again to restart
          the section.
        """
        return EventSourceResponse(sse_events(_section_events(req, settings)), ping=SSE_PING_SECONDS)

    @api.post(
        "/export/pdf",
        tags=["Export"],
        summary="Export to PDF",
        response_class=Response,
        responses={
            200: {
                "description": "The book as a PDF.",
                "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}},
            },
            **openapi.errors(413, 422, 429),
        },
    )
    def export_pdf(req: Annotated[PdfRequest, Body(openapi_examples=openapi.PDF_EXAMPLES)]) -> Response:
        """Renders a book's Markdown to PDF. Raw HTML is sanitised and nothing remote is fetched."""
        pdf = create_pdf_file(req.markdown).getvalue()
        return Response(pdf, media_type="application/pdf")

    app.include_router(api)
    # Docs first: the web app's catch-all route must not shadow them
    web_bundled = _has_web_app(settings.web_dist)
    if settings.docs_enabled:
        mount_docs(app, app_url="/" if web_bundled else None)
    if web_bundled:
        _mount_web_app(app, Path(settings.web_dist))
    else:
        _add_service_root(app, settings)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )
    app.add_middleware(RequestGuard, settings=settings)
    app.add_middleware(SecurityHeaders)
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=settings.trusted_proxies)
    return app


def _service_info(title: str, settings: Settings) -> ServiceInfo:
    return ServiceInfo(
        name=title,
        version=__version__,
        docs=DOCS_URL if settings.docs_enabled else None,
        openapi=OPENAPI_URL if settings.docs_enabled else None,
        health="/api/health",
    )


def _add_service_root(app: FastAPI, settings: Settings) -> None:
    """Without the web app (API-only or development), "/" describes the service like "/api"."""

    @app.get("/", response_model=ServiceInfo, tags=["Service"], summary="About this service (root)")
    def service_root() -> ServiceInfo:
        """Same as `GET /api`. Serves the web app instead when it is bundled."""
        return _service_info(app.title, settings)


def _has_web_app(dist: Path | None) -> bool:
    return bool(dist) and (Path(dist) / "index.html").is_file()


def _mount_web_app(app: FastAPI, dist: Path) -> None:
    """Serves the built web app, with client-side routes falling back to index.html."""
    dist = dist.resolve()
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def web_app(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            return JSONResponse(_error("not_found", "Not found", ""), status_code=404)
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(dist):
            return FileResponse(candidate)
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})
