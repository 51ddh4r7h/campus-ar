# Campus Film Hunt design direction

The interface is a welcoming campus game, not a telemetry console. The camera
can retain a cinematic treatment, but the surrounding product UI should be
calm, legible, and direct.

## Visual principles

- One clear primary action per screen.
- Use system-first typography and comfortable leading.
- Use soft cards, restrained shadows, and rounded controls for hierarchy.
- Keep color for meaning: warmth, readiness, discovery, and errors.
- Keep mystery and movie answers hidden until the reveal.
- Prefer still imagery and lightweight motion over decorative noise.
- Never make the player decode internal system language.

## Interaction principles

- Camera ↔ Hunt sheet is a reversible view change over one live session.
- The Hunt sheet must not stop or recreate the AR session.
- Recenter is always available and gives immediate feedback.
- Heat is a passive signal; mystery selection is secondary.
- Reveal panels have focus management, an explicit next action, and a dismiss
  path that restores the trigger focus.
- Motion becomes a short fade under `prefers-reduced-motion`.

## Source of truth

See [`docs/PRODUCT-FLOW.md`](docs/PRODUCT-FLOW.md) for the locked product flow,
clue model, demo rules, and future leaderboard boundary.
