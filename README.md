# Campus Movie Hunt

An individual, timed campus game for new joiners. Each level shows a short movie
clip that is a clue to a place on campus. Recognise the spot, walk there, and the
scene plays back — anchored to the real location in AR — as the reward. Fastest
fair time wins (scored against a per-route par time).

**This is the `v2-movie-hunt` rebuild.** The previous team-based static MVP is
preserved under `_legacy/` and on `main` up to commit `129442e`.

## Docs

| Doc | What |
| --- | --- |
| [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) | The phased build. Start here. |
| [`docs/UI-FLOW-BRIEF.md`](docs/UI-FLOW-BRIEF.md) | Every screen, state, and transition + the design system. |
| [`docs/PROJECT-CONTEXT-AND-AGENDA.md`](docs/PROJECT-CONTEXT-AND-AGENDA.md) | Product intent and the locked experience model. |
| [Rulebook](https://claude.ai/code/artifact/721673ba-3c38-4f89-95c2-af5c0c2cf317) | The game rules, for the wider team. |

## Layout

```
shared/   pure TypeScript — data model, config, content, game logic (no I/O)
worker/   Cloudflare Worker (Hono) — sessions, validation, scoring, standings; D1 store
client/   Svelte 5 + Vite — the phone app, deploys to Cloudflare Pages
scripts/  route-pool generation, sim, calibration, deploy
content/  source assets (location photos, etc.)
_legacy/  the previous build, kept for reference and AR-module salvage
```

Hosting is all Cloudflare free plan — Workers + D1 + Pages. See
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Develop

```bash
npm install
npm run dev:worker     # http://localhost:8787  (wrangler)
npm run dev:client     # http://localhost:5173  (proxies /api → the worker)
```

Checks (also run in CI):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Backend setup (first time)

The D1 database already exists and is wired in `worker/wrangler.jsonc`. Apply the
schema:

```bash
npm run db:migrate:local    # local D1 for `wrangler dev`
npm run db:migrate          # remote D1
```

## Status

- **Phase 0** — monorepo scaffold, data model, content stub, CI. ✅
- **Phase 1** — backend game engine: balanced route generation, session
  lifecycle, strict progression, geofence + dwell + leg-time + speed validation,
  par scoring, event log, standings. Pure logic in `shared/`, D1 + HTTP in
  `worker/`. `npm run sim` plays a full scored hunt; `npm run gen:routes` builds
  and inspects a batch's route pool. ✅
- **Phase 2** — the Svelte client. Next.

See [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md).
