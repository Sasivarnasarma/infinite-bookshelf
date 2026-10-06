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

## 🌐 Using an API on another address

The built app calls `/api` on the server it came from. To host it somewhere else and use an API on a
different address, set the address in either place:

| Where                          | When it's read      | Example                                                    |
| ------------------------------ | ------------------- | ---------------------------------------------------------- |
| `apiUrl` in `public/config.js` | When the page loads | `window.IB_CONFIG = { apiUrl: 'https://api.example.com' }` |
| `VITE_API_URL`                 | When building       | `VITE_API_URL=https://api.example.com pnpm build`          |

`config.js` wins, so one build can be pointed at any API by editing `dist/config.js` after
deploying. Leave both empty for the usual setup. `lib/api-url.ts` works out the address, and every
API call goes through it.

## 🔗 Link previews and app metadata

`index.html` carries the Open Graph and X card tags, icons, the web app manifest
(`public/manifest.webmanifest`) and schema.org data. The preview image and icons are in `public/`.

Preview and canonical links are written root-relative (`/og-image.png`), because crawlers need full
addresses and the build can't know the domain. When the API serves the page, it fills in the address
the page was requested on. For a static host, set the site's address when building:

| Variable        | When it's read | Example                                              |
| --------------- | -------------- | ---------------------------------------------------- |
| `VITE_SITE_URL` | When building  | `VITE_SITE_URL=https://books.example.com pnpm build` |

`lib/site-links.ts` does this at build time (wired up in `vite.config.ts`). Both `VITE_` settings
can also live in `web/.env.production`, which `pnpm build` reads; the project root's `.env` is only
for the API.

Not to be confused with `IB_API_URL` above, which only tells the **dev server** where to forward
`/api`. The API also has to allow the web app's address, and the static host has to send the security
headers: see [Self-hosting → Hosting the web app separately](../docs/self-hosting.md#-hosting-the-web-app-separately).

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
