# Infinite Bookshelf API

The backend of [Infinite Bookshelf](../README.md): a **stateless** FastAPI service that turns a
topic into a book and streams each section live as Server-Sent Events. It stores nothing. Books and
API keys live in the user's browser and arrive with each request.

```bash
uv sync                           # install
uv run infinite-bookshelf-api     # http://127.0.0.1:8000  (add --reload while developing)
uv run infinite-bookshelf-api --serve-web   # also serve the built web app on :9752 (pnpm start)
uv run pytest                     # tests
```

> [!TIP]
> **Interactive docs** are at [`/api/docs`](http://127.0.0.1:8000/api/docs), with a ready-made
> example for every endpoint, and the OpenAPI schema is at `/api/openapi.json`. Both are served from
> this server (no CDN), so they work offline. Turn them off with `IB_DOCS_ENABLED=false`.

## Endpoints

| Method | Path                   | What it does                                                           |
| ------ | ---------------------- | ---------------------------------------------------------------------- |
| GET    | `/api`                 | Name, version, and links to the docs                                   |
| GET    | `/api/health`          | `{"status": "ok", "version": …}` while the server runs                 |
| GET    | `/api/config`          | Built-in providers, what this server allows, section lengths           |
| POST   | `/api/models`          | Lists a provider's models; also the quickest way to test a key         |
| POST   | `/api/outline`         | Streams the outline, then the title                                    |
| POST   | `/api/sections/stream` | Streams one section, with the book so far as context                   |
| POST   | `/api/export/pdf`      | Typesets a book's Markdown as a PDF                                    |
| GET    | `/`                    | The web app when bundled (`IB_WEB_DIST`), otherwise the same as `/api` |

## Choosing a provider

Every request that calls a model names a provider in one of two ways:

```jsonc
// A built-in provider (ids from GET /api/config)
{ "preset": "openai", "api_key": "sk-..." }

// Any OpenAI-compatible API
{ "base_url": "https://api.together.xyz/v1", "api_key": "..." }
```

The local presets (`ollama`, `lmstudio`) also accept a `base_url`, for a server on another host or
port. They, and private addresses in `base_url`, work only when the server allows private endpoints.

The key is used for that request only and is never stored or logged. A model choice adds the model
ID:

```json
{ "provider": { "preset": "gemini", "api_key": "AIza..." }, "model": "gemini-3.8-flash" }
```

## Examples

<details open>
<summary><b>List models</b> (and test a key)</summary>

```bash
curl -s http://127.0.0.1:8000/api/models \
  -H 'Content-Type: application/json' \
  -d '{"provider": {"preset": "openai", "api_key": "sk-..."}}'
```

```json
{ "models": ["gpt-6-astra", "gpt-6-luna", "gpt-6.1-sol"] }
```

</details>

<details>
<summary><b>Draft an outline</b></summary>

```bash
curl -N http://127.0.0.1:8000/api/outline \
  -H 'Content-Type: application/json' \
  -d '{
    "outline_model": {"provider": {"preset": "openai", "api_key": "sk-..."}, "model": "gpt-6-luna"},
    "title_model":   {"provider": {"preset": "openai", "api_key": "sk-..."}, "model": "gpt-6-luna"},
    "options": {"topic": "The history of tea", "section_length": "short"}
  }'
```

```text
event: stage
data: {"stage": "outline"}

event: outline
data: {"structure": {"Origins": "Where tea began", "Tea and Empire": {"The Opium Wars": "...", "...": "..."}}}

event: stage
data: {"stage": "title"}

event: title
data: {"title": "Steeped: A Short History of Tea"}

event: stats
data: {"input_tokens": 120, "output_tokens": 340, "input_time": 0.4, "output_time": 2.1, "total_time": 2.5}

event: done
data: {}
```

In the outline, each heading maps either to a short description (a section to write) or to more
headings (a chapter).

</details>

<details>
<summary><b>Write a section</b></summary>

```bash
curl -N http://127.0.0.1:8000/api/sections/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "model":   {"provider": {"preset": "openai", "api_key": "sk-..."}, "model": "gpt-6-luna"},
    "options": {"topic": "The history of tea", "section_length": "short"},
    "book": {
      "title": "Steeped: A Short History of Tea",
      "structure": {"Origins": "Where tea began", "Tea and Empire": "Trade and war"},
      "written": [{"path": ["Origins"], "text": "Tea began in China..."}]
    },
    "path": ["Tea and Empire"]
  }'
```

```text
event: start
data: {"path": ["Tea and Empire"]}

event: delta
data: {"text": "By the seventeenth century, "}

event: delta
data: {"text": "tea had reached Europe..."}

event: stats
data: {...}

event: done
data: {}
```

Join the `delta` texts to build the section. To **rewrite** one, add
`"revision": {"note": "Add a worked example", "previous": "<current text>"}`. To **stop**, close the
connection: the model call stops too.

</details>

<details>
<summary><b>Export a PDF</b></summary>

```bash
curl -s http://127.0.0.1:8000/api/export/pdf \
  -H 'Content-Type: application/json' \
  -d '{"title": "Steeped", "markdown": "# Steeped\n\n## Origins\n\nTea began in China..."}' \
  -o book.pdf
```

</details>

## Request options

| Field (`options`) | Default    | Meaning                                                          |
| ----------------- | ---------- | ---------------------------------------------------------------- |
| `topic`           | required   | What the book is about (3–500 characters)                        |
| `instructions`    | `""`       | Guidelines: tone, audience, things to include or avoid           |
| `style`           | `""`       | e.g. Casual, Formal, Academic, Creative, Technical, Storytelling |
| `complexity`      | `""`       | e.g. Beginner, Intermediate, Advanced, Expert                    |
| `seed_content`    | `""`       | Your own notes or source material (up to 20,000 characters)      |
| `long_outline`    | `false`    | Draft a longer, more detailed outline                            |
| `section_length`  | `"medium"` | `short` (about 500 words), `medium` (1,000) or `long` (2,000)    |

## Errors

Every error has the same shape, with any API key removed from the message:

```json
{ "error": { "code": "auth", "title": "Authentication failed", "message": "...", "hint": "Check this provider's API key in Settings." } }
```

| HTTP status | When                                                           |
| ----------- | -------------------------------------------------------------- |
| `400`       | Invalid input, or an address this server may not call          |
| `413`       | The request is larger than `IB_MAX_REQUEST_BYTES`              |
| `422`       | The body doesn't match the schema (input is never echoed back) |
| `429`       | This server's rate limit (`IB_RATE_LIMIT_PER_MINUTE`)          |
| `502`       | The provider failed (`/api/models`)                            |

Once a stream has started, a failure arrives as an `error` event with the same fields. The
[architecture guide](../docs/architecture.md#errors) lists every `code`.

## Configuration and design

- **Settings** are `IB_*` environment variables, or a `.env` file in the project root (`api/.env`
  overrides it): see [Self-hosting → Configuration](../docs/self-hosting.md#-configuration).
- **How it works:** see the [architecture guide](../docs/architecture.md#-the-api).
- **PDF export** uses WeasyPrint, which needs the Pango libraries (in the Docker image already).
  Without them it falls back to a simpler writer: see
  [Self-hosting → PDF export](../docs/self-hosting.md#-pdf-export).
