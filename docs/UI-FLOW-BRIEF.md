# Campus Movie Hunt — UI Flow & Design Brief

A build brief for generating the mobile app UI. Covers the visual direction, a
design-token system, and every screen from launch to finish with its states and
transitions. Mechanics are locked in `docs/` — this document is the interface layer.

---

## 0. How to use this brief

- **Platform:** mobile web app, phone-only. Design at **iPhone 390 × 844** as the
  baseline; must also hold at 360 × 780 and 430 × 932. Used outdoors, in motion,
  often in bright sun — legibility and large hit targets matter more than density.
- **Build it as one continuous prototype**, wired screen-to-screen per the Flow Map
  in §4. Every screen in §5 should exist, including the error states.
- **No fake device chrome.** Never draw a fake iOS status bar ("9:41 · battery ·
  wifi") or a fake keyboard. The real OS renders those on top. Leave the top
  ~47px and bottom ~34px as safe-area padding only.
- **Follow the visual direction in §2 exactly.** Don't invent a new palette or
  type system.

---

## 1. The app in one minute

New university joiners play a solo, timed hunt. Each of 5 levels shows a **short
movie clip** that is a **clue to a place on campus**. The player recognises the
place, walks there, and when their phone is inside that location's GPS radius the
scene **plays back as a cinema screen anchored to the real spot** — the reward.
Fastest fair time wins (scored against a per-route "par time" so different routes
are comparable).

The core rhythm: **watch → think → walk → arrive → reveal → next.**

The camera viewfinder is the main surface. The player holds the phone up and
looks at campus *through* it for most of the game. UI floats over the live feed
as minimal glass chrome.

**Hard rule — never leak the answer.** No screen before the reveal may show the
location name, the film title, a map with the target marked, or a directional
arrow. The clue does the work.

---

## 2. Visual direction

### Principle

> **Chrome is Apple-grade glass — minimal, calm, restrained.**
> **Content and the reveal are cinematic — letterboxed, warm, filmic.**

The HUD gets out of the way. The movie moment is where the design goes full
cinema.

### Color tokens (dark-first — this is a camera app)

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0A0B0D` | Base ground behind non-camera screens |
| `--surface` | `rgba(20, 22, 26, 0.62)` | Glass panels (see material spec) |
| `--surface-raised` | `rgba(28, 31, 36, 0.74)` | Sheets, the one elevated layer |
| `--text` | `#F5F3EC` | Primary text — a warm "projected" white, not pure #FFF |
| `--text-dim` | `rgba(245, 243, 236, 0.60)` | Secondary text, captions |
| `--hairline` | `rgba(245, 243, 236, 0.14)` | Borders, dividers |
| `--amber` | `#E8A54C` | Primary actions, the running timer, focus |
| `--amber-press` | `#C9863A` | Pressed state of amber controls |
| `--success` | `#7FD1A6` | Level validated, "found" |
| `--alert` | `#E5654A` | Wrong location, level locked, errors |
| `--signal-cold` | `#6FA8C7` | Warm/cold meter — far end (hint only) |
| `--signal-hot` | `#E8A54C` | Warm/cold meter — near end |

Semantic colors (`success`, `alert`) are separate from the accent and are only
for state.

### Typography

- **UI / all chrome:** `-apple-system, "SF Pro Text", system-ui, sans-serif`.
  On iPhone this resolves to real SF Pro — use it, don't substitute.
- **Cinematic display** (reveal title card, marquee, "Campus Movie Hunt"
  wordmark): a high-contrast display serif. Placeholder: **Instrument Serif**.
  Used sparingly — title card, section headers on the welcome/finish screens,
  nothing in the HUD.
- **Timecodes and scores:** `ui-monospace, "SF Mono", monospace`, with
  `font-variant-numeric: tabular-nums` so digits don't jitter as the timer runs.
- **Scale (px):** 13 · 15 · 17 (body) · 20 · 28 · 40 · 56 (title card only).
- Uppercase labels get `letter-spacing: 0.08em`. Headings get
  `text-wrap: balance`.

### Glass material spec

Every glass panel:

```
backdrop-filter: blur(24px) saturate(180%);
background: var(--surface);              /* or --surface-raised for sheets */
border: 0.5px solid rgba(255,255,255,0.08);
border-top-color: rgba(255,255,255,0.22);   /* the bright top edge */
box-shadow: 0 8px 40px rgba(0,0,0,0.40);
border-radius: 24px;
```

- **Maximum two glass layers on screen at once.** Never stack glass on glass.
- Any text on glass over the live camera needs a **soft dark scrim gradient**
  behind it (top-down or radial) so it survives a blown-out sky.
- **Reduced transparency:** if `prefers-reduced-transparency`, glass becomes a
  solid `#16181C` panel with the same border and radius, no blur.

### Motion

| Moment | Duration | Easing |
| --- | --- | --- |
| Standard (buttons, toggles, small moves) | 280ms | `cubic-bezier(0.32, 0.72, 0, 1)` (spring) |
| Sheet present / dismiss | 360ms | same spring; scrim fades 240ms linear |
| Screen-to-screen push | 320ms | same spring; new screen slides + fades from 8px |
| **The reveal** | 900ms | ease-out; cinemascope scales up from center as two letterbox bars slide in from top and bottom |
| Toast in / out | 220ms | ease-out / ease-in |

- Panels **scale from their origin point and settle** — nothing snaps or pops.
- **Reduced motion:** every transition above collapses to a 120ms opacity fade.
  The reveal becomes a straight cut to the letterboxed clip.

### Spacing, radius, grid

- Spacing scale: 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Screen edge padding: 20px. Safe-area insets on top of that.
- Radii: cards/sheets 24px · buttons 20px · pills and the timer chip fully round.
- Hit targets: **minimum 44 × 44px**, primary actions 56px tall.

### Iconography

Thin line icons, consistent 1.5px stroke, 24px grid, rounded caps — SF Symbols
style. Needed: back/chevron, close (×), location pin, camera, lightbulb (hint),
recenter (crosshair), timer, trophy/flag, share, refresh, checkmark, lock,
info (i), play, camera-shutter.

### Do-not list

- No fake status bar or keyboard.
- No navigation arrows, no compass, no map with the target pinned, no distance
  readout — before the reveal.
- No gradient-mesh backgrounds, no emoji in UI, no rounded-card-with-left-accent-
  rail pattern.
- No more than one primary (amber) button per screen.
- Don't show exact GPS coordinates anywhere player-facing.

---

## 3. Global elements

### The camera layer

From §5.7 onward, the background is a **live camera feed** (use a warm,
slightly-graded dusk campus photo as the stand-in in the prototype). All HUD sits
on top as glass. When the app needs the camera but doesn't have it yet, show a
soft dark gradient placeholder, never a black void.

### Timer chip (persistent during play)

Top-left, glass pill, safe-area aware. Mono digits, `--amber`, format `M:SS`
(switches to `MM:SS` past ten minutes). Ticks up live. Gently pulses `--amber`
for 600ms on each level completion.

### Level indicator (persistent during play)

Top-right, glass pill: five short segments, filled `--success` for done, `--amber`
outline for current, `--hairline` for locked. No numbers needed — it reads at a
glance.

### Toast

Centered, ~72px below the top safe area, glass pill, auto-dismiss 2.6s, tap to
dismiss early. Icon + one line. Colors: `--alert` for wrong/locked, `--text` for
neutral, `--success` for positive.

### Bottom sheet

`--surface-raised`, 24px top radius, grab handle (36 × 4px, `--text-dim`),
drag-to-dismiss, backdrop scrim `rgba(0,0,0,0.5)`. Used for: How to Play, Hints,
Leaderboard, the "you're here" confirm. Closing a sheet always returns to the
exact screen underneath — the camera session never restarts.

---

## 4. Flow map

```
Splash
  ↓
Welcome ──────────────► How to Play (sheet)
  ↓                          ↓ "Got it"
Permissions (location, then camera — each at point of need)
  ↓
Ready / Start
  ↓  tap START → timer starts
┌───────────────────────────────────────────────┐
│  Clue view  (Level N)                          │
│     ↓ "Start searching"                        │
│  Search HUD (camera)  ◄──── Hint sheet         │
│     ↓ enters GPS radius                        │
│  You're Here (confirm sheet)                   │
│     ↓ "Reveal the scene"  → validation         │
│  Reveal (cinemascope + clip + info)            │
│     ↓                    ↘ Photo mode          │
│  Level Complete (split) ──► next Clue view     │
└───────────────────────────────────────────────┘
     after Level 5 ↓
Finish / Summary  ◄──► Leaderboard

Any point → error/recovery states (§5.15) → back into flow
Leaderboard reachable from Search HUD via a small trophy button
```

---

## 5. Screen catalog

Each entry: **role · layout · components · copy · states · transitions.**

### 5.1 Splash

- **Role:** first paint while the app boots. ~1.2s max, or until ready.
- **Layout:** full `--bg`. Centered wordmark "CAMPUS MOVIE HUNT" in the display
  serif, `--text`, with a thin `--amber` underline that draws left-to-right.
  Faint film-grain texture over the whole screen.
- **States:** if boot fails, cross-fade to a minimal "Couldn't start — tap to
  retry" on the same ground.
- **Transitions:** out — cross-fade to Welcome, 320ms.

### 5.2 Welcome

- **Role:** say what this is in three seconds; one clear way forward.
- **Layout:** `--bg`. Top third: wordmark + a one-line tagline. Middle: a short
  3-line explainer. Bottom: primary button + a secondary text link.
- **Components:**
  - Tagline: *"Five movie scenes are hidden across campus. Find where they were
    shot."*
  - Explainer (three lines, each with a thin line icon):
    *Watch a scene · Recognise the place · Walk there and watch it come alive.*
  - Primary button (amber, 56px): **How to play**
  - Secondary link (`--text-dim`): *I know the rules — skip ahead*
- **States:** returning player mid-hunt → this screen is skipped; go straight to
  a "Resume" variant of Ready (§5.5).
- **Transitions:** "How to play" → How to Play sheet slides up. Skip link →
  push to Permissions.

### 5.3 How to Play (bottom sheet)

- **Role:** the rules pop-up. Scannable, not a wall of text.
- **Layout:** sheet at ~88% height. Scrollable. Grab handle. Title "How to play"
  in display serif. Content is 6 short blocks, each = icon + bold line + one
  sentence:
  1. **Five levels, in order.** Finish one to unlock the next.
  2. **The clip is the clue.** It shows a real campus spot. No map, no arrows.
  3. **Walk there with your phone.** You'll know you've arrived when the scene
     plays.
  4. **Stuck? Take a hint.** It costs you time, and the cost is the same for
     everyone.
  5. **Your route is yours.** It won't match anyone else's — following people
     won't help.
  6. **Fastest fair time wins.** Your score adjusts for how far your route was.
- **Footer (sticky):** primary button **Got it** → dismisses sheet.
- **Transitions:** standard sheet present/dismiss.

### 5.4 Permissions

- **Role:** ask for location, then camera — each with a plain reason, at the
  moment it's needed (location here; camera deferred until §5.7 if you prefer,
  but priming both here is acceptable).
