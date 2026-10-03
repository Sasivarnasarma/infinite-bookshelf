"""Run the API: `uv run infinite-bookshelf-api` (or `python -m infinite_bookshelf.server`)."""

import uvicorn

from .config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "infinite_bookshelf.server.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        proxy_headers=True,  # Trust X-Forwarded-For from the reverse proxy for rate limiting
        log_level="info",
    )


if __name__ == "__main__":
    main()
