# Infinite Bookshelf API

The backend of [Infinite Bookshelf](../README.md): a **stateless** FastAPI service that turns a
topic into a book and streams each section live as Server-Sent Events. It stores nothing; books
and API keys live in the user's browser and arrive with each request.

```bash
uv sync
uv run infinite-bookshelf-api     # http://127.0.0.1:8000, interactive docs at /api/docs
uv run pytest
```

## Endpoints

| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Liveness check |
| GET | `/api/config` | Built-in providers and what this server allows |
| POST | `/api/models` | Lists a provider's models (also tests the key) |
| POST | `/api/outline` | Streams the outline and title (SSE) |
| POST | `/api/sections/stream` | Streams one section, with the book so far as context (SSE) |
| POST | `/api/export/pdf` | Renders Markdown to PDF |

Configuration (`IB_*` environment variables, or `api/.env`) is documented in
[docs/self-hosting.md](../docs/self-hosting.md); the design in
[docs/architecture.md](../docs/architecture.md).