- **Layout:** `--bg`, centered. Large line icon (pin, then camera). Heading +
  one sentence. One primary button that triggers the real OS prompt.
- **Copy — location:**
  - Heading: *"Turn on location"*
  - Body: *"We use it only to check when you've reached a scene. We never show
    your position to anyone."*
  - Button: **Enable location**
- **Copy — camera:**
  - Heading: *"Turn on the camera"*
  - Body: *"The hunt happens through your camera. Point it at campus and the
    scenes appear where they were filmed."*
  - Button: **Enable camera**
- **States:**
  - *Waiting* — button shows a spinner while the OS prompt is open.
  - *Denied* — icon turns `--alert`, body changes to *"Location is off. Open
    Settings to turn it back on, or try the demo."* with two buttons: **Open
    Settings** (secondary) and **Try the demo instead** (primary).
  - *Unavailable / no GPS* — *"We can't get a location signal here. You can
    still try the demo."*
- **Transitions:** on grant → push to Ready.

### 5.5 Ready / Start

- **Role:** the calm moment before the clock starts. One giant action.
- **Layout:** `--bg` with faint grain. Centered: small label *"When you're
  ready"*, then a large circular **START** button (amber ring, filled on press,
  ~140px). Below it, `--text-dim`: *"Your timer starts the moment you tap."*
