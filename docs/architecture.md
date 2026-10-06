# Architecture

Infinite Bookshelf is two parts that ship as one Docker image:

```
Browser (web/, React)                          Server (api/, FastAPI)
├─ API keys + settings → localStorage          ├─ GET  /api/config           providers, server rules
├─ books               → IndexedDB (Dexie)     ├─ POST /api/models           list models / test a key
├─ the book loop: next section, pause,         ├─ POST /api/outline          SSE: outline, then title
│  resume, rewrite (lib/runner.ts)             ├─ POST /api/sections/stream  SSE: one section, live
└─ sends key + inputs with each request ─────► └─ POST /api/export/pdf       Markdown → typeset PDF
```

## Design principles

- **The server is stateless.** No database, no accounts, no sessions. Every request carries what
  it needs, including the user's API key, and nothing is kept afterwards.
- **The browser owns the data.** Books live in IndexedDB; keys in localStorage (or sessionStorage
  when "Remember my keys" is off). Backups are JSON files the user downloads.
- **The browser drives generation.** It decides which section to write next and calls the API once
  per section. Pause simply aborts the current request; Resume continues with the first unfinished
  section. A half-written section is discarded and rewritten. In chapter-by-chapter mode the loop
  also stops when a chapter is finished, until the reader asks for the next one.
- **Models are chosen per request.** A book stores the model for its outline, title and sections,
  and the sections model can change whenever the book is paused, so later chapters can use another
  model. Each saved section records the model that wrote it, and a rewrite can use any model.
- **Nothing is sent that can't work.** Before each request the browser checks that the model's
  provider is still set up with a usable key. If not, the book shows a setup card (add a key, or
  switch the book to another model) instead of starting a request.
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
│   ├── stats.py     token counts and timings for each request
│   └── pdf.py       Markdown → sanitized HTML → PDF (WeasyPrint, or fpdf2 as a fallback)
└── server/          HTTP layer
    ├── __main__.py  `infinite-bookshelf-api` entry point (uvicorn)
    ├── app.py       routes, middleware (size limit, rate limit, security headers)
    ├── streaming.py runs engine generators in threads, emits Server-Sent Events
    ├── security.py  endpoint rules (SSRF protection), rate limiter
    ├── schemas.py   request/response models (keys are SecretStr)
    ├── config.py    IB_* environment settings
    ├── docs.py      the API docs page (Swagger UI, served locally)
    ├── openapi.py   API description and "Try it out" examples
    └── static/      API docs styling and fonts (Geist, and Literata for PDFs)
```

### Streaming

Long operations respond with Server-Sent Events over a POST request:

| Endpoint               | Events                                                     |
| ---------------------- | ---------------------------------------------------------- |
| `/api/outline`         | `stage` → `outline` → `stage` → `title` → `stats` → `done` |
| `/api/sections/stream` | `start` → `delta`* → `stats` → `done`                      |

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

### PDF export

`POST /api/export/pdf` takes the book as Markdown (built and tidied by the browser, see
[Markdown and maths](#markdown-and-maths)) and returns a PDF:

1. **Parse** as CommonMark with tables and strikethrough (markdown-it-py), raw HTML off. CommonMark
   lets a list start right after a line of text, which is how models usually write lists.
2. **Maths** (`$…$`, `$$…$$`, via mdit-py-plugins) is swapped for placeholders, so it never passes
   through the sanitizer as markup.
3. **Sanitize** the HTML with nh3 to a small allowlist of text formatting.
4. **Typeset maths** into the placeholders: SVG images from ziamath for WeasyPrint, or Unicode text
   (a² + b² = c²) for the fallback.
5. **Render.** WeasyPrint lays out a title page, a contents page with page numbers, a new page per
   chapter with its name in the running header, and Literata/Geist type. Its URL fetcher may load
   only the bundled font files and the maths images made in step 4. Without WeasyPrint's native
   libraries, fpdf2 writes the same HTML with Unicode system fonts and a page per chapter.

## The web app (`web/`)

```
web/src/
├── pages/       Landing (/), Write (/new), My books, Book, Settings, 404 (lazy-loaded except the landing page)
├── components/
│   ├── ui/        buttons, fields, dialogs and sheets, menus, tooltips (Radix + Tailwind)
│   ├── book/      Reader (live view, next-chapter card, rewrite), OutlineEditor (drag and drop)
│   ├── settings/  ProvidersWorkspace, ProviderDetail, AddProviderDialog, KeyField, provider-status
│   ├── home/      the landing page's parts: Shelf, OpenBookDemo, Steps, ModelOrbit, Flow
│   ├── layout/    AppShell: header, navigation, page backdrop, footer
│   ├── Markdown   model output with maths (KaTeX) and highlighted code
│   ├── ModelSelect  searchable model picker: recommended, starred, recent; a sheet on phones
│   └── …          Logo (animated), BookCover, BookCard, ProviderIcon
└── lib/
    ├── runner.ts      the book loop, live streaming state, pause/resume/rewrite, chapter stops, setup check
    ├── api.ts         fetch + SSE parsing (eventsource-parser)
    ├── db.ts          IndexedDB via Dexie
    ├── settings.ts    preferences, providers, keys and key order, setup problems (zustand)
    ├── key-format.ts  tidying pasted keys, spotting whose key it is, explaining failed checks
    ├── key-health.ts  last known state of each key (working, rate-limited, rejected)
    ├── key-test.ts    checking a key by listing the provider's models
    ├── model-picks.ts recommended models per step and quick-start combinations
    ├── markdown.ts    tidying model Markdown (maths delimiters, stray dollar signs)
    ├── outline.ts     outline helpers, next chapter, editable rows, Markdown export
    ├── create-book.ts starting a new book
    ├── export.ts      Markdown / PDF / JSON backup and import
    ├── provider-catalog.ts  provider blurbs and the starters suggested on first run
    ├── spotlight.ts   the cursor glow on cards
    ├── types.ts       shared types: books, outlines, server config
    └── utils.ts       small helpers (ids, dates, downloads)
```

Unit tests for `lib/` sit next to the code as `*.test.ts` and run with Vitest (`pnpm test`).

### Markdown and maths

Models write Markdown, often with LaTeX maths in `$…$`, `\(…\)` or `\[…\]`, and sometimes prices
like "$5 and $10". `lib/markdown.ts` tidies the text before it's shown or exported: `\( \)` and
`\[ \]` become dollars, and a `$` that can't open or close maths (Pandoc's rules: no space just
inside, no digit after the closing one) is escaped. Code is never touched. The reader then renders
it with remark-gfm, remark-math and KaTeX (`trust` off, so commands like `\href` are ignored) plus
highlight.js for code. The PDF export receives the same tidied text, so the reader and the PDF
agree.

## Security notes

- **Keys** are `SecretStr` on the server, never logged, and scrubbed from error messages.
  Validation errors never echo request input.
- **SSRF:** custom base URLs are resolved and refused if they point at private, loopback,
  link-local, or reserved addresses, unless `IB_ALLOW_PRIVATE_ENDPOINTS` is set (self-hosting).
- **PDF export** parses with raw HTML off, sanitizes to a small allowlist, and inserts typeset
  maths only after sanitizing (the placeholders' characters are stripped from the input, so text
  can't forge one). The renderer may load only the bundled fonts and its own maths images: no
  other files and no network addresses. TeX length and the number of formulas are capped.
- **The web page** has a strict Content-Security-Policy (`script-src 'self'`, no third-party
  origins), self-hosted fonts and icons, and renders model output without raw HTML.
- **Removing a provider** deletes its keys and their secrets from the browser.
