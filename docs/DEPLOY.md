# Deployment

All Cloudflare, all free plan.

| Piece | Service | Free plan |
| --- | --- | --- |
| API | **Workers** (the Hono app) | 100k requests/day |
| Data | **D1** (SQLite) | 5 GB · 5M row reads/day · 100k writes/day |
| Site | **Pages** (static Svelte build) | unlimited |

No Durable Objects (those need a paid plan) — live standings are polled by the
client instead.

## One-time setup

The D1 database already exists (`campus_movie_hunt`,
`d86d4af0-5e1f-4b83-b9f1-b5c13c56b59d`, wired in `worker/wrangler.jsonc`). Apply
the schema:

```bash
npm run db:migrate          # remote D1
npm run db:migrate:local    # local D1 for `wrangler dev`
```

Create the Pages project once (or let the first `wrangler pages deploy` prompt
to create it):

```bash
npx wrangler pages project create campus-movie-hunt --production-branch v2-movie-hunt
```

## CI/CD (the normal path)

`.github/workflows/deploy.yml` runs on every push to `v2-movie-hunt` (and
`main`): lint + typecheck + test, then apply D1 migrations, deploy the Worker,
build the client against the Worker's URL, and deploy Pages. Pull requests run
`ci.yml` (checks only, no deploy).

**One-time GitHub setup** — repo → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `CLOUDFLARE_API_TOKEN` | a custom token (see below) |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | from `npx wrangler whoami` |
| Variable | `VITE_API_BASE` | `https://campus-movie-hunt-api.<subdomain>.workers.dev` (fallback if the Worker URL isn't auto-detected) |

Create the API token at **dash.cloudflare.com → My Profile → API Tokens →
Create Token → Custom token** with these permissions (all *Account*-scoped to
your account):

- Workers Scripts — Edit
- Cloudflare Pages — Edit
- D1 — Edit
- Workers KV Storage — Edit
- Account Settings — Read

## Deploy manually

```bash
npm run deploy
```

Deploys the Worker, detects its `*.workers.dev` URL, builds the client with that
as `VITE_API_BASE`, and publishes to Pages. Overrides: `VITE_API_BASE=https://…`,
`PAGES_PROJECT=…`. API only: `npm run deploy --workspace worker`.

## Local development

`wrangler dev` runs the Worker with a local D1:

```bash
npm run dev:worker    # http://localhost:8787
npm run dev:client    # http://localhost:5173  (proxies /api → :8787)
```

## Admin key

Admin routes (`/admin/*`) are open unless `ADMIN_KEY` is set as a Worker secret:

```bash
cd worker && npx wrangler secret put ADMIN_KEY
```

Then callers must send `X-Admin-Key: <value>`.

## Notes

- DynamoDB / AWS were briefly used, then dropped — the D1 store is
  `worker/src/d1-store.ts`; the schema is `worker/migrations/`.
- Live standings: the client polls `GET /standings/:batchId`.
