#!/usr/bin/env bash
# Starts the Docker image and checks it actually works: the API answers, the web app is served,
# PDF export runs (it needs the image's native libraries), and the server doesn't run as root.
# Usage: .github/scripts/smoke_test.sh <image>
set -euo pipefail

image="${1:?usage: smoke_test.sh <image>}"
name="infinite-bookshelf-smoke"
url="http://127.0.0.1:9752"

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::group::Container logs"
    docker logs "$name" 2>&1 || true
    echo "::endgroup::"
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

check() {
  echo "✓ $1"
}

docker run -d --name "$name" -p 9752:9752 "$image" >/dev/null

# Polled, not a fixed sleep: a slow runner shouldn't fail the check
for _ in $(seq 60); do
  if curl -fsS "$url/api/health" >/dev/null 2>&1; then break; fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != "true" ]; then
    echo "✗ The container stopped while starting" >&2
    exit 1
  fi
  sleep 1
done
curl -fsS "$url/api/health" >/dev/null || { echo "✗ /api/health didn't answer within 60 seconds" >&2; exit 1; }
check "API is healthy"

curl -fsS "$url/" | grep -q '<div id="root">' || { echo "✗ / didn't return the web app" >&2; exit 1; }
curl -fsS "$url/books/any-book" | grep -q '<div id="root">' || { echo "✗ App routes didn't fall back to the web app" >&2; exit 1; }
check "Web app is served, including app routes"

curl -fsS "$url/api/config" | python3 -c 'import json, sys; c = json.load(sys.stdin); assert c["providers"], "no providers"' \
  || { echo "✗ /api/config didn't return the server's settings" >&2; exit 1; }
check "/api/config returns the providers"

pdf="$(mktemp)"
curl -fsS -X POST "$url/api/export/pdf" -H 'Content-Type: application/json' \
  -d '{"title": "Smoke test", "markdown": "# Smoke test\n\n## Chapter\n\nMaths $x^2$, `code`, and a table:\n\n| a | b |\n| - | - |\n| 1 | 2 |\n"}' \
  -o "$pdf"
[ "$(head -c 5 "$pdf")" = "%PDF-" ] || { echo "✗ PDF export didn't return a PDF" >&2; exit 1; }
check "PDF export works ($(wc -c <"$pdf") bytes)"

[ "$(docker exec "$name" id -u)" != "0" ] || { echo "✗ The server runs as root" >&2; exit 1; }
check "Server runs as a non-root user"
