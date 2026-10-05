# Architecture

Infinite Bookshelf is two parts that ship as one Docker image:

```
Browser (web/, React)                          Server (api/, FastAPI)
├─ API keys + settings → localStorage          ├─ GET  /api/config           providers, server rules
├─ books               → IndexedDB (Dexie)     ├─ POST /api/models           list models / test a key
├─ the book loop: next section, pause,         ├─ POST /api/outline          SSE: outline, then title
│  resume, rewrite (lib/runner.ts)             ├─ POST /api/sections/stream  SSE: one section, live
└─ sends key + inputs with each request ─────► └─ POST /api/export/pdf       Markdown → PDF
```

## Design principles

- **The server is stateless.** No database, no accounts, no sessions. Every request carries what
  it needs, including the user's API key, and nothing is kept afterwards.
- **The browser owns the data.** Books live in IndexedDB; keys in localStorage (or sessionStorage
  when "Remember my keys" is off). Backups are JSON files the user downloads.
- **The browser drives generation.** It decides which section to write next and calls the API once
  per section. Pause simply aborts the current request; Resume continues with the first unfinished
  section. A half-written section is discarded and rewritten.
- **The browser picks the API key.** A service can hold several labelled keys. Books store only
  service + model; each request uses the first key, or the next in turn with "Rotate keys" on. If a
  key is rejected, rate-limited or out of quota, or can't use the model, the same request is retried
  with the next key ("Switch keys when one fails"), and the failing key is tried last for a while.
  The server just uses whichever key arrives with the request.

## The API (`api/`)

```
api/src/infinite_bookshelf/
├── engine/          pure book-writing logic, no web code
│   ├── agents/      outline, title, and section writers (prompts + model calls)
│   ├── book.py      outline model, outline text, context digest of earlier sections
│   ├── generation.py  options, length presets, inputs for writing one section
│   ├── client.py    OpenAI-compatible client, provider presets, request adaptation
│   ├── errors.py    error classification, key scrubbing, JSON error payloads
│   └── tools/pdf.py sanitized Markdown → PDF
└── server/          HTTP layer
    ├── app.py       routes, middleware (size limit, rate limit, security headers)
    ├── streaming.py runs engine generators in threads, emits Server-Sent Events
    ├── security.py  endpoint rules (SSRF protection), rate limiter
    ├── schemas.py   request/response models (keys are SecretStr)
    └── config.py    IB_* environment settings
```

### Streaming

Long operations respond with Server-Sent Events over a POST request:

| Endpoint | Events |
|---|---|
| `/api/outline` | `stage` → `outline` → `stage` → `title` → `stats` → `done` |
| `/api/sections/stream` | `start` → `delta`* → `stats` → `done` |

Either may end with an `error` event (`{code, title, message, hint}`, keys scrubbed). The engine's
generators are synchronous; `streaming.py` runs each step in a worker thread, and when the client
disconnects it closes the generator, which closes the provider's stream so the model stops.

### Section context

Each section request includes the outline and the sections written so far. The API builds:

- the outline as an indented list with the current section marked, and
- a digest of earlier sections: each one's opening sentence and subheadings, plus the closing text
  of the previous section (capped, oldest dropped first).

So chapters build on each other without repeating, at no extra model cost.

### Provider compatibility

`client.chat_completion` adapts each request to what the model accepts: reasoning models get
`max_completion_tokens` and no `temperature`, and if a provider rejects an optional parameter
(`stream_options`, `response_format`, `temperature`, `max_tokens`) it is dropped or renamed and the
request retried.

## The web app (`web/`)

```
web/src/
├── pages/       Landing (/), Write (/new), My books, Book, Settings, 404 (lazy-loaded except the landing page)
├── components/
│   ├── ui/      buttons, fields, dialogs, menus, tooltips (Radix + Tailwind)
│   ├── book/    Reader (live streaming view), OutlineEditor (drag and drop)
│   ├── settings/ProviderCard
│   └── …        Logo (animated), DotWave, BookCover, ModelSelect, ProviderIcon
└── lib/
    ├── runner.ts    the book loop, live streaming state, pause/resume/rewrite
    ├── api.ts       fetch + SSE parsing (eventsource-parser)
    ├── db.ts        IndexedDB via Dexie
    ├── settings.ts  preferences, providers, keys (zustand)
    ├── outline.ts   outline helpers, editable rows, Markdown export
    └── export.ts    Markdown / PDF / JSON backup and import
```

## Security notes

- **Keys** are `SecretStr` on the server, never logged, and scrubbed from error messages.
  Validation errors never echo request input.
- **SSRF:** custom base URLs are resolved and refused if they point at private, loopback,
  link-local, or reserved addresses, unless `IB_ALLOW_PRIVATE_ENDPOINTS` is set (self-hosting).
- **PDF export** sanitizes HTML to a small allowlist and disables all resource loading.
- **The web page** has a strict Content-Security-Policy (`script-src 'self'`, no third-party
  origins), self-hosted fonts and icons, and renders model output without raw HTML.
