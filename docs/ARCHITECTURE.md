# Campus AR architecture

This is the short map for humans and coding agents. If this file disagrees
with the implementation, trust the implementation and update this map.

## Runtime flow

```text
index.html + style.css
        ↓
     main.ts  ── owns app wiring and state transitions
        ├── location.ts ── real GPS or simulated GPS
        ├── proximity.ts ── distance → heat/band verdict
        ├── hunt.ts ── locked → unlocked → found + timer/splits
        └── ar.ts ── one XR8 session
                       ├── ar-world.ts ── world-locked reel/labels
                       ├── film-portal.ts ── curved cinemascope + video
                       ├── reveal.ts ── clapperboard/spotlight animation
                       └── reveal-gate.ts ── tracking + proximity trigger
```

The target navigation model is defined in [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md):
the AR session stays alive while the Hunt sheet opens and closes over it. The
dashboard and camera are views of one hunt, not separate hunt sessions.

## Ownership map

| Module | Owns | Must not own |
| --- | --- | --- |
| `src/main.ts` | Wiring, DOM screens, app lifecycle, reveal panel | Distance math, Three.js scene details |
| `src/hunt.ts` | Hunt state, wall-clock timer, splits | GPS or AR |
| `src/location.ts` | Location adapters and simulation | UI decisions |
| `src/proximity.ts` | Distance and heat verdicts | Persistent hunt state |
| `src/ar.ts` | XR8 lifecycle and AR module composition | Spot data rules |
| `src/film-portal.ts` | Curved screen mesh, video loading, placement | Reveal-panel DOM |
| `src/reveal.ts` | 3D reveal device animation | GPS or video URLs |
| `src/data/spots.ts` | Spot coordinates, movie copy, media URLs | Runtime state |

## Important invariants

- `src/data/spots.ts` is the only canonical spot list.
- `hunt.ts` is the only owner of `locked`, `unlocked`, and `found` state.
- `location.ts` emits fixes; it does not decide whether a spot is revealable.
- `proximity.ts` converts a fix into a verdict; `main.ts` applies that verdict.
- `ar.ts` creates one long-lived XR8 pipeline and forwards frame updates.
- `main.ts` lazy-loads `ar.ts` only when the camera opens; the landing screen
  must not pay the AR bundle cost.
- `ar.ts` owns one camera session for the complete hunt; opening the Hunt sheet
  must not stop XR or reset world placement.
- Unfound UI must not expose exact spot names or movie titles; clue content is
  a separate product layer and the reveal owns the answer.
- `film-portal.ts` keeps a pending spot during async XR startup so demo mode
  cannot lose an early `showPortal()` request.
- A portal is shown at signal band 3 or above, but the clip is loaded only when
  the signal reaches band 3. The first frame is a canvas loading state.
- S3 is the preferred clip source. `/public/clips/` is the deployable fallback.

## Where to change common things

### Add or change a film spot

Edit `src/data/spots.ts`. Add its media file to `public/clips/` if needed.

### Change reveal timing

Edit `src/reveal-gate.ts`, then update its tests. Do not add timing logic to
`film-portal.ts`.

### Change screen placement or video behavior

Edit `src/film-portal.ts`. Keep placement pose-relative and keep the S3 →
same-origin fallback behavior.

### Change the visible copy or DOM layout

Edit `index.html` and `src/style.css`; use `src/main.ts` only for wiring.

### Change demo behavior

Edit the simulator in `src/location.ts` or the explicit demo hooks in
`src/main.ts`. Keep demo behavior behind `?sim` or the start-screen demo CTA.

## Verification order

1. `npm test`
2. `npm run typecheck`
3. `npm run build`
4. `node scripts/e2e-smoke.mjs` with Vite running
5. Manual phone test: demo CTA → Amphitheatre → visible cinemascope → clip

The browser test needs a working local Chromium installation and may be
blocked by host sandbox permissions even when the app itself is healthy.
