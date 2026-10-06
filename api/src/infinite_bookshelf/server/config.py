"""
Server configuration, from environment variables prefixed with IB_ (or a .env file).

Defaults are safe for a public instance. Self-hosters running on their own machine usually set
IB_ALLOW_PRIVATE_ENDPOINTS=true so local servers (Ollama, LM Studio) work.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IB_", env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8000

    # Custom endpoints: user-supplied base URLs for OpenAI-compatible servers
    allow_custom_endpoints: bool = True
    # Private/loopback/link-local addresses (localhost, 192.168.x.x, ...). Keep off on a public
    # instance, or users could make the server send requests into its own network.
    allow_private_endpoints: bool = False

    # Requests per minute per client IP for generation endpoints (0 = unlimited)
    rate_limit_per_minute: int = 0
    # Largest accepted request body; a section request carries the book written so far
    max_request_bytes: int = 8_000_000

    # Interactive API docs at /api/docs and the schema at /api/openapi.json
    docs_enabled: bool = True

    # Extra origins allowed to call the API from a browser (the bundled web app needs none)
    cors_origins: list[str] = []
    # Built web app to serve at "/" (the Docker image sets this); None = API only
    web_dist: Path | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
