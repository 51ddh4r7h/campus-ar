# Campus Movie Hunt — build plan

Phased build of the individual-play game defined in
[`docs/PROJECT-CONTEXT-AND-AGENDA.md`], the
[Rulebook](https://claude.ai/code/artifact/721673ba-3c38-4f89-95c2-af5c0c2cf317),
and [`docs/UI-FLOW-BRIEF.md`].

The game is **server-authoritative**: the client emits position and intent, the
server owns routes, timestamps, validation, scoring, and standings. This is a
real change from the old static MVP — a backend is now part of the product.

---

## What we keep from the current codebase

| Module | Use |
| --- | --- |
| `src/ar.ts`, `src/ar-world.ts`, `src/film-portal.ts`, `src/reveal*.ts` | The 8th Wall + Three.js world-anchored screen. The hard part — already works for one clip. Adapted in Phase 3. |
| `src/location.ts` | GPS watch + the simulator. Kept; extended for continuous breadcrumbs. |
| `src/full-window-canvas.ts`, `src/haptics.ts` | Reused as-is. |
| `src/proximity.ts` | Distance math kept; the "verdict/heat" logic is replaced by geofence + dwell rules. |
| `src/hunt.ts` | Timer/split *display* logic kept; state ownership moves to the server. |

Everything else (screens, `main.ts` orchestration, the old dashboard) is rebuilt
against the new flow.

---

## Phase 0 — Foundations

Goal: a clean workspace and a locked data model. No gameplay yet.

- Commit or stash the current large working tree so we branch from a known state.
- Create the working branch; set up the repo layout: `client/` (Vite app) +
  `worker/` (backend) + `shared/` (types, pure game logic).
- **Data model** (see below) as shared TypeScript types.
- **Config module**: geofence radius defaults, dwell seconds, min-leg-time,
  max-speed, par constants, hint penalties — one file, no magic numbers.
- **Content stub**: the 10 locations with placeholder coords, radius, difficulty
  tier, clip URL, poster, campus fact, and a 3-rung clue ladder each.
- CI: typecheck + lint + test + build for both client and worker.

Deliverable: repo scaffold, `shared/` types compile, empty client and worker
deploy.

## Phase 1 — Backend game engine

Goal: the full game runs server-side and is testable with curl / a sim script.
No real UI.

- **Session lifecycle**: register player (name + roster id) → assign a balanced
  route → `start` records the server timestamp → `current_level = 1`.
- **Route generation**: an offline script produces a pool of ~200 balanced routes
  (total walk time within a band, difficulty sum within ±1, easy L1, no brutal
  leg). Assignment pulls an unused route per player and dedupes within a batch.
- **Progression state machine**: strict L1→L5 unlock, splits, completion.
- **Validation endpoint** — all checks server-side, all pure and unit-tested:
  - player + session valid
  - target is the player's current level
  - GPS inside that location's radius
  - dwell: inside continuously for N seconds with accuracy under threshold
  - leg time above the minimum for that leg
  - speed/displacement between this completion and the last is physically possible
  - previous levels complete
  - → on pass: record split, advance level, return next clue
  - → on fail: typed reason (`wrong_location` / `level_locked` / `signal` / `too_fast`)
- **Par-time scoring**: `score = elapsed − routePar`; hint penalties added to
  elapsed.
- **Event log**: append-only `hunt_started`, `clue_served`, `location_reached`,
  `hint_used`, `hunt_completed`, plus flags (`speed_flag`, `skip_attempt`).
- **Breadcrumb ingest**: batched position uploads, stored for review.
- **Standings query**: rank by score for finished players, by level for active;
  never returns future clue/location data.

Deliverable: a sim script registers a player, walks the route via fake fixes, and
completes a scored hunt end to end. Full test coverage on validation + scoring +
route generation.

## Phase 2 — Client shell and core flow (no AR)

Goal: the whole journey playable on a phone in demo mode, camera view is a plain
letterboxed clip.

- App structure and router for the screen flow in `UI-FLOW-BRIEF.md`.
- **Design system**: tokens, glass components, motion primitives, from §2 of the
  brief. Light/dark, reduced-motion, reduced-transparency, safe areas.
- Screens: Splash, Welcome, How to Play, Permissions, Ready, Clue, Search
  (no map, camera optional), You're Here, Level Complete, Standings, Finish, and
  the error/recovery states.
- Wire to the worker: session, clue delivery, GPS watch → validation calls,
  splits, standings, hint ladder + penalty display.
- **Continuous position tracking** + breadcrumb upload while playing.
- Timer: server-synced start, wall-clock display, survives reload/background.
- **Demo mode**: simulated GPS that walks the assigned route — the primary way to
  test without walking campus. Also the operator fallback.
- Reveal = fullscreen letterboxed clip + overlay (AR deferred to Phase 3).

Deliverable: a deployed build where demo mode plays a complete scored hunt with
real screens.

## Phase 3 — AR layer

Goal: the camera-first experience and the world-anchored reveal.

- Lazy-load the 8th Wall engine only when the camera opens (keep the landing
  bundle small).
- Adapt `film-portal.ts` for the reveal: curved screen anchored in world space,
  clip with sound, warm light spill, recenter, drift repair.
- **Camera-first Search HUD**: feed grade (grain, vignette, warm bias), reticle
  with converge-on-entry + scan sweep, "initializing" ground-grid beat, a soft
  world-anchored glow when near.
- **Compare-the-shot**: ghost clip overlay, alignment, lock.
- **Photo mode**: capture with the anchored screen in frame, save/share.
- **Fallback ladder**: full AR → "move slowly" → fullscreen clip. Geofence
  completion never depends on tracking.
- Optional: one Three.js prop at the reveal (clapperboard or reel).

Deliverable: on a real phone, reaching a location shows a stable anchored screen
playing the clip; tracking loss degrades gracefully.

## Phase 4 — Admin and operations

Goal: an organiser can run a batch without watching every player.

- **Batch management**: create batch, generate + review the route pool, open /
  close, recalibrate par times from collected leg data.
- **Roster import**: player list → pre-registered logins.
- **Live dashboard**: every player's level, status, start time, splits, total.
- **Alerts**: stuck too long on a level, repeated invalid attempts, speed flag,
  at an unexpected location, technical issue reported.
- **Manual override**: confirm an arrival, adjust a time, reset a player.

Deliverable: run a full mock batch of simulated players from the dashboard.

## Phase 5 — Hardening and pilot

- Anti-cheat review tools: breadcrumb-trail viewer, par-outlier flags, one-click
  invalidate.
- Offline resilience: reconnect queue, resume-after-crash, honest offline UI.
- Performance: bundle budget, lazy AR, clip encoding + range-friendly hosting,
  video only at reveal.
- Accessibility pass against the brief's checklist.
- Content finalisation: real clips, clue ladders, campus facts, final coords.
  Spacing is no longer a fixed rule — `npm run layout` derives the safe geofence
  and thresholds from whatever coordinates are surveyed, and fails the build
  below ~18 m, which is where consumer GPS stops telling stops apart.
- **Real orientation pilot** — observe where players get stuck, tune par and
  clue difficulty.
- If prizes warrant it: add the optional 4-digit on-site code to You're Here.

---

## Data model (v1)

```
location   id · name · lat · lng · radius_m · difficulty(1-3)
           clip_url · poster_url · scene_ref_image
           campus_fact · clue_far · clue_warm · clue_close

batch      id · name · status(draft|open|closed) · created_at
           route_pool_seed · par_constants

player     id · batch_id · name · roster_id · session_token

route      player_id · stops[5] (ordered location_id)
           par_total_ms · leg_par_ms[5]

session    player_id · status(not_started|in_progress|complete|flagged)
           start_ts · end_ts · current_level · score_ms

split      player_id · level · location_id · reached_ts
           split_ms · hints_used · penalty_ms

event      player_id · type · ts · payload            (append-only)

breadcrumb player_id · ts · lat · lng · accuracy_m     (batched)
```

## Par model

```
leg_par_ms[k]  = walk_par[prev→stop_k] + identify_par[difficulty(stop_k)]
par_total_ms   = Σ leg_par_ms + 5 × dwell_par

walk_par   seeded from haversine × walking-speed factor,
           then overridden by measured medians after each batch
identify_par  easy 90s · medium 180s · hard 300s   (tune after pilot)
dwell_par     ~30s
hint_penalty  Hint 1 +90s · Hint 2 +180s total · show-location +300s
```

## Decisions (settled)

1. **Backend stack** — Cloudflare **Workers + D1**, on the free plan.
   Durable Objects (which need a paid plan) were dropped: live standings are
   polled by the client instead. A brief detour to AWS Lambda + DynamoDB was
   reverted — same free-tier outcome, more moving parts.
2. **Client framework** — **Svelte 5**.
3. **Repo strategy** — working branch `v2-movie-hunt`; previous build under
   `_legacy/` for AR-module salvage.
4. **Hosting** — Workers (API) + D1 (data) + Pages (client). `docs/DEPLOY.md`.
