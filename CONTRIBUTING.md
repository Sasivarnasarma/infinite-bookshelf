# Contributing

Thanks for helping improve Infinite Bookshelf. Issues and pull requests are welcome.

## Setup

You need [uv](https://docs.astral.sh/uv/), Node.js 22+, and [pnpm](https://pnpm.io/).

```bash
pnpm bootstrap                    # web and API dependencies
cp api/.env.example api/.env      # allows local models while developing
pnpm dev                          # API on :8000, web app on http://localhost:5173
```

## Before you open a pull request

```bash
pnpm check                        # web typecheck, lint and tests, then API tests
pnpm build                        # production build of the web app
```

- Keep the API **stateless**: nothing user-related is stored on the server.
- Never log, store, or echo API keys. Use `SecretStr` for keys in request models.
- Engine code (`api/src/infinite_bookshelf/engine`) has no web dependencies; HTTP concerns live
  in `server/`.
- Add or update tests: `api/tests/` (pytest) for API and engine changes, and
  `web/src/**/*.test.ts` (Vitest) for browser-side logic such as `web/src/lib/`.
- UI changes: check light and dark themes, and narrow screens.

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): a type, an optional scope, and a
short imperative summary, e.g. `feat(web): add EPUB export`, `fix(api): keep text when a rewrite
fails`, `docs: explain PDF fonts`. Use `api` or `web` as the scope when a change touches only one.
