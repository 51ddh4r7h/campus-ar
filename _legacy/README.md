# _legacy

The previous build (team-based "Campus Film Hunt", 8th Wall + Three.js, vanilla
TS + Vite). Kept for reference and salvage, not built or linted.

## Worth salvaging for Phase 3b (6DoF)

If we add walk-around AR later, the 8th Wall pieces here are the starting point:

- `src/ar.ts` — registers the XR8 camera-pipeline modules once, runs one
  long-lived `XR8.run()` session, forwards frames. The pattern for a stable
  SLAM session.
- `src/film-portal.ts` — the curved cinemascope mesh + `VideoTexture` +
  S3→same-origin fallback. Our `client/src/lib/ar/stage.ts` already reuses the
  curved-geometry math from here.
- `src/reveal-gate.ts` — "inside the radius + tracking NORMAL for N seconds"
  state machine.
- `src/ar-world.ts` — world-locked reel / markers / projected labels.

The new 3DoF stage swaps only the pose source; the screen + spill code is the
same shape.

Everything else (old `main.ts`, screens, `data/spots.ts`, tests, debug scripts)
is superseded.
