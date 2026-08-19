# Campus Film Hunt — AR scavenger hunt MVP

A timed, onboarding scavenger hunt for new joiners. **Three real spots on
campus** once stood in for famous films. You walk the ground with only a coarse
**cold / warm / hot** GPS signal — never a compass, never directions — get
prompted to **open your camera** once you're inside a spot's radius, and catch a
cinematic **clapperboard reveal** in AR confirming the set + showing the movie.
Three sets, one running clock, and your total time lands on the (stubbed)
leaderboard marquee.

Built on the **current 8th Wall Engine Binary** (`@8thwall/engine-binary`) with
**Three.js** world tracking — the Phase 1 SLAM pipeline is untouched; the arrow
trail is gone.

---

## Flow (see `DESIGN.md` for the design system)

```
Start screen → Hunt (GPS warmth, no directions)
  → inside a spot's radius → "Open camera"
  → tracking NORMAL + inside for ≥2 s → REVEAL
    (in-world clapperboard claps + spotlight + info panel + split time)
  × 3 → Summary (total time, splits, name entry → stubbed leaderboard)
```

- **No arrows, no waypoints, no turn-by-turn.** The proximity gate only says how
  *warm* you are (bands: >100 m Cold · 55–100 Chilly · 25–55 Warm · <25 Hot ·
  inside the radius). If more than one spot is plausibly close, the signal stays
  ambiguous and won't name a nearest spot.
- **Timer** is wall-clock based (`Date.now()`), persists across background /
  foreground / brief tracking loss, and survives a mid-hunt reload
  (sessionStorage).
- **Spot states:** `locked → unlocked → found`. Once found, a spot can never
  re-reveal ("already in the can" toast instead).
- **Leaderboard is stubbed** — `submitScore()` in `src/leaderboard.ts` is the only
  call the app makes. Swap its body for a real backend later without touching
  anything else.

---

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (`strict`) | Type safety for the XR8 API surface |
| UI styling | **Tailwind CSS v3** with a custom token system | `tailwind.config.js` defines the full cinema theme (see `DESIGN.md`) |
| Bundler / dev | Vite (v8) | Instant dev server, static build |
| AR engine | `@8thwall/engine-binary@1` | Current engine; `slam` chunk = world tracking |
| 3D | `three` (r185) | Clapperboard reveal device + AR scene |
| Build output | Static → any HTTPS host | No server runtime |

No frameworks beyond plain TS modules + the engine's camera-pipeline.

> **Which engine?** The current [8th Wall Engine Binary](https://8thwall.org/docs/engine/overview)
> (`@8thwall/engine-binary`), **not** the archived `8thwall/web` repo. World
> tracking is added by the engine's `slam` chunk, which registers the classic
> `XR8.XrController` / `XR8.Threejs` / `XR8.addCameraPipelineModules` API.

---

## Project layout

| File | Responsibility |
| --- | --- |
| `src/main.ts` | App orchestrator: screens, proximity gate, timer, AR open/close, summary |
| `src/ar.ts` | 8th Wall session manager (register modules once, `run`/`stop` per spot) + the "inside for ≥2 s + tracking NORMAL" trigger |
| `src/reveal.ts` | The signature 3D **clapperboard** device + spotlight/can-flash animation |
| `src/hunt.ts` | Hunt state machine + wall-clock timer + splits |
| `src/location.ts` | Single geolocation source (no heading/bearing) + `?sim` simulator |
| `src/leaderboard.ts` | **Stub** leaderboard — `submitScore()` is the swap point |
| `src/data/spots.ts` | The 3 film spots (lat/lng/radius/movie/reveal-asset) |
| `src/full-window-canvas.ts` | Keeps the camera canvas filling the viewport |
| `DESIGN.md` | Token system + signature-element + motion plan |
| `scripts/e2e-smoke.mjs` | Headless Playwright test of the full hunt flow |

### Setting your real campus spots

`src/data/spots.ts` ships with placeholder coordinates (a generic campus).
Drop your own pins:

```ts
{
  id: 'the-quad',                   // short slug
  name: 'The Quad',
  lat: 37.4279, lng: -122.1706,     // ← real spot
  radiusM: 15,                      // how close you must get to unlock
  movie: {title: 'The Social Network', blurb: '…one-liner…'},
  asset: {color: '#F3B93F', label: 'clip-quad-01'},
}
```

---

## Development

```bash
npm install
npm run dev        # http://localhost:5173 + LAN URL + tunnel-host-ready
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run preview    # serve the build locally
```

### Try the whole hunt without leaving your desk (− `?sim`)

`?sim` (or `?simulate`) starts a simulated GPS feed that drifts through all three
spots and shows a **jump rail** on the hunt screen. Perfect for demos:

```
http://localhost:5173/?sim
```

- The signal starts **Cold**, then warms until each spot unlocks — no walking.
- Headless/e2e controls are exposed on `window.__campushunt` in **dev/`?sim` only**
  (never in production builds): `jump(spotId)`, `reveal()`, `openAr()`.
- Automated check: `node scripts/e2e-smoke.mjs` (starts the whole flow in
  headless Chromium against the running dev server).

---

## On a real phone

Camera + location need HTTPS. `http://localhost` is fine on desktop; for a phone:

```bash
npm run dev            # terminal 1
cloudflared tunnel --url http://localhost:5173   # terminal 2  (or: ngrok http 5173)
```

Open the `https://…` URL on the phone, grant camera **and location**, press
**Start the hunt**, and start walking. The HUD's last two lines show the active
**SPOT** and its **STATE** (`locked`/`unlocked`/`found`).

Testing tips:

1. Start in a well-lit, textured area and move the phone slowly to lock tracking
   (`Tracking: NORMAL`).
2. The reveal needs you to stay inside the spot's radius for **2 continuous
   seconds** while tracking is locked.

---

## Deployment

### Cloudflare Pages

The repo ships `wrangler.jsonc` + `.node-version` (Node 22.16 for Vite 8).

- **Git integration:** Pages → Connect a Git repo → build `npm run build`,
  output `dist`.
- **CLI:** `npx wrangler login` then `npm run deploy`
  (→ `https://campus-ar.pages.dev`).

The engine binary at `public/xr8/` is gitignored; the Vite build re-copies it
from `node_modules`, so CI builds from a fresh clone work.

Any static HTTPS host works too (`base: './'`, engine served verbatim from
`dist/xr8/`). No API keys required.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| HUD shows `Engine: engine not loaded` | `npm install` didn't run / `public/xr8/` missing — restart Vite. |
| Camera never prompts | Plain `http://` on non-localhost — use an HTTPS tunnel. |
| Location error button shown | Location permission denied; tap **Enable location** to re-ask. |
| Signal stays `Cold` while walking | Wrong/last-known coords, or the spot list in `spots.ts` needs your campus coords. |
| Tracking stuck `LIMITED` | Too dark / no texture — move to a textured, well-lit area. |
| Reveal never fires | Must be inside the radius *and* tracking `NORMAL` for 2 s consecutively. |
| Works nowhere on desktop | World tracking is phone-first; desktop gets a `Desktop 3D (dev)` session. |

---

## Links

- Engine docs: <https://8thwall.org/docs/engine/overview>
- API reference: <https://8thwall.org/docs/api/engine/xr8>
- Official three.js world-effects example: <https://github.com/8thwall/threejs-world-effects-example>
- Engine license: <https://github.com/8thwall/engine/blob/main/LICENSE>