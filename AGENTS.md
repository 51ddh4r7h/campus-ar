# Working in Campus AR

## Goal

Campus AR is a phone-first, static TypeScript app for a timed campus film hunt.
The camera view is the main experience. A player follows a GPS warmth signal,
opens AR near a film spot, and sees a world-anchored cinemascope with that
spot's clip.

## Read first

1. `README.md` — setup, demo flow, deployment, and troubleshooting.
2. `docs/ARCHITECTURE.md` — module ownership and runtime flow.
3. `src/data/spots.ts` — the canonical film-spot and media data.

## Safe working rules

- Preserve unrelated uncommitted changes. This repository is often used while
  testing on a phone.
- Keep the camera/AR session long-lived. Do not reintroduce run/stop cycles for
  every spot.
- Keep GPS, proximity, heat, hunt state, and AR rendering as separate owners.
- Treat `src/main.ts` as orchestration code. New domain rules belong in the
  smallest existing module that owns them.
- Keep `?sim`, `?debug`, and `window.__campushunt` development-only. Never add a
  production path that depends on them.
- For a new clip, add the file under `public/clips/` and wire its spot in
  `src/data/spots.ts`. Keep an S3 URL primary only when its CORS and range
  support are configured; provide a same-origin fallback for demos.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

`npm run lint` currently reports existing anti-slop findings. Do not hide them
with broad disables; fix or document them at the smallest useful scope.

For the full simulated browser flow, start Vite and run:

```bash
node scripts/e2e-smoke.mjs
```

## Deployment

`npm run deploy` builds and publishes `dist/` to the configured Cloudflare
Pages project. Confirm the target URL after deploying, then test demo mode on a
real phone.
