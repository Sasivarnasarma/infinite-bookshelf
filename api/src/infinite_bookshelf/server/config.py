"""
Server configuration, from environment variables prefixed with IB_ (Infinite Bookshelf), or a
.env file: the project root's (shared with docker-compose.yml), then api/.env, which wins.

Defaults are safe for a public instance. Self-hosters running on their own machine usually set
IB_ALLOW_PRIVATE_ENDPOINTS=true so local servers (Ollama, LM Studio) work.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IB_", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8000

    # Custom endpoints: user-supplied base URLs for OpenAI-compatible servers
    allow_custom_endpoints: bool = True
    # Private/loopback/link-local addresses (localhost, 192.168.x.x, ...). Keep off on a public
    # instance, or users could make the server send requests into its own network.
    allow_private_endpoints: bool = False

    # Requests per minute per client IP for generation endpoints (0 = unlimited)
    rate_limit_per_minute: int = 0
    # Proxies whose X-Forwarded-For header is trusted for the client IP: comma-separated addresses
    # or networks, or "*". Others can't fake their IP to dodge the rate limit.
    trusted_proxies: str = "127.0.0.1"
    # Largest accepted request body; a section request carries the book written so far
    max_request_bytes: int = 8_000_000

    # Interactive API docs at /api/docs and the schema at /api/openapi.json
    docs_enabled: bool = True

    # Extra origins allowed to call the API from a browser (the bundled web app needs none)
    cors_origins: list[str] = []
    # Built web app to serve at "/" (the Docker image sets this); None = API only
    web_dist: Path | None = None


def env_files(cwd: Path | None = None) -> tuple[Path, ...]:
    """
    The .env files to read, lowest priority first. The API runs from api/ in development, so the
    project root's .env is one level up (recognised by pnpm-workspace.yaml, so a stray .env above
    some other checkout is never read). Real environment variables override both.
    """
    cwd = cwd or Path.cwd()
    files = [cwd / ".env"]
    if (cwd.parent / "pnpm-workspace.yaml").is_file():
        files.insert(0, cwd.parent / ".env")
    return tuple(files)


@lru_cache
def get_settings() -> Settings:
    return Settings(_env_file=env_files())
