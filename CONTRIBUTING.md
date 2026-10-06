# Contributing

Thanks for helping improve Infinite Bookshelf! Bug reports, ideas, docs and code are all welcome.

> [!IMPORTANT]
> Found a security problem? Please don't open a public issue: follow the
> [security policy](SECURITY.md) instead.

## 🧰 Setup

You need [uv](https://docs.astral.sh/uv/), Node.js 22 or newer, and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/Sasivarnasarma/infinite-bookshelf.git
cd infinite-bookshelf
pnpm bootstrap          # web and API dependencies
cp .env.example .env    # optional settings; local models are allowed
pnpm dev                # API on :8000, web app on :5173, both reloading as you edit
```

Open http://localhost:5173. The API's interactive docs are at http://localhost:8000/api/docs.

> [!TIP]
> In VS Code, install the recommended extensions (the editor offers them when you open the folder)
> and turn on format on save.

## 🔁 Workflow

1. **Branch** from `main`: `feat/…`, `fix/…`, `docs/…` and so on.
2. **Make your change**, with tests.
3. **Run the checks** below.
4. **Open a pull request** describing what changed and why. CI runs the same checks, plus a
   dependency audit and the Docker build, and posts a report on the run's summary page.

```bash
pnpm format     # fix formatting: Prettier (web, docs) and Ruff (API, including imports)
pnpm check      # everything CI runs: format and lint checks, typecheck, web and API tests
pnpm build      # production build of the web app
```

| Part   | Format                            | Lint   | Types      | Tests                             |
| ------ | --------------------------------- | ------ | ---------- | --------------------------------- |
| `api/` | Ruff                              | Ruff   | –          | pytest, in `api/tests/`           |
| `web/` | Prettier (+ Tailwind class order) | oxlint | TypeScript | Vitest, as `web/src/**/*.test.ts` |
| Docs   | Prettier                          | –      | –          | –                                 |

CI fails on unformatted code, so `pnpm format` before committing saves a round trip.

## 📐 Ground rules

These keep the project's promises to its users. See the [architecture guide](docs/architecture.md)
for the reasoning.

- **Keep the API stateless.** Nothing user-related is stored on the server: no database, files or
  caches of books or keys.
- **Never log, store or echo API keys.** Use `SecretStr` for keys in request models, and pass keys
  to `error_payload` so they're removed from messages.
- **Keep the engine free of web code.** `api/src/infinite_bookshelf/engine` has no FastAPI or HTTP
  imports; those belong in `server/`.
- **No third-party scripts, fonts or trackers** in the web app. Its strict Content Security Policy
  depends on it, and so does the safety of keys stored in the browser.
- **Test what you change:** `api/tests/` for API and engine changes, `web/src/lib/*.test.ts` for
  browser-side logic.
- **UI changes:** check light and dark themes, and a phone-sized screen.

## 📝 Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/): a type, an optional scope, and
a short summary in the imperative.

```text
feat(web): add EPUB export
fix(api): keep the text when a rewrite fails
docs: explain PDF fonts
```

| Type       | For                                            |
| ---------- | ---------------------------------------------- |
| `feat`     | A new feature                                  |
| `fix`      | A bug fix                                      |
| `docs`     | Documentation only                             |
| `style`    | Formatting or comments, no code change         |
| `refactor` | Code change that's neither a fix nor a feature |
| `test`     | Tests only                                     |
| `build`    | Dependencies, Docker, tooling                  |
| `ci`       | GitHub Actions                                 |

Use `api` or `web` as the scope when a change touches only one of them. Mark breaking changes with
`!` (`feat!: …`) and a `BREAKING CHANGE:` line in the body explaining what to update.

## 🧭 Where things are

| I want to change…                 | Look in                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| The prompts                       | `api/src/infinite_bookshelf/engine/agents/`                                     |
| The built-in providers and models | `PROVIDER_PRESETS` in `engine/client.py`, and `web/src/lib/provider-catalog.ts` |
| How the next section is chosen    | `web/src/lib/runner.ts`                                                         |
| Which key a request uses          | `keyOrder` in `web/src/lib/settings.ts`                                         |
| How books are read and rendered   | `web/src/components/book/Reader.tsx`, `components/Markdown.tsx`                 |
| The PDF layout                    | `api/src/infinite_bookshelf/engine/pdf.py`                                      |
| Server settings                   | `api/src/infinite_bookshelf/server/config.py` and `.env.example`                |
