"""Run the API: `uv run infinite-bookshelf-api` (or `python -m infinite_bookshelf.server`).

`--reload` restarts the server whenever the code changes (for development; `pnpm dev` uses it).
`--serve-web` also serves the built web app, like the Docker image (`pnpm start` uses it).
"""

import argparse
import os
from pathlib import Path

import uvicorn

from .config import checkout_web_dist, get_settings

PACKAGE_DIR = Path(__file__).resolve().parent.parent

# Where --serve-web listens unless IB_HOST / IB_PORT are set: the same as the Docker image
SERVE_HOST = "0.0.0.0"
SERVE_PORT = 9752


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="infinite-bookshelf-api", description="Run the Infinite Bookshelf API.")
    parser.add_argument("--reload", action="store_true", help="restart when the code changes (development)")
    parser.add_argument(
        "--serve-web",
        action="store_true",
        help=f"also serve the built web app (pnpm build), on {SERVE_HOST}:{SERVE_PORT} unless IB_HOST/IB_PORT are set",
    )
    args = parser.parse_args(argv)

    settings = get_settings()
    host, port = settings.host, settings.port
    if args.serve_web:
        dist = settings.web_dist or checkout_web_dist()
        if dist is None or not (Path(dist) / "index.html").is_file():
            parser.error(f"no built web app in {dist or 'IB_WEB_DIST'}: run `pnpm build` first, or set IB_WEB_DIST")
        # The app reads its settings again when uvicorn creates it, possibly in another process
        os.environ["IB_WEB_DIST"] = str(Path(dist).resolve())
        get_settings.cache_clear()
        if "host" not in settings.model_fields_set:
            host = SERVE_HOST
        if "port" not in settings.model_fields_set:
            port = SERVE_PORT

    uvicorn.run(
        "infinite_bookshelf.server.app:create_app",
        factory=True,
        host=host,
        port=port,
        proxy_headers=False,  # The app reads X-Forwarded-For itself, from IB_TRUSTED_PROXIES only
        log_level="info",
        reload=args.reload,
        reload_dirs=[str(PACKAGE_DIR)] if args.reload else None,
    )


if __name__ == "__main__":
    main()
