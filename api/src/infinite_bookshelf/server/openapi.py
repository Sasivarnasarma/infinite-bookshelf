"""
What the API docs say: the overview, tags, error responses, and ready-to-run examples.

Kept apart from app.py so the routes stay readable. Everything here ends up in
/api/openapi.json and on the Swagger page at /api/docs.
"""

from collections.abc import Iterable
from typing import Any

from .config import Settings
from .schemas import ErrorResponse

REPO_URL = "https://github.com/Sasivarnasarma/infinite-bookshelf"

SUMMARY = "Turn a topic into a complete book, written live by the AI model of your choice."


def description(settings: Settings) -> str:
    """The overview at the top of the docs, including this server's own limits."""
    rate = (
        f"{settings.rate_limit_per_minute} generation requests per minute per IP"
        if settings.rate_limit_per_minute
        else "no rate limit"
    )
    size = f"{settings.max_request_bytes / 1_000_000:g} MB per request"
    custom = "allowed" if settings.allow_custom_endpoints else "disabled"
    private = "allowed" if settings.allow_private_endpoints else "blocked"
    return f"""
The stateless engine behind [Infinite Bookshelf]({REPO_URL}). It drafts an outline for any
topic, then writes each section with the provider and model you choose, streaming the text as it
is generated.

## Quick start

1. **Pick a provider.** `GET /api/config` lists the built-in ones (OpenAI, Gemini, Groq, ...).
2. **Check your key.** `POST /api/models` lists the provider's models.
3. **Draft the outline.** `POST /api/outline` streams the outline, then a title.
4. **Write the sections.** Call `POST /api/sections/stream` once per section, in order, sending
   the sections already written so each one builds on the last.
5. **Export.** `POST /api/export/pdf` turns the finished Markdown into a PDF.

## Your API key

There are no accounts and no `Authorization` header. Your provider key goes in the request body
as `provider.api_key`. It's used for that request only and is **never stored or logged**, and
it's scrubbed from any error message.

## Streaming

The two generation endpoints answer with
[Server-Sent Events](https://developer.mozilla.org/docs/Web/API/Server-sent_events/Using_server-sent_events):
`event:` and `data:` lines, with JSON data. They are `POST` requests, so read them with
`fetch`, or with curl's `-N` flag:

```bash
curl -N http://localhost:9752/api/sections/stream \\
  -H "Content-Type: application/json" -d @section.json
```

"Try it out" on this page waits for the stream to finish, then shows every event.

## Errors

Every error is JSON in the same shape: `{{"error": {{"code", "title", "message", "hint", "detail"}}}}`.
Inside a stream, the same object arrives as an `error` event, which ends the stream.

## This server

{rate} · {size} · custom endpoints {custom} · private network addresses {private}
""".strip()


TAGS = [
    {"name": "Service", "description": "What this server is and what it allows."},
    {"name": "Providers", "description": "Check a key and list a provider's models."},
    {
        "name": "Generation",
        "description": "Write the outline and the sections, streamed live as Server-Sent Events.",
        "externalDocs": {"description": "How streaming works", "url": f"{REPO_URL}/blob/main/docs/architecture.md"},
    },
    {"name": "Export", "description": "Turn a finished book into a file."},
]

_ERRORS = {
    400: "The request can't be used: an unknown provider, a missing setting, or an endpoint this server doesn't allow.",
    413: "The request body is larger than this server accepts.",
    422: "The body doesn't match the schema. The request is never echoed back, since it may contain a key.",
    429: "Too many requests from your address. Wait a minute and try again.",
    502: "The AI provider returned an error (bad key, rate limit, unknown model, ...).",
}


_ERROR_EXAMPLES = {
    400: ("endpoint_not_allowed", "Endpoint not allowed", "This server only connects to https:// endpoints.", ""),
    413: ("too_large", "Request too large", "Request too large", "This book is larger than this server accepts."),
    422: ("invalid_input", "Invalid request", "options.topic: String should have at least 3 characters", ""),
    429: ("rate_limited", "Too many requests", "Too many requests", "Slow down a little and try again in a minute."),
    502: (
        "auth",
        "Authentication failed",
        "Incorrect API key provided: [redacted]",
        "Check this provider's API key in Settings (use Test connection to verify it).",
    ),
}


def errors(*codes: int) -> dict[int, dict[str, Any]]:
    """Error responses, each with a realistic example of that error."""
    responses = {}
    for code in codes:
        error_code, title, message, hint = _ERROR_EXAMPLES[code]
        example = {"error": {"code": error_code, "title": title, "message": message, "hint": hint}}
        responses[code] = {
            "model": ErrorResponse,
            "description": _ERRORS[code],
            "content": {"application/json": {"example": example}},
        }
    return responses


