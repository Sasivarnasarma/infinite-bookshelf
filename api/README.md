# Infinite Bookshelf API

The backend of [Infinite Bookshelf](../README.md): a **stateless** FastAPI service that turns a
topic into a book and streams each section live as Server-Sent Events. It stores nothing; books
and API keys live in the user's browser and arrive with each request.

```bash
uv sync
uv run infinite-bookshelf-api     # http://127.0.0.1:8000
uv run pytest
```

**Interactive docs** (Swagger UI) are at [`/api/docs`](http://127.0.0.1:8000/api/docs) and the
OpenAPI schema at `/api/openapi.json`. Swagger is served from this server, not a CDN, so it works
offline and under the strict Content-Security-Policy. Turn both off with `IB_DOCS_ENABLED=false`.

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api` | Name, version, and links to the docs |
| GET | `/` | Same as `/api` when the web app isn't bundled; otherwise the web app |
| GET | `/api/health` | Liveness check |
| GET | `/api/config` | Built-in providers and what this server allows |
| POST | `/api/models` | Lists a provider's models (also tests the key) |
| POST | `/api/outline` | Streams the outline and title (SSE) |
| POST | `/api/sections/stream` | Streams one section, with the book so far as context (SSE) |
| POST | `/api/export/pdf` | Renders a book's Markdown to a typeset PDF |

**PDF export** uses WeasyPrint, which needs the Pango libraries (in the Docker image already).
Without them (often on Windows) it falls back to fpdf2: lists, headings and tables still work,
maths is written as Unicode text. See [docs/architecture.md](../docs/architecture.md#pdf-export).

Configuration (`IB_*` environment variables, or `api/.env`) is documented in
[docs/self-hosting.md](../docs/self-hosting.md); the design in
[docs/architecture.md](../docs/architecture.md).
