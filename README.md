<p align="center">
  <img src="web/public/logo.svg" alt="Infinite Bookshelf" width="220">
</p>

<h1 align="center">Infinite Bookshelf</h1>

<p align="center">
  <b>Turn a topic into a complete, structured book, written live by the AI model of your choice.</b><br>
  Open source · Bring your own API key · Self-host or use a hosted instance
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT licence"></a>
  <img src="https://img.shields.io/badge/API-FastAPI%20%C2%B7%20uv-009688" alt="FastAPI and uv">
  <img src="https://img.shields.io/badge/web-React%20%C2%B7%20pnpm-F86522" alt="React and pnpm">
</p>

---

## What it does

1. **Outline.** Your model drafts a table of contents and a title. Review it first: rename,
   reorder by drag and drop, change levels, add or remove entries.
2. **Write.** Every section streams in live, word by word. Each one sees the outline and a summary
   of what earlier sections covered, so chapters build on each other instead of repeating.
3. **Refine and export.** Rewrite any section with a note ("add a worked example"), then export to
   Markdown, PDF, or a JSON backup.

**Also:** works with OpenAI, Anthropic Claude, Google Gemini, xAI Grok, DeepSeek, Mistral, Kimi,
Qwen, GLM, OpenRouter, Groq, Together, Fireworks, Cerebras, Ollama, LM Studio, and any
OpenAI-compatible API · a different model per step, even across providers · several keys per
provider, with automatic switching when one fails and optional rotation · pause and resume any
time · section length, style, depth, and your own notes · light and dark themes.

## Your data stays yours

- **API keys** are saved only in your browser and sent with each request to the app's own server,
  which uses them and forgets them. They're never stored or logged.
- **Books** live in your browser, not on a server. Back them up from **Settings → Your data**.
- **The server is stateless** (no database, no accounts), and the page loads no third-party
  scripts, fonts, or trackers.

## Quick start

**Self-host with Docker**

```bash
docker compose up -d        # → http://localhost:8000
```

See [docs/self-hosting.md](docs/self-hosting.md) for configuration and running a public instance.

**Run from source** (needs [uv](https://docs.astral.sh/uv/), Node.js 22+, [pnpm](https://pnpm.io/))

```bash
pnpm bootstrap                    # install web and API dependencies
cp api/.env.example api/.env      # allow local models while developing
pnpm dev                          # API on :8000, web app on http://localhost:5173
```

Then open **Settings**, switch on a provider, and paste your API key.

## Repository layout

```text
├── api/            Python API (FastAPI, uv): stateless engine and live streaming
├── web/            Web app (React, TypeScript, Vite, Tailwind, pnpm)
├── docs/           Architecture and self-hosting guides
├── Dockerfile      One image: API + built web app
└── docker-compose.yml
```

| Command | What it does |
|---|---|
| `pnpm dev` | Run the API and web app with live reload |
| `pnpm check` | Web typecheck and lint, API tests |
| `pnpm build` | Production build of the web app |
| `pnpm test` | API tests |

## Documentation

- [Architecture](docs/architecture.md): how the pieces fit, streaming, security
- [Self-hosting](docs/self-hosting.md): Docker, configuration, public instances
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)

## Credits

Inspired by the original [Infinite Bookshelf](https://github.com/Bklieger/infinite-bookshelf) by
Benjamin Klieger. Provider icons from [LobeHub Icons](https://github.com/lobehub/lobe-icons) (MIT);
provider names and logos are trademarks of their owners, shown only to indicate compatibility.
API docs use [Swagger UI](https://github.com/swagger-api/swagger-ui) (Apache-2.0), bundled by
[fastapi-offline](https://github.com/turettn/fastapi_offline) (MIT), set in
[Geist](https://github.com/vercel/geist-font) (SIL OFL 1.1).

## Licence

[MIT](LICENSE)