def event_stream(description: str, example: str, *error_codes: int) -> dict[int, dict[str, Any]]:
    """A Server-Sent Events response, plus the errors that can come before the stream starts."""
    return {
        200: {
            "description": description,
            "content": {"text/event-stream": {"schema": {"type": "string"}, "example": example}},
        },
        **errors(*error_codes),
    }


def _events(*events: Iterable[str]) -> str:
    return "".join(f"event: {name}\ndata: {data}\n\n" for name, data in events)


OUTLINE_STREAM = _events(
    ("stage", '{"stage": "outline"}'),
    (
        "outline",
        '{"structure": {"Origins": "Where tea began", "Tea and Empire": {"The Opium Wars": "Trade and conflict"}}}',
    ),
    ("stage", '{"stage": "title"}'),
    ("title", '{"title": "Steeped: A Short History of Tea"}'),
    ("stats", '{"input_tokens": 120, "output_tokens": 340, "input_time": 0.2, "output_time": 1.9, "total_time": 2.1}'),
    ("done", "{}"),
)

SECTION_STREAM = _events(
    ("start", '{"path": ["Origins"]}'),
    ("delta", '{"text": "Legend credits the emperor Shennong "}'),
    ("delta", '{"text": "with the first cup, around 2737 BCE..."}'),
    (
        "stats",
        '{"input_tokens": 900, "output_tokens": 1200, "input_time": 0.4, "output_time": 13.8, "total_time": 14.2}',
    ),
    ("done", "{}"),
)

# --- Request examples (the "Try it out" bodies) ----------------------------------------------

_OPENAI = {"preset": "openai", "api_key": "YOUR_API_KEY"}
_OPTIONS = {"topic": "The history of tea", "style": "Storytelling", "complexity": "Beginner", "section_length": "short"}
_OUTLINE = {"Origins": "Where tea began", "Tea and Empire": {"The Opium Wars": "Trade and conflict"}}

MODELS_EXAMPLES = {
    "preset": {"summary": "A built-in provider", "value": {"provider": _OPENAI}},
    "custom": {
        "summary": "Any OpenAI-compatible API",
        "value": {"provider": {"base_url": "https://api.together.xyz/v1", "api_key": "YOUR_API_KEY"}},
    },
}

OUTLINE_EXAMPLES = {
    "one": {
        "summary": "One provider for everything",
        "value": {
            "outline_model": {"provider": _OPENAI, "model": "gpt-4o-mini"},
            "title_model": {"provider": _OPENAI, "model": "gpt-4o-mini"},
            "options": _OPTIONS,
        },
    },
    "mixed": {
        "summary": "Gemini for the outline, Groq for the title",
        "value": {
            "outline_model": {
                "provider": {"preset": "gemini", "api_key": "YOUR_GEMINI_KEY"},
                "model": "gemini-2.5-flash",
            },
            "title_model": {
                "provider": {"preset": "groq", "api_key": "YOUR_GROQ_KEY"},
                "model": "llama-3.3-70b-versatile",
            },
            "options": {**_OPTIONS, "long_outline": True, "instructions": "Include a chapter on tea ceremonies."},
        },
    },
}

_SECTION = {
    "model": {"provider": _OPENAI, "model": "gpt-4o-mini"},
    "options": _OPTIONS,
    "book": {"title": "Steeped: A Short History of Tea", "structure": _OUTLINE, "written": []},
    "path": ["Origins"],
}

SECTION_EXAMPLES = {
    "first": {"summary": "Write the first section", "value": _SECTION},
    "next": {
        "summary": "Write a later section, with context",
        "value": {
            **_SECTION,
            "book": {
                **_SECTION["book"],
                "written": [{"path": ["Origins"], "text": "Legend credits the emperor Shennong..."}],
            },
            "path": ["Tea and Empire", "The Opium Wars"],
        },
    },
    "rewrite": {
        "summary": "Rewrite a section with a note",
        "value": {
            **_SECTION,
            "revision": {
                "note": "Add a short timeline at the end",
                "previous": "Legend credits the emperor Shennong...",
            },
        },
    },
}

PDF_EXAMPLES = {
    "book": {
        "summary": "A short book",
        "value": {
            "title": "Steeped: A Short History of Tea",
            "markdown": "# Steeped: A Short History of Tea\n\n## Origins\n\nLegend credits the emperor Shennong with the first cup...",
        },
    },
}
