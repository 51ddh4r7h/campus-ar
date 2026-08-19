# Campus Film Hunt — Design Plan

> Written before any component code. Every screen and token below derives from
> this document. Nothing here is Tailwind-default styling.

## 1. What this is

A timed **campus film-location scavenger hunt** for new joiners. Three spots on
campus were "filmed here" locations from well-known movies. You walk the
ground; GPS gives you *intentionally vague* warmth ("cold / warm / hot", never
a compass, never "walk 40m →"). When you stumble inside a spot's radius, the
app unlocks it and says **open your camera**. Tracking locks, and the moment
arrives: an in-world **clapperboard claps shut**, a golden spotlight erupts
upward, and the movie info + your split time roll in. Three sets, one clock,
everyone's time goes up on the marquee.

Visual metaphor: **movie premiere meets treasure map.** Marquee-gold on
cinema-navy. Big condensed display type, warm projector-light text, ticket-stub
results.

## 2. Token system

All tokens defined once in `tailwind.config.js` and reused everywhere. No
arbitrary values splattered through components.

### Color — "after the houselights go down"

| Token | Hex | Role |
|---|---|---|
| `night` | `#070A12` | Cinema-navy near-black — app base |
| `abyss` | `#04060B` | Deepest inset / behind overlays |
| `screen` | `#101624` | Panel surface — "backstage" surfaces |
| `gold` | `#F3B93F` | Marquee-lamp gold — primary accent, CTAs, found states |
| `brass` | `#B97E1E` | Burnished gold — gradients, pressed/active states |
| `spotlight` | `#FFE9AE` | Warm projector highlight — success, revealed text |
| `ember` | `#D94838` | Marquee red — warnings, "live" only (sparingly) |
| `chalk` | `#EAE4D5` | Warm paper-white — primary text |
| `fog` | `#8B93A5` | Dusk-muted secondary text |
| `line` | `#232B3C` | Hairline seams on panels (borders, not layout rules) |

Deliberately **not** slate/blue-600 defaults; deliberately **not** cream +
terracotta serif, and not near-black + single neon.

### Type

- **Display: Bebas Neue** — condensed marquee caps for spot names, band
  labels, totals, the big reveal title. Loaded from Google Fonts.
- **UI / body: Instrument Sans** (400–700) — clean, characterful, warm.
- **HUD: system mono** stack only (debug layer stays quiet).

### Shape + depth

- Spacing: Tailwind's 4px-base numeric scale, used only from a canonical set
  (`1…12` steps) — nothing ad hoc.
- Radii: `panel` 18px (cards/overlays), `tile` 14px (chips/tickets),
  `chip` 10px (mini chips), `rounded-full` for pills.
- Shadows: `raise` (deep panel lift), `lamp` (gold glow on CTAs/found),
  `hot` (small gold bloom for the hot band), `haze` (subtle inset seam).

## 3. Signature element: the AR reveal

The one thing the app is remembered by — the **clapperboard reveal**:

1. Tracking locks while you're inside the radius (≥2 continuous seconds).
2. A brass-and-navy **film slate** materializes ~1.8m ahead of you, anchored in
   world space (not screen-locked).
3. The clapper **arm snaps shut** — one crisp double clap — with a warm flash.
4. A gold **spotlight cone** erupts upward off the board; the slate presents.
5. The Tailwind panel rises from the bottom with the spot's movie title,
   one-line "filmed here" blurb, asset placeholder, and **your split time**.
6. Every other screen stays quiet and disciplined by comparison.

## 4. Motion

- **The reveal** gets the full orchestration (appear → clap → flash → present).
- **Proximity screen:** restrained micro-interactions only — the heat meter
  advances a segment, the timer ticks, CTA press states.
- **Respect `prefers-reduced-motion`:** skip the in-scene clap; show the final
  slate + panel with a plain fade.

## 5. Copy

Active, second-person, short. Every state has real copy — no lorem ipsum.
Samples: *"You're standing on a set right now — open your camera."*,
*"That set's already in the can."*, *"Walk the ground — GPS whispers when
you're near."*

## 6. Structure (reused per prompt)

- Proximity signal is **coarse only** (bands >100m / 55–100m / 25–55m /
  <25m / inside radius). The nearest spot's *name* surfaces only when it is
  unambiguously the closest; otherwise "a closer set is somewhere near".
- The 8th Wall engine + Three pipeline stays exactly as Phase 1 (engine binary,
  GlTextureRenderer, Threejs, XrController, full-window-canvas). Only the arrow
  trail is removed and replaced by the reveal device.
- Multi-session AR: open `XR8.run()` per spot, `XR8.stop()` on exit;
  pipeline modules register once.
- Timer derives from wall-clock `Date.now()` so background/foreground never
  resets it; state survives reloads via sessionStorage.
- Leaderboard is one stub function behind a clean interface — swap for a real
  backend later without touching the app.

## 7. Self-critique bar

Before "done": scan every screen for default-template tells (slate grays,
generic `rounded-lg`, `shadow-md`, default focus rings). If found → revise.