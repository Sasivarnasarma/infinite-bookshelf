# Infinite Bookshelf web app

The browser side of [Infinite Bookshelf](../README.md): a React 19 single-page app that owns all the
data and drives the writing. Books live in IndexedDB, settings and API keys in localStorage, and the
app talks only to its own server, the [API](../api/README.md), at `/api`.

## 🧰 Commands

Run these from the project root to start everything (`pnpm dev`, `pnpm check`), or from `web/` for
the web app alone:

| Command          | What it does                                                  |
| ---------------- | ------------------------------------------------------------- |
| `pnpm dev`       | Dev server on http://localhost:5173, with hot reload          |
| `pnpm build`     | Typecheck, then build the production app into `dist/`         |
| `pnpm preview`   | Serve the `dist/` build on http://localhost:4173, to check it |
| `pnpm test`      | Unit tests (Vitest)                                           |
| `pnpm typecheck` | TypeScript, without building                                  |
| `pnpm lint`      | oxlint                                                        |

The web app needs the API running for anything beyond the home page. From the project root,
`pnpm dev` starts both.

## 🔌 Pointing at the API: `IB_API_URL`

In development the web app and the API are separate servers. The dev server (and `pnpm preview`)
forwards every `/api` request to the API, so the browser sees a single address, as in production,
where the API serves the built app itself.

| Variable     | Default                 | What it does                               |
| ------------ | ----------------------- | ------------------------------------------ |
| `IB_API_URL` | `http://127.0.0.1:8000` | Where the dev server sends `/api` requests |

Change it when the API isn't on the default address: you set `IB_PORT` for the API, it runs on
another machine, or you want to try the web app against a deployed server.

```bash
IB_API_URL=http://127.0.0.1:9000 pnpm dev            # macOS, Linux, Git Bash
$env:IB_API_URL = "http://127.0.0.1:9000"; pnpm dev  # PowerShell
```

> [!NOTE]
> `IB_API_URL` is read from the shell's environment when the dev server starts, **not** from a
> `.env` file. It's used only in development; the built app always calls `/api` on its own address.

## 📂 Inside `src/`

```text
src/
├── pages/        one component per route, loaded on first visit (except the home page)
├── components/   book reader and outline editor, settings, home page, layout, UI parts
└── lib/          everything that isn't UI: the writing loop, API calls, storage, settings
```

The [architecture guide](../docs/architecture.md#-the-web-app) maps every file, and explains the
writing loop, how API keys are chosen, and what's stored where.

## 📐 Conventions

- **No third-party scripts, fonts or trackers.** API keys live in this page's storage, and the
  server sends a strict Content Security Policy (`script-src 'self'`). Bundle everything.
- **Never render raw HTML** from model output. Markdown goes through `components/Markdown.tsx`.
- **Logic goes in `lib/`,** with tests beside it as `*.test.ts`. They run in plain Node: no browser
  or React needed.
- **Check both themes and a phone-sized screen** for UI changes.
- **Formatting** is Prettier, with Tailwind classes in a consistent order: `pnpm format` from the
  project root.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full workflow.
