# Campus AR — project context and end-to-end agenda

This document is the shared brief for humans and coding agents working on
Campus AR. It explains why the project exists, what the current MVP does, the
experience we are trying to create, what is intentionally deferred, and the
order in which the product should mature.

It is also the context for the `redesign-existing-projects` skill. Any visual
redesign should use this document together with [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md),
[`ARCHITECTURE.md`](ARCHITECTURE.md), and [`DESIGN.md`](../DESIGN.md).

---

## 1. The product in one sentence

Campus AR is a phone-first onboarding game that helps new university joiners
learn the campus by hunting for real places where famous films or series were
shot, using subtle proximity clues and a world-anchored AR cinema screen as the
reward.

The player should feel like they are discovering a story hidden in a familiar
campus, not completing an ordinary orientation checklist.

## 2. Why we are building it

New joiners need to become comfortable with a campus quickly. A conventional
map or tour can explain where things are, but it rarely creates curiosity,
memory, or a reason to explore.

The university already has a useful cultural layer: famous movie and series
shoots have happened at campus locations. Campus AR turns that history into a
guided discovery loop:

```text
learn the campus → notice the film connection → move through the grounds
→ identify the place → remember it because you found it yourself
```

The product is deliberately not completely upfront. It should nudge the player
towards the answer without naming the exact place or movie too early.

## 3. Primary audience and situation

### Primary player

- A new joiner who may not know the campus.
- Using a phone outdoors, often in bright light and in motion.
- May be unfamiliar with AR permissions and location-based interfaces.
- Wants a fast, playful introduction rather than a technical demo.

### Secondary users

- Orientation coordinators who start or explain the activity.
- Campus or communications teams who curate film-location stories.
- Future administrators who configure spots, clues, clips, and events.

### Operating conditions

- The phone is the main interface.
- Camera and location permissions can be denied, delayed, or unavailable.
- Network quality may be inconsistent.
- GPS is approximate and AR tracking can temporarily degrade.
- The experience must remain understandable when a technical subsystem is
  waiting, warming up, or unavailable.

## 4. Product promise

The player should always know what to do next.

The product must help a first-time player:

1. Start without operator instruction.
2. Understand that they are following a mystery, not a turn-by-turn map.
3. Move closer using a simple warm/cold signal.
4. Open the camera only when it is useful.
5. See a stable AR cinemascope at the discovered location.
6. Watch the clip and learn the real film connection.
7. Continue to the next mystery or finish with a meaningful result.

## 5. The locked experience model

The core loop is:

```text
mystery → subtle nudge → search → discovery → reward → next mystery
```

The screen model is:

```text
Welcome → permission setup → Hunt dashboard ↔ Camera search
                                      ↓
                         AR discovery → clue + clip reward
                                      ↓
                            next mystery / finish
```

### Navigation contract

- `Start exploring` opens the Hunt dashboard.
- The dashboard explains the current signal, mystery state, and next action.
- `Open camera` enters the camera view.
- `Hunt` opens a sheet over the live camera.
- Closing the sheet returns to the same camera session, same world origin, and
  same mystery.
- `Exit` intentionally leaves the camera, stops XR, and returns to the Hunt
  dashboard.
- The AR session is not restarted merely because a player opens the Hunt
  sheet.

### Player-facing vocabulary

Keep language plain and human:

- `Not found` — this mystery has not been discovered.
- `Ready` — the player is close enough to open the camera.
- `Found` — the player has completed it.
- `Cold`, `Warm`, `Hot`, `You’re close` — progressively useful proximity
  feedback.
- `Open camera`, `Hunt`, `Recenter`, `Exit to hunt` — direct actions.

Do not expose internal terms such as `off-air`, `in the can`, `world lock`, or
`RCA` in the main player flow. Diagnostic labels may remain in development
tools only.

## 6. Current MVP state

The current app is a static TypeScript/Vite application deployed to Cloudflare
Pages. It currently includes:

- Five configured campus film mysteries in `src/data/spots.ts`.
- A real GPS source and a simulated demo source.
- A wall-clock hunt timer that survives reloads and brief backgrounding.
- A dashboard with a heat signal, mystery picker, progress, and status list.
- A long-lived 8th Wall/XR8 camera session.
- Three.js world tracking and a world-anchored cinemascope/film portal.
- A clapperboard-style reveal animation.
- A reveal panel with the discovered place, film title, split time, clue/campus
  copy, and clip playback.
- A same-origin `/clips/` fallback for demos and an S3-first media path where
  configured.
- A stub leaderboard boundary in `src/leaderboard.ts`.
- Development-only simulation and debug hooks.
- Automated unit, typecheck, lint, build, and browser smoke coverage.

The scene list is settled: twelve sites surveyed on 28/08/2026 and 02/09/2026,
nine of them in play (see `shared/src/content.ts`). Clips 1-10 are from
`Bodyguard`, 11-12 from `Hostel Daze`. Spots fall back to their visual asset
until their clip file is in `client/public/clips/`.

