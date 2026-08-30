#!/usr/bin/env bash
# Deploy the Worker API, then build the client against it and publish to Pages.
#   PAGES_PROJECT overrides the Pages project name.
#   VITE_API_BASE overrides the detected Worker URL.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=${PAGES_PROJECT:-campus-movie-hunt}

echo "→ deploying Worker API"
DEPLOY_OUT=$(cd worker && npx wrangler deploy 2>&1)
echo "$DEPLOY_OUT"

API_BASE=${VITE_API_BASE:-$(printf '%s\n' "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)}
if [[ -z "$API_BASE" ]]; then
  echo "!! could not detect the Worker URL — re-run with VITE_API_BASE=https://…workers.dev" >&2
  exit 1
fi
echo "→ API base: $API_BASE"

echo "→ building client"
VITE_API_BASE="$API_BASE" npm run build --workspace client

echo "→ publishing to Cloudflare Pages ($PROJECT)"
npx wrangler pages deploy client/dist --project-name "$PROJECT" --commit-dirty=true