- **Components:** a tiny glass chip top-center showing your player name.
- **States:**
  - *Resume variant* — label reads *"You're on Level N"*, button reads
    **RESUME**, and a mono line shows the running elapsed time (it never
    stopped).
  - *Demo chip* — if in demo mode, a small `--text-dim` "DEMO" pill top-right.
- **Transitions:** tap START → button fills, 280ms, then cross-fade to the first
  Clue view. Timer chip animates in from the top-left.

### 5.6 Clue view (Level N)

- **Role:** deliver the movie clip and let the player study it.
- **Layout:** `--bg`. The clip plays in a **letterboxed 2.39:1 frame**, centered,
  ~90% width, rounded 16px, with a subtle outer glow. Auto-plays muted, loops.
  A mono line above: `LEVEL N — SCENE`. Below the frame: a replay control and a
  scrub bar (thin, amber progress). No caption, no hint about the location.
- **Components:**
  - Timer chip + level indicator (persistent, top).
  - `Replay` (line icon) and a mute/unmute toggle — teaser is muted by default;
    full sound is saved for the reveal.
  - Primary button (bottom, amber): **Start searching**
  - Secondary (text link, `--text-dim`): *"Show the clip again later"* — implies
    it stays accessible.
- **States:**
  - *Loading* — the frame shows a soft shimmer placeholder at 2.39:1, never a
    black box; mono line reads `LOADING SCENE…`.
  - *Clip failed* — frame shows a still fallback image + *"Couldn't load the
    video — here's a frame from the scene."* Game continues.
