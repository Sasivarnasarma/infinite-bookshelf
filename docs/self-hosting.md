# Self-hosting

Infinite Bookshelf runs as **one process**: the API serves the built web app and the API on a single
port, **9752**, in a Docker container or straight from a checkout. There's no database to set up and nothing to back up on the server, because
books and keys live in each user's browser.

<details>
<summary><b>Contents</b></summary>

- [Choose how to run it](#-choose-how-to-run-it)
- [Docker Compose](#-docker-compose)
- [Docker](#-docker)
- [Without Docker](#-without-docker)
- [From source (development)](#-from-source-development)
- [Local models: Ollama and LM Studio](#-local-models-ollama-and-lm-studio)
- [Configuration](#-configuration)
- [Behind a reverse proxy](#-behind-a-reverse-proxy)
- [Hosting the web app separately](#-hosting-the-web-app-separately)
- [Running a public instance](#-running-a-public-instance)
- [Updating](#-updating)
- [PDF export](#-pdf-export)
- [Troubleshooting](#-troubleshooting)

</details>

## 🧭 Choose how to run it

| Setup                                                  | Best for                                               | Address                 |
| ------------------------------------------------------ | ------------------------------------------------------ | ----------------------- |
| [Docker Compose](#-docker-compose)                     | Most people: a home server, a VPS, your laptop         | `http://localhost:9752` |
| [Docker](#-docker)                                     | A one-line start, or your own orchestration            | `http://localhost:9752` |
| [Without Docker](#-without-docker)                     | A server without Docker, run with systemd              | `http://localhost:9752` |
| [From source](#-from-source-development)               | Development, with live reload                          | `http://localhost:5173` |
| [Web app separately](#-hosting-the-web-app-separately) | The web app on a static host or CDN, the API elsewhere | your static host        |

## 🐳 Docker Compose

```bash
git clone https://github.com/Sasivarnasarma/infinite-bookshelf.git
cd infinite-bookshelf
cp .env.example .env    # optional: every setting, with its default
docker compose up -d
```

Open **http://localhost:9752**, go to **Settings**, and add a provider.

The bundled [`docker-compose.yml`](../docker-compose.yml) defines one image and two services:

| Service                   | Network                         | Use it when                                                                                                                          |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `infinite-bookshelf`      | Docker's own (port `9752:9752`) | Almost always. Works on Linux and Docker Desktop.                                                                                    |
| `infinite-bookshelf-host` | The host's network and DNS      | The container can't look up domain names, as in GitHub Codespaces. Start it by name: `docker compose up -d infinite-bookshelf-host`. |

Run only one of them at a time: both use port 9752.

> [!NOTE]
> The Compose file is set up for a **private** server: it allows local model servers
> (`IB_ALLOW_PRIVATE_ENDPOINTS=true`) and publishes the port on every network interface. If other
> people can reach the server, read [Running a public instance](#-running-a-public-instance).

`docker compose up` pulls the published image (`ghcr.io/sasivarnasarma/infinite-bookshelf`) and
builds it from this folder if the pull fails. To always build your own: `docker compose up -d --build`.

## 🐋 Docker

```bash
docker run -d --name infinite-bookshelf -p 9752:9752 \
  -e IB_ALLOW_PRIVATE_ENDPOINTS=true \
  ghcr.io/sasivarnasarma/infinite-bookshelf
```

Pass settings with `-e IB_NAME=value` or `--env-file .env`. On GitHub Codespaces, use the host's
network instead of publishing a port:

```bash
docker run -d --network host -e IB_ALLOW_PRIVATE_ENDPOINTS=true ghcr.io/sasivarnasarma/infinite-bookshelf
```

To build the image yourself: `docker build -t infinite-bookshelf .`

<details>
<summary><b>What's in the image</b></summary>

A multi-stage build ([`Dockerfile`](../Dockerfile)):

1. **Node 24** builds the web app into static files.
2. **Python 3.12 (slim)** installs the API with [uv], plus Pango, HarfBuzz and DejaVu fonts for PDF
   export, then copies in the built web app.

The container runs as an unprivileged user (`bookshelf`, uid 1000), listens on `0.0.0.0:9752`, and
has a health check on `/api/health`. Published tags: `latest` (the `main` branch), each release
version (e.g. `1.0.0`), and `sha-<commit>`.

[uv]: https://docs.astral.sh/uv/

</details>

## 📦 Without Docker

`pnpm start` runs the finished app the way the container does: one process serving the web app, the
API and the API docs on port 9752, with no reloading. You need [uv](https://docs.astral.sh/uv/),
Node.js 22 or newer, and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/Sasivarnasarma/infinite-bookshelf.git
cd infinite-bookshelf
pnpm bootstrap          # install the web and API dependencies
cp .env.example .env    # optional settings
pnpm build              # build the web app into web/dist
pnpm start              # → http://localhost:9752
```

- It listens on `0.0.0.0:9752`, like the container, so other devices on the network can reach it.
  Set `IB_HOST` and `IB_PORT` in `.env` to change that, for example `IB_HOST=127.0.0.1` behind a
  [reverse proxy](#-behind-a-reverse-proxy).
- Every other setting comes from the same `.env` (see [Configuration](#-configuration)).
- For PDF export, install Pango (see [PDF export](#-pdf-export)).
- `pnpm start` is `cd api && uv run infinite-bookshelf-api --serve-web`. Without a build it stops and
  asks you to run `pnpm build`.

<details>
<summary><b>Keep it running with systemd</b> (Linux)</summary>

Create `/etc/systemd/system/infinite-bookshelf.service`, with your own user and paths. `which uv`
shows where uv is installed.

```ini
[Unit]
Description=Infinite Bookshelf
After=network-online.target
Wants=network-online.target

[Service]
User=bookshelf
WorkingDirectory=/opt/infinite-bookshelf/api
ExecStart=/home/bookshelf/.local/bin/uv run infinite-bookshelf-api --serve-web
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then start it, and have it start at boot:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now infinite-bookshelf
journalctl -u infinite-bookshelf -f     # follow its log
```

</details>

## 💻 From source (development)

You need [uv](https://docs.astral.sh/uv/), Node.js 22 or newer, and [pnpm](https://pnpm.io/).

```bash
pnpm bootstrap          # web and API dependencies
cp .env.example .env    # optional settings
pnpm dev                # API on :8000, web app on :5173, both reloading as you edit
```

Open **http://localhost:5173**. The web dev server forwards `/api` to the API, so the browser sees a
single address, as it does in production. It also listens on your network, so other devices can open
it at `http://<your-computer's-IP>:5173`. If the API runs on another address (say you set `IB_PORT`),
point the web dev server at it with `IB_API_URL`: see the [web app README](../web/README.md#-pointing-at-the-api-ib_api_url).

To run only the API: `cd api && uv run infinite-bookshelf-api` (add `--reload` to restart on code
changes). This is for development; to serve the finished app, use [`pnpm start`](#-without-docker).

## 🦙 Local models: Ollama and LM Studio

The local presets appear only when `IB_ALLOW_PRIVATE_ENDPOINTS=true` (the Compose default). Set the
address in **Settings → Providers & models → Ollama** (or LM Studio) to match how you run the app:

| You run the app with…           | Ollama address                         | LM Studio address                     |
| ------------------------------- | -------------------------------------- | ------------------------------------- |
| `pnpm start` or `pnpm dev`      | `http://localhost:11434/v1` (default)  | `http://localhost:1234/v1` (default)  |
| Docker Compose, default service | `http://host.docker.internal:11434/v1` | `http://host.docker.internal:1234/v1` |
| Docker Compose, `-host` service | `http://localhost:11434/v1`            | `http://localhost:1234/v1`            |
| Ollama on another machine       | `http://192.168.x.x:11434/v1`          | `http://192.168.x.x:1234/v1`          |

> [!IMPORTANT]
> On **Linux**, `host.docker.internal` reaches the host through Docker's network, but Ollama
> listens only on `127.0.0.1` by default. Make it listen on all interfaces with
> `OLLAMA_HOST=0.0.0.0` (for example `sudo systemctl edit ollama` and add
> `Environment="OLLAMA_HOST=0.0.0.0"`), or use the `-host` service. In LM Studio, turn on
> **Serve on Local Network**. Docker Desktop on Windows and macOS needs neither.

Then press **Test** to load the models you have installed.

## 🔧 Configuration

Every setting is optional and is an environment variable starting with `IB_` (for _Infinite
Bookshelf_, so it can't clash with names like `PORT` that hosting platforms set). The easiest place
for them is a `.env` file in the project root: copy [`.env.example`](../.env.example), which lists
them all.

| How you run it             | Where settings come from                                          |
| -------------------------- | ----------------------------------------------------------------- |
| Docker Compose             | `.env` next to `docker-compose.yml` (needs Compose 2.24 or newer) |
| `docker run`               | `-e IB_NAME=value`, or `--env-file .env`                          |
| `pnpm start` or `pnpm dev` | The root `.env`, then `api/.env` if present (which wins)          |
| All of them                | Variables set in the environment itself win over any `.env` file  |

| Variable                     | Default              | What it does                                                                                                                                                                        |
| ---------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IB_ALLOW_PRIVATE_ENDPOINTS` | `false`              | Allow localhost and private network addresses: Ollama, LM Studio, servers on your network. Compose sets `true`.                                                                     |
| `IB_ALLOW_CUSTOM_ENDPOINTS`  | `true`               | Let users add their own OpenAI-compatible base URLs.                                                                                                                                |
| `IB_RATE_LIMIT_PER_MINUTE`   | `0`                  | Writing requests per minute per visitor IP (`0` = no limit).                                                                                                                        |
| `IB_TRUSTED_PROXIES`         | `127.0.0.1`          | Reverse proxies whose `X-Forwarded-For` header gives the visitor's IP: comma-separated addresses or networks, or `*`. The image adds `172.16.0.0/12` (Docker's networks).           |
| `IB_MAX_REQUEST_BYTES`       | `8000000`            | Largest accepted request. A section request carries the book written so far.                                                                                                        |
| `IB_DOCS_ENABLED`            | `true`               | Interactive API docs at `/api/docs` and the schema at `/api/openapi.json`.                                                                                                          |
| `IB_CORS_ORIGINS`            | `[]`                 | Other websites allowed to call the API from a browser, as a JSON list. The app itself needs none.                                                                                   |
| `IB_HOST` / `IB_PORT`        | `127.0.0.1` / `8000` | Where the API listens when run from source. `pnpm start` uses `0.0.0.0` / `9752` unless these are set. The image always uses `0.0.0.0` / `9752`: change the published port instead. |
| `IB_WEB_DIST`                | _unset_              | Folder of a built web app to serve at `/`. The image sets it.                                                                                                                       |

> [!NOTE]
> API keys are not settings. Users add them in the app, and they stay in their browser.

To use a different port with Compose, change the left side of the mapping, e.g. `'8080:9752'`.

## 🔁 Behind a reverse proxy

A reverse proxy adds HTTPS and a domain name. Two things matter for this app: **don't buffer
responses** (sections stream as Server-Sent Events) and **allow large request bodies** (a section
request carries the book so far, up to `IB_MAX_REQUEST_BYTES`).

<details open>
<summary><b>Caddy</b> (HTTPS certificates automatic, streams without extra settings)</summary>

```caddy
books.example.com {
    reverse_proxy 127.0.0.1:9752
}
```

</details>

<details>
<summary><b>nginx</b></summary>

```nginx
server {
    listen 443 ssl;
    server_name books.example.com;
    # ssl_certificate and ssl_certificate_key here

    client_max_body_size 8m;            # nginx's default of 1m is too small for long books

    location / {
        proxy_pass http://127.0.0.1:9752;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;            # stream sections as they're written
        proxy_read_timeout 600s;        # long sections on slow models
    }
}
```

The API also sends `X-Accel-Buffering: no` on streams, which nginx honours.

</details>

**Visitor IPs.** Behind a proxy, every request arrives from the proxy's address. The rate limit
counts each visitor separately by reading `X-Forwarded-For`, but only from addresses in
`IB_TRUSTED_PROXIES`, so nobody else can fake their IP. The Docker image already trusts a proxy on
the same machine or in another container. If yours reaches the container from elsewhere (another
server, a custom Docker network such as `10.x`), add its address.

> [!TIP]
> When a proxy is in front, publish the container only on localhost so the proxy is the only way
> in: `'127.0.0.1:9752:9752'` in `docker-compose.yml`.

## 🌐 Hosting the web app separately

Normally one server serves both the web app and the API. You can also put the built web app on any
static host (a CDN, object storage, another domain) and point it at an API running somewhere else.

**1. Point the web app at the API.** Either edit `config.js` in the build, which works for any
build including a downloaded one, or set the address when building:

```js
// dist/config.js
window.IB_CONFIG = { apiUrl: 'https://api.example.com' }
```

```bash
VITE_API_URL=https://api.example.com pnpm build
```

`config.js` wins when both are set. The address may include a path (`https://example.com/bookshelf`);
the app adds `/api/...` to it.

**2. Let the API accept the web app's address** in the API's `.env`:

```bash
IB_CORS_ORIGINS=["https://books.example.com"]
```

**3. Configure the static host:**

- **Single-page fallback:** serve `index.html` for any path that isn't a file, so links like
  `/books/123` work.
- **Don't cache `config.js`** (`Cache-Control: no-cache`), so edits take effect at once.
- **Send the security headers.** The API sends them for the pages it serves, but a separate host
  must send them itself. Without them, an injected script could read the API keys kept in the page's
  storage. Allow the API's address in `connect-src`:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.example.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

<details>
<summary><b>Example: Caddy serving the web app</b></summary>

```caddy
books.example.com {
    root * /srv/infinite-bookshelf/dist
    try_files {path} /index.html
    file_server
    header /config.js Cache-Control no-cache
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.example.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
    }
}
```

</details>

> [!NOTE]
> Books and keys are stored per web address. Moving the web app to a new domain starts users with an
> empty bookshelf there; they can move their books with a backup from **Settings → Your data**.

## 🌍 Running a public instance

If people other than you can reach the server, go through this list:

- [ ] **Turn off private endpoints:** `IB_ALLOW_PRIVATE_ENDPOINTS=false` in `.env`. Otherwise anyone
      could enter a base URL such as `http://127.0.0.1:6379` and make your server send requests
      into your own network.
- [ ] **Set a rate limit,** for example `IB_RATE_LIMIT_PER_MINUTE=30`.
- [ ] **Serve over HTTPS** through a [reverse proxy](#-behind-a-reverse-proxy), and publish the
      container on `127.0.0.1` only.
- [ ] **Check `IB_TRUSTED_PROXIES`** covers your proxy, so the rate limit sees real visitor IPs.
- [ ] **Optionally,** allow only the built-in providers with `IB_ALLOW_CUSTOM_ENDPOINTS=false`.
- [ ] **As a second line of defence,** block outbound traffic from the container to private IP
      ranges at the network level.

With private endpoints off, the server refuses custom base URLs that resolve to private, loopback
or link-local addresses, doesn't follow their redirects, and hides the local presets.

Users' API keys pass through your server with each request but are never stored or logged. Tell
your users that, and point them to the **Privacy** section of the home page (`/#privacy`).

## 🔄 Updating

With Docker Compose:

```bash
git pull
docker compose pull          # the published image; or: docker compose build
docker compose up -d
```

Without Docker:

```bash
git pull
pnpm bootstrap               # new or updated dependencies
pnpm build
sudo systemctl restart infinite-bookshelf    # or stop and run pnpm start again
```

Users' books and keys are in their browsers, so updating never touches them.

## 📄 PDF export

The Docker image includes everything PDF export needs: [WeasyPrint] with Pango and HarfBuzz, and
DejaVu fonts for characters the bundled book fonts (Literata and Geist, Latin only) don't cover.

Without Docker, install Pango with your package manager:

```bash
sudo apt install libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0   # Debian, Ubuntu
brew install pango                                                       # macOS
```

Without it, often on Windows, exports still work through a simpler built-in writer: headings, lists
and tables are kept, and maths is written as plain text (a² + b² = c²).

[WeasyPrint]: https://doc.courtbouillon.org/weasyprint/stable/first_steps.html

## 🩺 Troubleshooting

<details>
<summary><b>Every provider fails with "Couldn't reach the provider"</b></summary>

The container probably can't look up domain names: Docker's DNS can't reach the host's resolver.
This happens in GitHub Codespaces. Check it (prints an IP address when DNS works, a "name
resolution" error when it doesn't):

```bash
docker compose exec infinite-bookshelf python -c "import socket; print(socket.gethostbyname('api.openai.com'))"
```

If it fails, use the host's network instead:

```bash
docker compose down
docker compose up -d infinite-bookshelf-host
```

On Docker Desktop this variant needs host networking turned on in its settings; the default service
works there without it.

</details>

<details>
<summary><b>Ollama or LM Studio doesn't appear in Settings</b></summary>

Local presets are shown only when `IB_ALLOW_PRIVATE_ENDPOINTS=true`. Set it in `.env`, then restart
with `docker compose up -d`.

</details>

<details>
<summary><b>Ollama is set up but its Test fails</b></summary>

From inside Docker, `localhost` is the container itself. Use the address from the
[local models table](#-local-models-ollama-and-lm-studio), and on Linux make Ollama listen on all
interfaces (`OLLAMA_HOST=0.0.0.0`).

</details>

<details>
<summary><b>"Too many requests"</b></summary>

The server's rate limit (`IB_RATE_LIMIT_PER_MINUTE`) was reached: wait a minute. If every visitor
hits it together, the server sees them all as one IP: add your proxy to `IB_TRUSTED_PROXIES`.

</details>

<details>
<summary><b>Long books fail with "Request too large" or a 413 from the proxy</b></summary>

Raise `IB_MAX_REQUEST_BYTES`, and the proxy's own limit (`client_max_body_size` in nginx).

</details>

<details>
<summary><b>Sections appear all at once instead of word by word</b></summary>

A proxy is buffering responses. In nginx add `proxy_buffering off;`. Tunnels and CDNs may need
streaming or buffering settings turned off for the site.

</details>

<details>
<summary><b>"Connect" or "Copy" did nothing on a plain-HTTP address</b></summary>

Browsers limit some features on non-HTTPS pages. The app has fallbacks for them, so update to the
latest version. Serving over HTTPS avoids the issue entirely.

</details>

<details>
<summary><b><code>docker compose</code> complains about <code>env_file</code></b></summary>

Optional `.env` files need Docker Compose 2.24 or newer. Update Compose, or create an empty `.env`
next to `docker-compose.yml`.

</details>
