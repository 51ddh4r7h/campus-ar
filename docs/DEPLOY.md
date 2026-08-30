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

## Deploy

```bash
npm run deploy
```

This deploys the Worker, detects its `*.workers.dev` URL, builds the client with
that as `VITE_API_BASE`, and publishes to Pages. Overrides:

- `VITE_API_BASE=https://…` — skip URL detection
- `PAGES_PROJECT=…` — different Pages project

Deploy just the API:

```bash
npm run deploy --workspace worker      # wrangler deploy
```

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
