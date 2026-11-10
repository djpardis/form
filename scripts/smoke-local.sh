#!/usr/bin/env bash
# Runs the documented local setup with .dev.vars.example and fails on any
# Worker error. Uses a temporary D1 state directory and leaves .dev.vars alone.
set -euo pipefail
set -m

port="${SMOKE_PORT:-8798}"
state="$(mktemp -d)"
log="$state/dev.log"
url="http://localhost:$port/submit/contact"

fail() {
  echo "smoke: $1" >&2
  echo "--- wrangler dev log ---" >&2
  cat "$log" >&2
  exit 1
}

npx wrangler d1 migrations apply form_submissions --local --persist-to "$state" >/dev/null
npx wrangler dev --env-file .dev.vars.example --persist-to "$state" --port "$port" >"$log" 2>&1 &
pid=$!
trap 'kill -- -"$pid" 2>/dev/null || true; rm -rf "$state"' EXIT

for _ in $(seq 1 60); do
  curl -sf "http://localhost:$port/" >/dev/null && break
  sleep 1
done
curl -sf "http://localhost:$port/" >/dev/null || fail "health check did not respond"

tomorrow="$(node -e 'console.log(new Date(Date.now() + 864e5).toISOString().slice(0, 10))')"
body="$(curl -s -X POST "$url" -H "Origin: http://localhost:8000" \
  -F email=smoke@example.com -F eventDate="$tomorrow" \
  -F message="Smoke test submission from the local setup." -F website=)"
echo "$body" | grep -q '"id"' || fail "valid submission was not stored: $body"

invalid="$(curl -s -X POST "$url" -H "Origin: http://localhost:8000" -F website=)"
echo "$invalid" | grep -q '"error"' || fail "missing fields were accepted: $invalid"

sleep 1
if grep -q "ERROR" "$log"; then fail "wrangler dev logged an error"; fi

echo "smoke: local submission works with .dev.vars.example"
