# Self-hosting

Infinite Bookshelf runs as a single container: the API serves the built web app on one port.

## Docker Compose

```bash
docker compose up -d
```

Open http://localhost:8000. The bundled `docker-compose.yml` is set up for a private server: it
allows local model servers, so Ollama running on the same machine is reachable at
`http://host.docker.internal:11434/v1` (set this as the Ollama base URL in **Settings**).

## Docker

```bash
docker run -p 8000:8000 -e IB_ALLOW_PRIVATE_ENDPOINTS=true ghcr.io/sasivarnasarma/infinite-bookshelf
```

To build the image yourself: `docker build -t infinite-bookshelf .`

## PDF export

The image includes everything PDF export needs: WeasyPrint with Pango and HarfBuzz, and DejaVu
fonts for characters the bundled book fonts (Literata and Geist, Latin only) don't cover. Running
from source instead, install Pango with your package manager (`apt install libpango-1.0-0
libpangoft2-1.0-0 libharfbuzz-subset0`, `brew install pango`). If it's missing, exports still
work through a simpler fallback writer, with maths as plain text.

## Configuration

All settings are environment variables prefixed with `IB_`:

| Variable | Default | Meaning |
|---|---|---|
| `IB_HOST` / `IB_PORT` | `127.0.0.1` / `8000` | Listen address (the Docker image uses `0.0.0.0`) |
| `IB_ALLOW_CUSTOM_ENDPOINTS` | `true` | Let users add their own OpenAI-compatible base URLs |
| `IB_ALLOW_PRIVATE_ENDPOINTS` | `false` | Allow localhost and private network addresses (Ollama, LM Studio) |
| `IB_RATE_LIMIT_PER_MINUTE` | `0` | Generation requests per minute per client IP (`0` = unlimited) |
| `IB_MAX_REQUEST_BYTES` | `8000000` | Largest accepted request body |
| `IB_CORS_ORIGINS` | `[]` | Extra browser origins allowed to call the API (JSON list) |
| `IB_WEB_DIST` | unset | Folder of the built web app to serve at `/` (set in the image) |
| `IB_DOCS_ENABLED` | `true` | Interactive API docs at `/api/docs` and the schema at `/api/openapi.json` |

## Running a public instance

If people other than you will use the instance:

1. Keep `IB_ALLOW_PRIVATE_ENDPOINTS=false` (the default), so users can't make the server call
   addresses inside your network.
2. Set a rate limit, e.g. `IB_RATE_LIMIT_PER_MINUTE=30`.
3. Put it behind a reverse proxy that terminates HTTPS (Caddy, nginx, Traefik, or a tunnel). The
   server trusts `X-Forwarded-For` from the proxy for rate limiting.
4. As a second line of defence, block outbound traffic from the container to private IP ranges at
   the network level.
5. Keep streaming responses unbuffered at the proxy (the API sends `X-Accel-Buffering: no`, which
   nginx honours).

Users' API keys pass through your server on each request but are never stored or logged. Tell
your users that, and link them to the **Privacy** section of the home page (`/#privacy`).