Latest verified deployment at the time this document was written:

<https://7b99f3c9.campus-ar.pages.dev>

Deployment URLs are immutable previews and may change. Use the deployment
output as the source of truth for a newer release.

## 7. What the player experiences end to end

### A. Welcome

The landing screen should answer three questions immediately:

- What is this? A campus film-location hunt.
- What do I do? Follow a signal, find a place, reveal a scene.
- What should I tap? One clear primary action.

The demo entry point must be visible but secondary. It is for testing,
operators, and people who cannot access location services.

### B. Permission and readiness

Ask for camera and location at the moment each is needed. Explain why in plain
language. If a permission fails:

- Keep the player in the flow.
- Show a direct recovery action such as `Enable location`.
- Offer the demo path when real location cannot be used.
- Never leave the player staring at a silent loading state.

### C. Hunt dashboard

The dashboard is the planning and orientation surface. It shows:

- How close the player is through the heat signal.
- The current mystery status.
- A secondary mystery picker.
- The list of found, ready, and not-found mysteries.
- The one next action, usually `Open camera` or `Try the demo`.

It must not reveal the answer before discovery. The exact building/place and
movie title belong to the reveal.

### D. Search

The player moves through campus while the signal changes continuously. The
signal is feedback, not a map or a directional control:

- No arrows.
- No turn-by-turn directions.
- No exact coordinates.
- No misleading compass behavior.
- Ambiguity is acceptable when several spots are similarly plausible.

When close enough, the interface says that the camera is ready.

### E. Camera and AR discovery

The camera surface should be calm and legible over a live feed. It includes:

- A small progress/timer area.
- A central reticle that communicates tracking state.
- A warm/cold signal area.
- A recenter control.
- A Hunt control to open the sheet.
- An explicit Exit control.

The AR portal should appear at the discovered place, persist in world space,
and remain stable when the player looks away and back. Recenter should repair
drift without resetting the hunt or changing the target.

### F. Reveal reward

The reveal is the emotional payoff. It should combine:

- A world-anchored cinemascope.
- The movie clip, beginning only when the reveal is ready.
- A clapperboard or equivalent discovery animation.
- The actual place and film connection.
- A split time that reinforces the game.
- One memorable campus fact or clue payoff.
- A direct `Next mystery` / continue action.

The outside-tap and Escape dismissal paths remain available, with focus
returned to the triggering control.

### G. Finish

The summary shows the total time, discovery splits, and a personal result. The
leaderboard is currently local/stubbed; its interface should already feel like
the beginning of a shared campus competition.

## 8. Clue and mystery design

The clue system should create curiosity without making the player wander
without purpose.

### Progressive clue ladder

1. **Far:** thematic clue about the scene or campus story.
2. **Warm:** broad environmental cue.
3. **Close:** sensory or visual nudge that helps the player search.
4. **Found:** exact place, film connection, clip, and campus fact.

Before discovery, clues must not expose an exact building name, coordinates, or
movie title unless the player explicitly requests an optional stronger hint.

### Future clue mechanics

Potential additions, after the core loop is stable:

- A limited optional hint with a time penalty.
- A clue streak for solving several mysteries without help.
- A campus-fact card earned after discovery.
- A “scene memory” recap after the hunt.
- Different clue styles: visual, sound, architecture, and local history.

These should support exploration, not turn the app into a noisy achievement
dashboard.

## 9. Gamification direction

The long-term aim is a fair, replayable campus competition.

### MVP score model

Start with only the information that is easy to explain and verify:

- One total hunt clock.
- Split time for every discovery.
- Discovery order.
- Personal best on the device.
- Final leaderboard position once a backend exists.

### Later layers

Only add these when they improve the hunt rather than distract from it:

- Optional clue bonuses.
- Streaks.
- Titles such as “First take” or “Location scout”.
- Team or cohort boards.
- Weekly orientation challenges.
- Campus-history collections.
- Time-boxed events during induction week.

### Fairness rules

The future server must validate score claims. It should check event order,
timestamps, approximate proximity, GPS accuracy, duplicate events, and
impossible completion times. Exact location should not be retained unless
there is a clear product need.

## 10. Backend boundary

The current app intentionally keeps the leaderboard behind one swap point:
`src/leaderboard.ts`.

The eventual client event stream is:

```text
hunt_started
mystery_selected
clue_unlocked
camera_opened
location_reached
scene_revealed
hunt_completed
```

The first backend should provide:

- A hunt/session identifier.
- Server timestamps.
- A validated completion record.
- A leaderboard query by event, cohort, or campus.
- Idempotent event submission.
- Basic abuse protection.
- Clear retention and privacy rules.

Do not couple the first backend to the AR renderer. The client should emit
product events; the server should validate the competition.

## 11. Media and asset strategy

### Film clips

- Store deployable demo clips in `public/clips/`.
- Keep S3 as the primary source only when CORS and byte-range support are
  configured.
