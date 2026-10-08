# Changelog

All notable changes to Infinite Bookshelf are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-09

A complete rebuild. Infinite Bookshelf is now a stateless FastAPI API and a React web app, shipped
as one Docker image for amd64 and arm64. Books and API keys live in your browser, so one server
can be shared without keeping anyone's data.

### Added

#### Writing

- Outline first: review the drafted contents before anything is written, then rename, reorder
  by drag and drop, change levels, and add or remove entries.
- Sections stream in word by word, and each one sees the outline and a digest of the sections
  before it, so chapters build on each other.
- Write the whole book, or one chapter at a time to read each before the next.
- Pause and resume at any time, even after closing the tab.
- Section length, writing style, depth, guidelines, and your own notes or a `.txt`/`.md` file as
  source material.
- Rewrite any section with a note, using the same model or another one. The original stays until
  the new version is finished.

#### Models and keys

- 16 built-in providers (OpenAI, Anthropic Claude, Google Gemini, xAI Grok, DeepSeek, Mistral AI,
  Moonshot Kimi, Alibaba Qwen, Z.ai GLM, OpenRouter, Groq, Together AI, Fireworks AI, Cerebras,
  Ollama and LM Studio), plus any OpenAI-compatible API.
- A different model for the outline, the title and the chapters, even from different providers,
  with best, balanced and fast suggestions for each step.
- Switch models whenever a book is paused, or straight from an error card with "Try again with
  another model". Each section records which model wrote it.
- Several keys per provider, with automatic switching to the next key when one is rejected, out
  of credits or rate-limited, and optional rotation.
- Readable errors: the provider's own explanation, a hint about what to do next, and the full
  error under "Show full error". Running out of credits, a busy model, a missing model, a timeout
  and a dropped connection each get their own message.

#### Reading and export

- A reader that scrolls with the section being written, a contents sidebar, light and dark
  themes, and three reading sizes.
- Maths, tables and highlighted code, in the reader and in exports.
- Export as Markdown, a typeset PDF (title page, contents with page numbers, maths), or a JSON
  backup that can be imported on another device.
- Works on phones and tablets, and installs to the home screen like an app.
- Link previews with an image on WhatsApp, Slack, Discord, X and more.

#### Running it

- One Docker image, published for amd64 and arm64 at `ghcr.io/sasivarnasarma/infinite-bookshelf`
  (tags `1.0.0`, `1.0`, `1` and `latest`), with a Docker Compose file. The image is smoke-tested in
  CI before it's published.
- `pnpm start` runs the built app without Docker.
- The web app can be hosted on its own and pointed at an API elsewhere, with `config.js` or
  `VITE_API_URL`.
- Interactive API docs at `/api/docs`.
- Settings in one `.env` file: a per-visitor rate limit that works behind reverse proxies, private
  and custom endpoint switches, CORS origins and a request size limit.

#### Privacy and security

- API keys stay in the browser (or only in the tab) and are used by the server for one request,
  never stored or logged. Books are kept in the browser's IndexedDB.
- A strict Content Security Policy, with no third-party scripts, fonts or trackers.
- On public servers, custom endpoints can't reach private network addresses, redirects aren't
  followed, and the local providers are hidden.

### Changed

- Rebuilt from a Streamlit app into a FastAPI API and a React web app.
- The server is stateless: no database, accounts or sessions.

### Removed

- The Streamlit app, along with books saved in `.data/books` and keys saved in
  `.data/settings.json` on the server. The [0.5.0 release](https://github.com/Sasivarnasarma/infinite-bookshelf/releases/tag/v0.5.0)
  stays available for anyone who needs it.

## [0.5.0] - 2026-10-06

The final release of the original Streamlit edition. See the
[release notes](https://github.com/Sasivarnasarma/infinite-bookshelf/releases/tag/v0.5.0).

[1.0.0]: https://github.com/Sasivarnasarma/infinite-bookshelf/compare/v0.5.0...v1.0.0
[0.5.0]: https://github.com/Sasivarnasarma/infinite-bookshelf/releases/tag/v0.5.0