- **Transitions:** "Start searching" → the clip frame shrinks to a small
  glass thumbnail that docks bottom-left, camera feed fades in behind. This
  is the handoff into the HUD.

### 5.7 Search HUD (camera)

- **Role:** the main play surface. Camera-first, minimal glass.
- **Layout:** live camera fills the screen. On top:
  - **Top-left:** timer chip. **Top-right:** level indicator.
  - **Top area, small:** the docked clip thumbnail (tap → replays the clip in a
    small glass card, doesn't leave the HUD).
  - **Center:** a subtle reticle — a thin amber bracket frame that breathes
    slowly. It communicates "tracking" state, not direction.
  - **Bottom bar (glass):** three controls — `Hint` (lightbulb),
    `Recenter` (crosshair, only shown once AR content exists), and a small
    `Leaderboard` (trophy). No "next" button — arrival is automatic.
  - **No proximity meter by default.** It only appears after Hint 1 is taken.

**Camera treatment (Option A — camera-first is confirmed).** Layer back-to-front:
1. *Grade overlay, always on:* fine film grain, edge vignette, faint warm wash,
   ~1px chromatic fringe at the extreme edges — a cinematic viewfinder, not a raw
   feed.
2. *Initializing beat, first 1s only:* a faint wireframe ground-grid shimmer over
   the lower half that fades out.
3. *World-anchored cue, when near the target:* a subtle luminous shaft of warm
   light or a glowing film-frame outline, composited in perspective, anchored to
   a world point, parallaxing as the view moves — atmosphere, never a waypoint.
4. *Reticle:* four corner brackets ~15% screen width, amber ≥65% opacity, slow
   breathe, converge-on-entry, a scan-line sweep every ~4s.

- **Compare the shot:** tapping the docked clip thumbnail drops the clip to ~40%
  opacity full-screen over the camera; the player pans to align it with a real
  building; on match it flashes and locks, then the You're Here sheet can rise.
  Caption: *"Line it up with what's in front of you."* This replaces a wandering
  proximity meter as the primary help.

- **Components:**
  - Reticle states: *searching* (dim, slow breathe), *tracking ok* (amber, steady),
    *tracking lost* (`--alert`, "hold still" microcopy below).
  - Warm/cold meter (post-hint only): a thin vertical bar on the right edge,
    `--signal-cold` → `--signal-hot` gradient fill, no numbers, only active
    within ~80m.
- **Copy:** minimal. If tracking is lost: *"Move slowly to find your bearings."*
- **States:**
  - *Camera warming up* — dark gradient + centered spinner + *"Starting
    camera…"*.
  - *Entered radius* — the reticle blooms amber, a soft haptic, and the "You're
    here" sheet (§5.9) rises automatically.
- **Transitions:** into Reveal — see §5.10. Opening any sheet here must not
  restart the camera.

### 5.8 Hint sheet

- **Role:** the penalized hint ladder.
- **Layout:** bottom sheet, `--surface-raised`, ~55% height. Title "Take a hint".
  A short line: *"Each hint adds time. Everyone pays the same."*
- **Components — three rows, revealed in order:**
  1. **Hint 1 — a nudge** · `+0:90` · unlocks a text hint *and* the warm/cold
     signal. Button: **Use hint (+1:30)**.
  2. **Hint 2 — almost there** · `+1:30 more` · a near-obvious line or a zoomed
     detail from the clip. Locked until Hint 1 used. Button: **Use hint (+1:30)**.
  3. **Show me the location** · `+5:00` · reveals the spot on a small map.
     Locked until Hint 2 used. Styled with `--alert` text — a last resort.
- After a hint is used, that row collapses to show the hint content inline, with
  a mono `PENALTY +M:SS APPLIED` tag.
- **States:** rows show `LOCKED` with a lock icon until the prior hint is used.
  A 4-minute stuck timer gates whether Hint 1 is offered at all (before that,
  the row reads *"Available in M:SS"*).
- **Transitions:** standard sheet. Using a hint bumps the timer chip with a brief
  `--alert` flash to make the cost visible.

### 5.9 You're Here (confirm sheet)

- **Role:** the deliberate "I made it" tap that triggers validation.
- **Layout:** bottom sheet, ~40% height, rises automatically on radius entry.
  Big `--success` checkmark forming. Line: *"This looks like the place."*
  Sub: *"Hold still for a moment while we lock the scene."*
- **Components:** primary button **Reveal the scene** (amber). A thin progress
  ring around it fills over the ~20s dwell requirement — the button is disabled
  and shows *"Getting a steady signal…"* until it completes, then enables.
- **States:**
  - *Signal not steady* — ring stalls, sub-copy *"Move to a more open spot for a
    clearer signal."*
  - *Wrong location* (player tapped in at a spot that isn't their current
    target — only possible via edge cases) → sheet dismisses, `--alert` toast
    *"This isn't your scene. Keep looking."*
  - *Level locked* → `--alert` toast *"Finish the earlier scenes first."*
- **Transitions:** "Reveal the scene" → sheet drops away, then the Reveal
  sequence begins (§5.10).

### 5.10 Reveal

- **Role:** the emotional payoff. Full cinema.
- **Sequence (900ms):** camera feed stays live; two black letterbox bars slide in
  from top and bottom to 2.39:1; a **curved cinema screen scales up from the
  center**, anchored in world space; the clip starts from the top **with sound**;
  a soft warm light spills from the screen onto the scene.
- **Then, layered over the bottom letterbox as glass:**
  - Display serif: **the location name** (revealed now, for the first time).
  - Below: **the film title** + a one-line "filmed here" blurb.
  - A mono line: `LEVEL N · SPLIT M:SS`.
  - One **campus fact** card — a single sentence.
  - Buttons: **Take a photo** (secondary) and **Next scene** (amber primary).
    On Level 5, primary becomes **See your result**.
- **Interaction:** the player can pan the phone to look around the anchored
  screen; a `Recenter` control sits top-right if it drifts.
- **States:**
  - *AR tracking unavailable* — skip the anchored screen; play the clip
    **full-screen letterboxed** instead. Everything else (name, film, fact,
    buttons) is identical. This is the acceptable fallback; the level still
    completed on GPS.
  - *Clip unavailable* — show the location's still image in the frame with the
    same overlay.
- **Transitions:** "Next scene" → letterbox bars close like a shutter (320ms),
  then the next Clue view (§5.6). "Take a photo" → Photo mode.

### 5.11 Photo mode

- **Role:** the shareable moment — the marketing.
- **Layout:** live camera + the anchored cinema screen still playing. Chrome
  reduces to a single bottom bar: a large round **shutter**, a small **flip
  toggle** hint (if front camera available), and a `×` to exit.
  A faint `CAMPUS MOVIE HUNT` mark sits in a bottom corner and will appear on the
  saved image.
- **After capture:** the frozen shot fills the screen with **Save**, **Share**,
  and **Retake**. Save/Share use the OS sheet.
- **States:** *camera flip unsupported* — hide the toggle. *save failed* — toast
  *"Couldn't save — try Share instead."*
- **Transitions:** `×` or Save → back to the Reveal overlay, unchanged.

### 5.12 Level Complete

- **Role:** a brief beat between levels. Often folded into the Reveal's "Next
  scene" press, but specify it as its own state.
- **Layout:** the shutter-close transition lands on a 1.5s interstitial:
  `--bg`, centered, the level indicator animating its new segment to
  `--success`, a mono line `LEVEL N — M:SS`, and the running total below.
- **Transitions:** auto-advances to the next Clue view; tapping anywhere skips
  the wait.

### 5.13 Leaderboard (sheet)

- **Role:** live standings without leaking anything.
- **Layout:** bottom sheet, ~80% height. Title "Standings". A segmented control:
  **Overall** / **Your level**.
- **Row:** rank · player name · status. Status is one of: a mono score
  `−M:SS` / `+M:SS` (vs par, for finished players), or `Level N` for players
  still going. **Never** a location, clip, or route detail.
- Your own row is pinned and highlighted `--amber` outline, even if off-screen.
- Top of sheet: your current standing in large mono — *"You're 4th"* with your
  live score-vs-par.
- **States:** *not enough players finished* — *"Standings open once players start
  finishing."* *offline* — last-known with a `--text-dim` "Updated M:SS ago".
- **Transitions:** standard sheet; returns to whatever was underneath.

### 5.14 Finish / Summary

- **Role:** the result screen. Personal, celebratory, honest.
- **Layout:** `--bg`, film grain, a subtle amber vignette.
  - Top: display serif **"That's a wrap."**
  - Hero number: your **final score vs par** in large mono (`UNDER PAR BY 3:42`),
    with raw total time as a smaller line beneath.
  - Your **rank**: *"1st of 34"* — with a small trophy if top 3.
  - **Splits list:** five rows, each = level number · location name (now safe to
    show) · split time · any hint penalties as a `+M:SS` tag.
  - Buttons: **View standings** (secondary) and **Free play** (amber) — replay
    the 5 locations you didn't get, no clock.
  - Footer: a `Share result` link.
- **States:** *still being verified* — if the player's score is flagged for
  organiser review, show *"Your time is being confirmed"* in place of the rank,
  score still visible.
- **Transitions:** in — a slow 600ms fade with the vignette blooming. Reduced
  motion: straight cut.

### 5.15 Error & recovery states

Design each as a real screen or overlay — never a silent spinner.

| State | Trigger | Screen |
| --- | --- | --- |
| **GPS won't settle** | Inside radius >60s, no steady fix | Overlay on the You're Here sheet: *"We can't get a clear signal here. Ask a volunteer to confirm your arrival, or move to open ground."* + **I've asked a volunteer** button (organiser confirms server-side). |
| **Location lost mid-walk** | Signal drops for >30s | Non-blocking `--text-dim` banner under the timer: *"Weak signal — keep walking."* No modal. |
| **Camera permission lost** | Revoked mid-game | Full overlay, dark gradient: *"Camera turned off. Turn it back on to keep playing."* + **Enable camera**. Timer keeps running (shown). |
| **Connection lost** | No server for >15s | Small glass pill top-center: *"Reconnecting…"* with a slow spinner. Play continues locally; validations queue. On reconnect: *"Back online"* success pill, 1.5s. |
| **App reopened / phone died** | Cold start with an active session | Ready screen's Resume variant (§5.5). Never lose progress; the clock never stopped. |
| **Tracking lost (AR)** | SLAM lost in Reveal or Search | Reticle → `--alert`, centered line *"Hold still and pan slowly."* If unrecovered in 8s during Reveal, fall back to full-screen clip. |
| **Attempted skip** | Player at a not-yet-unlocked location taps in | `--alert` toast: *"Finish the earlier scenes first."* Logged for the organiser. |
| **Demo mode** | Entered via the Permissions fallback | Everything identical, plus a persistent small "DEMO" pill top-right and a dev "jump to level" control in a long-press menu on the timer (organiser use). |

---

## 6. Component inventory

Build these as reusable components:

- **GlassPanel** (variants: surface / raised; prop: over-camera adds scrim).
- **TimerChip**, **LevelIndicator** (5-segment).
- **PrimaryButton** (amber, 56px, press-fill), **SecondaryButton** (glass
  outline), **TextLink**.
- **Toast** (variants: neutral / alert / success).
- **BottomSheet** (grab handle, drag-dismiss, scrim).
- **Reticle** (states: searching / ok / lost).
- **SignalMeter** (vertical, gradient, no numerals).
- **LetterboxFrame** (2.39:1, for clips and the reveal).
- **ClipThumbnail** (docked, tappable).
- **HintRow** (states: available / locked / used-with-content).
- **SplitRow** (level · place · time · penalty tag).
- **LeaderRow** (rank · name · status; self-pinned variant).
- **CircleAction** (START, shutter).

---

## 7. Accessibility checklist

- Every interactive element ≥ 44 × 44px; primary actions 56px.
- Visible keyboard/focus ring on all controls (2px `--amber`, 2px offset).
- `prefers-reduced-motion` → 120ms fades, reveal is a cut.
- `prefers-reduced-transparency` → solid `#16181C` panels, no blur.
- Text on camera always has a scrim; target contrast ≥ 4.5:1 against the
  worst-case bright frame.
- Respect top and bottom safe-area insets on every screen.
- All icons that carry meaning have a text label or `aria-label`.
- The timer and signal states are never conveyed by color alone (shape/label
  too).

---

## 8. Open items — don't over-invest here

These mechanics decisions are still with the team; design the screens but keep
them easy to change:

1. ~~Is the world-anchored reveal always required?~~ **Decided: camera-first
   throughout (Option A).** The Search HUD carries the full AR treatment; the
   full-screen clip is the fallback only when tracking fails.
2. **Real vs fictional film pairings**, and how much clue text appears pre-reveal.
3. **4-digit on-site code** — if added for anti-cheat, the You're Here sheet gains
   a 4-digit input step before "Reveal the scene".
4. **Players per batch** — affects the Leaderboard's row count and grouping.

The nine locations in play, all real film sites (see `shared/src/content.ts`):
Behind SSBF, SIBM, SIDTM Admin Office, Auditorium, The Fountain, Library,
Amphitheatre, Symbi Eat, Outside C Hall.
