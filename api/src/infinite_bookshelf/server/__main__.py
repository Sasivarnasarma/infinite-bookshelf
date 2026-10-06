"""Run the API: `uv run infinite-bookshelf-api` (or `python -m infinite_bookshelf.server`).

`--reload` restarts the server whenever the code changes (for development; `pnpm dev` uses it).
"""

import argparse
from pathlib import Path

import uvicorn

from .config import get_settings

PACKAGE_DIR = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser(prog="infinite-bookshelf-api", description="Run the Infinite Bookshelf API.")
    parser.add_argument("--reload", action="store_true", help="restart when the code changes (development)")
    args = parser.parse_args()

    settings = get_settings()
    uvicorn.run(
        "infinite_bookshelf.server.app:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        proxy_headers=True,  # Trust X-Forwarded-For from the reverse proxy for rate limiting
        log_level="info",
        reload=args.reload,
        reload_dirs=[str(PACKAGE_DIR)] if args.reload else None,
    )


if __name__ == "__main__":
    main()