- Keep a same-origin fallback for demos and reliable local testing.
- Prefer H.264 MP4 with AAC audio for phone compatibility.
- Target clips of 10 seconds or less and 5 MB or less where possible.
- Provide a poster or lightweight fallback asset for loading and failure.

### Free and permitted source material

Use assets only when their license and attribution requirements are understood.
Good categories include:

- University-owned photographs and archival material.
- Original photos captured by the project team.
- Public-domain textures and icons.
- Open-license campus maps or pictograms.
- Short original sound cues rather than copyrighted music.

Do not assume that a movie still, soundtrack, or online image is free to use
just because it is easy to download. The product should be able to ship with
original clue art and licensed/original media if rights are unclear.

## 12. Redesign agenda

The redesign skill is a quality lens, not permission to rewrite the product
architecture. Work in small, reviewable passes.

### Pass 1 — foundation and clarity

- Keep one obvious primary action per screen.
- Replace internal/technical copy with player language.
- Establish one type system with a readable display face and system fallback.
- Use sentence case for human-facing headings where possible.
- Preserve the mystery: no answer leakage from labels or filenames.
- Confirm light/dark metadata, safe areas, contrast, focus, and reduced motion.

### Pass 2 — flow and interaction

- Keep the camera session alive through Hunt-sheet navigation.
- Give every overlay a clear close/back action.
- Restore focus after closing sheets and reveals.
- Make pressed, loading, error, empty, and ready states visible.
- Ensure controls remain usable with one hand and on small screens.
- Avoid modal interruptions when an inline or sheet pattern is clearer.

### Pass 3 — AR polish

- Keep the cinemascope stable and pose-relative.
- Make tracking loss recoverable and understandable.
- Make recenter immediate, reversible, and non-destructive.
- Keep the signal readable over bright and dark camera scenes.
- Use motion to communicate state, not decoration.
- Respect reduced-motion and reduced-transparency preferences.

### Pass 4 — performance

- Keep the landing bundle small.
- Lazy-load the AR engine only when the camera opens.
- Avoid blocking external font requests.
- Load video only at reveal time.
- Use poster/loading states instead of blank frames.
- Keep clips compressed and range-request friendly.
- Measure mobile performance before adding visual effects.

### Pass 5 — content and gamification

- Write clue ladders for every spot.
- Add one memorable campus fact per discovery.
- Define hint penalties and streak rules before implementing them.
- Test whether players understand the goal without explanation.
- Keep the leaderboard as a reward, not the only reason to explore.

### Pass 6 — backend and operations

- Define the event schema.
- Add a session API and server-side timestamps.
- Validate scores and duplicate events.
- Add operator tools for enabling/disabling a hunt.
- Add privacy, retention, and moderation decisions.
- Run a real orientation pilot and observe where players get stuck.

## 13. What is intentionally deferred

These are valid future tasks, not reasons to destabilize the current MVP:

- Real backend leaderboard and account identity.
- Admin CMS for spots, clues, clips, and schedules.
- Team play and cohort competitions.
- Full analytics dashboard.
- Multiple campuses or multi-language content.
- Advanced computer-vision recognition of locations.
- Offline-first map tiles or full offline media caching.
- Complex achievement systems.

The next implementation should improve the current loop before adding any of
these surfaces.

## 14. Technical guardrails for agents

Before changing code:

1. Read [`AGENTS.md`](../AGENTS.md), [`README.md`](../README.md),
   [`ARCHITECTURE.md`](ARCHITECTURE.md), and [`PRODUCT-FLOW.md`](PRODUCT-FLOW.md).
2. Preserve unrelated uncommitted work.
3. Keep `main.ts` as orchestration; put domain rules in their owning module.
4. Keep GPS, proximity, hunt state, and AR rendering separate.
5. Keep `?sim`, `?debug`, and `window.__campushunt` development-only.
6. Do not reintroduce camera stop/start cycles for normal sheet navigation.
7. Do not add a clip without updating `src/data/spots.ts` and providing a
   same-origin fallback when needed.
8. Prefer small changes with a test or explicit manual verification.

After changes, run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

For a complete simulated journey, run Vite and then:

```bash
node scripts/e2e-smoke.mjs
```

For deployment:

```bash
npm run deploy
```

Confirm the returned Cloudflare Pages URL and test demo mode on a real phone.

## 15. Definition of a successful product

Campus AR is succeeding when:

- A new joiner can start without an explanation.
- The next action is visible without opening a technical menu.
- Players understand the warm/cold signal quickly.
- They explore rather than simply follow arrows.
- The answer remains hidden until they reach the place.
- The AR cinemascope appears reliably and stays put.
- Every scene clip plays without breaking the reveal.
- A discovery feels worth the walk.
- The player can continue smoothly to the next mystery.
- Demo mode is repeatable for testing and orientation staff.
- Real progress survives reloads.
- The future backend can validate a leaderboard result without redesigning the
  client experience.

The north star is simple: make the campus feel full of stories, then give the
player the satisfaction of finding one.
