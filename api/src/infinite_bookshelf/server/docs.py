"""
Interactive API docs (Swagger UI) served entirely from this server.

FastAPI's built-in docs page loads Swagger from a CDN and starts it with an inline script; both
are blocked by our Content-Security-Policy, and rightly so: the docs share an origin with the web
app, whose users keep API keys in localStorage. So the Swagger files come from the
`fastapi-offline` package, the page is started by a script file of our own (static/docs.js),
and static/docs.css restyles it to match the web app, in light and dark.
"""

from html import escape
from pathlib import Path
from typing import Optional

import fastapi_offline
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from .openapi import REPO_URL, SUMMARY

DOCS_URL = "/api/docs"
OPENAPI_URL = "/api/openapi.json"

_VENDOR_DIR = Path(fastapi_offline.__file__).parent / "static"
_STATIC_DIR = Path(__file__).parent / "static"

_ICON_SUN = '<path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>'
_ICON_MOON = '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>'
_ICON_SYSTEM = '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'
_ICON_GITHUB = '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>'
_ICON_COPY = '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'
_ICON_ARROW = '<path d="M7 17 17 7M8 7h9v9"/>'
_ICON_DOWN = '<path d="M12 5v14M19 12l-7 7-7-7"/>'


def _icon(paths: str, cls: str = "") -> str:
    attrs = f' class="{cls}"' if cls else ""
    return (
        f'<svg{attrs} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
        f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths}</svg>'
    )


_PAGE = """<!doctype html>
<html lang="en" class="ib-docs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{title}</title>
  <link rel="icon" href="{docs}/static/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="{docs}/static/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="{docs}/vendor/swagger-ui.css">
  <link rel="stylesheet" href="{docs}/static/docs.css">
  <script src="{docs}/static/docs.js"></script>
</head>
<body>
  <header class="ib-bar">
    <div class="ib-bar__inner">
      <a class="ib-brand" href="{docs}">
        <img src="{docs}/static/favicon.svg" alt="" width="28" height="28">
        <span class="ib-brand__name">Infinite Bookshelf</span>
        <span class="ib-pill">API</span>
      </a>
      <nav class="ib-nav" aria-label="Links">
        {app_link}
        <a href="{openapi}" target="_blank" rel="noopener">openapi.json</a>
        <a href="{repo}" target="_blank" rel="noopener" class="ib-icon-link" aria-label="GitHub">{github}</a>
        <button type="button" class="ib-theme" id="ib-theme" aria-label="Theme" title="Theme">
          <span data-theme-icon="system">{system}</span>
          <span data-theme-icon="light">{sun}</span>
          <span data-theme-icon="dark">{moon}</span>
        </button>
      </nav>
    </div>
  </header>

  <section class="ib-hero">
    <div class="ib-hero__inner">
      <p class="ib-eyebrow">v{version} &middot; OpenAPI 3.1<span class="ib-eyebrow__extra"> &middot; REST + Server-Sent Events</span></p>
      <h1>Infinite Bookshelf <span>API</span></h1>
      <p class="ib-lead">{summary}</p>
      <div class="ib-base">
        <span class="ib-base__label">Base URL</span>
        <code id="ib-base-url">/api</code>
        <button type="button" class="ib-copy" id="ib-copy" aria-label="Copy base URL" title="Copy">{copy}</button>
      </div>
      <div><button type="button" class="ib-jump" id="ib-jump">Browse endpoints {down}</button></div>
      <ul class="ib-features">
        <li><strong>Stateless</strong><span>No accounts, no database. Each request carries what it needs.</span></li>
        <li><strong>Your key, per request</strong><span>Sent in the body, used once, never stored or logged.</span></li>
        <li><strong>Live streaming</strong><span>Outlines and sections arrive as they are written.</span></li>
      </ul>
    </div>
  </section>

  <main id="swagger-ui" data-openapi="{openapi}"></main>

  <footer class="ib-footer">
    <span>Infinite Bookshelf &middot; MIT licence</span>
    <span>Docs by <a href="https://github.com/swagger-api/swagger-ui" target="_blank" rel="noopener">Swagger UI</a></span>
  </footer>

  <script src="{docs}/vendor/swagger-ui-bundle.js"></script>
</body>
</html>
"""


def mount_docs(app: FastAPI, app_url: Optional[str] = None) -> None:
    """
    Adds the Swagger UI page and its assets. The OpenAPI schema itself is served by FastAPI.
    `app_url` links to the web app when this server also serves it.
    """
    app.mount(f"{DOCS_URL}/vendor", StaticFiles(directory=_VENDOR_DIR), name="docs-vendor")
    app.mount(f"{DOCS_URL}/static", StaticFiles(directory=_STATIC_DIR), name="docs-static")
    app_link = f'<a href="{escape(app_url)}" class="ib-nav__app">Open app {_icon(_ICON_ARROW)}</a>' if app_url else ""
    page = _PAGE.format(
        title=escape(f"{app.title} · Docs"),
        docs=DOCS_URL,
        openapi=OPENAPI_URL,
        repo=REPO_URL,
        version=escape(__version__),
        summary=escape(SUMMARY),
        app_link=app_link,
        github=_icon(_ICON_GITHUB),
        system=_icon(_ICON_SYSTEM),
        sun=_icon(_ICON_SUN),
        moon=_icon(_ICON_MOON),
        copy=_icon(_ICON_COPY),
        down=_icon(_ICON_DOWN),
    )

    @app.get(DOCS_URL, include_in_schema=False)
    def swagger_ui() -> HTMLResponse:
        return HTMLResponse(page)
