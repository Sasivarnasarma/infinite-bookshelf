# Infinite Bookshelf: one image with the API and the built web app.
#   docker build -t infinite-bookshelf .
#   docker run -p 8000:8000 infinite-bookshelf          → http://localhost:8000

# ---- 1. Build the web app ---------------------------------------------------------------------
FROM node:25-slim AS web
RUN corepack enable
WORKDIR /app
# Workspace manifests first, so dependency installs are cached until they change
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @infinite-bookshelf/web
COPY web/ web/
RUN pnpm --filter @infinite-bookshelf/web build

# ---- 2. Runtime: Python API serving the web app -----------------------------------------------
FROM python:3.12-slim AS runtime

# Native libraries for WeasyPrint (PDF export) and a basic font set
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app/api
# Dependencies first, so code changes don't reinstall them
COPY api/pyproject.toml api/uv.lock api/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY api/src ./src
RUN uv sync --frozen --no-dev

COPY --from=web /app/web/dist /app/web-dist

RUN useradd --create-home --uid 1000 bookshelf
USER bookshelf

ENV PATH="/app/api/.venv/bin:$PATH" \
    IB_HOST=0.0.0.0 \
    IB_PORT=8000 \
    IB_WEB_DIST=/app/web-dist
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

CMD ["infinite-bookshelf-api"]
