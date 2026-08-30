# Campus AR — UI + AR Immersion Overhaul Specification

## 0. Purpose

This document is the implementation brief for overhauling the current Campus AR application from a polished web UI that launches an AR camera into a genuinely immersive WebAR experience.

The current visual identity is already directionally strong:

- black / near-black cinematic background
- cream typography
- amber / gold accent
- condensed display typography
- film / marquee vocabulary
- minimal borders and pills
- "Campus Film Society" framing
- hunt mechanic based on signal warmth
- five campus film locations
- timer and completion progression

Do **not** throw this visual identity away.

The central problem is different:

> The application currently feels like a normal web application with an AR camera mode, rather than an AR experience whose interface and content live inside the camera view.

The overhaul must therefore improve two layers simultaneously:

1. **Screen-space UI** — HTML/CSS overlays, typography, controls, cards, status indicators, transitions.
2. **World-space AR** — Three.js objects anchored in the tracked environment and visibly behaving as objects in the real world.

The second layer is the most important.

The finished experience should make a first-time user immediately understand:

> "The app is putting things into the real world."

---

# 1. Current Technical Baseline

Do not replace the current AR architecture unnecessarily.

The existing implementation is based on:

- TypeScript
- Vite
- Three.js
- current 8th Wall Engine Binary
- `XR8.GlTextureRenderer`
- `XR8.Threejs`
- `XR8.XrController`
- full-window canvas module
- custom scene/reveal logic
- custom HUD logic

The current pipeline is conceptually:

```text
Camera
  ↓
GlTextureRenderer
  ↓
Three.js AR scene
  ↓
XR8 world tracking / SLAM
  ↓
Screen-space HTML/CSS HUD
```

Preserve this foundation.

The current implementation already supports:

- markerless world tracking
- world-space anchored Three.js content
- recenter
- tracking state
- tracking reason
- camera status
- anchored directional content
- reveal gating
- proximity-based hunt logic
- timer
- set progression

Do not introduce React, Next.js, or another frontend framework solely for this redesign.

Do not replace Three.js with another renderer unless there is a concrete technical blocker.

---

# 2. Product-Level Objective

Change the experience from:

```text
Landing
  ↓
Hunt dashboard
  ↓
Open camera
  ↓
AR objects
```

to:

```text
Landing
  ↓
Enter Hunt
  ↓
Camera becomes the application
  ↓
Tracking calibration
  ↓
World-anchored AR hunt
  ↓
Spatial discovery
  ↓
AR reveal
  ↓
Information card
  ↓
Next hunt target
```

The camera must become the primary application surface after starting the hunt.

The user should not spend the majority of their hunt looking at a dashboard.

---

# 3. Design Direction

## Core aesthetic

Target:

> A24 / indie film festival + cinematic camera viewfinder + vintage film equipment + modern AR.

Avoid:

- generic "futuristic AR"
- excessive neon
- cyberpunk styling
- generic SaaS dashboards
- excessive glassmorphism
- rounded-card-everything
- blue/purple default AI aesthetics
- excessive HUD information
- developer/debug styling

The existing black / cream / amber visual language should remain.

## Design keywords

Use these as the design north star:

- cinematic
- editorial
- tactile
- restrained
- filmic
- spatial
- warm
- analog-meets-digital
- camera-like
- physical
- premium
- immersive

---

# 4. Critical UX Principle

There are two different types of UI.

## A. Screen-space UI

This stays fixed relative to the screen.

Examples:

- hunt progress
- timer
- signal status
- recenter button
- exit button
- reveal information
- instructions
- tracking warnings

Implement primarily with:

- HTML
- CSS
- existing TypeScript state updates

## B. World-space AR

This exists inside the tracked world.

Examples:

- film reel
- spatial markers
- directional trail
- clapperboard
- scene frame
- portal
- historical image frame
- floating labels
- world-space discovery objects

Implement with:

- Three.js
- existing 8th Wall world tracking
- world-space transforms
- Three.js materials, meshes and animations

Do not fake world-space AR using large HTML overlays.

The user must be able to move the phone and see the virtual objects remain anchored to the physical environment.

---

# 5. Non-Negotiable AR Requirement

When the hunt starts, the camera view must occupy essentially the entire application viewport.

The experience should visually read as:

```text
REAL WORLD / CAMERA
────────────────────────────

       WORLD AR OBJECT

             ◇

     spatial information


────────────────────────────
SCREEN UI
```

Not:

```text
WEB PAGE
────────────────────────────

[ dashboard ]

[ signal ]

[ list ]

[ button ]

[ camera box ]

────────────────────────────
```

The camera is the background.

The AR layer is the content.

The HTML UI is the chrome.

---

# 6. Screen 1 — Landing Page

The current landing direction is good and should be preserved rather than replaced.

Current conceptual hierarchy:

```text
Campus Film Society presents

FIND THE
MOVIE SETS

description

hunt rules

START THE HUNT
```

Keep:

- giant condensed title
- cream / amber contrast
- black background
- cinematic spacing
- strong CTA
- film-hunt terminology

## Improve

### 6.1 Make the title feel more cinematic

Use a very large display treatment.

Recommended:

```text
FIND THE
MOVIE SETS
```

with:

- tight line height
- very large responsive font
- cream for first line
- amber/cream gradient or amber for second line
- subtle texture/grain if performant

Do not add excessive decorative elements.

### 6.2 Add restrained film motifs

Possible CSS-only motifs:

- thin film-frame corner marks
- subtle horizontal frame lines
- faint sprocket-hole pattern
- tiny timecode
- faint grain
- subtle vignette
- small "TAKE 01" / "ROLLING" metadata

These should support the title, not compete with it.

### 6.3 CTA

`START THE HUNT` should remain the dominant action.

It should feel like:

> ENTER EXPERIENCE

rather than:

> SUBMIT FORM

Use:

- large touch target
- amber fill
- dark text
- subtle glow
- pressed state
- loading transition

On press:

```text
START THE HUNT
      ↓
ROLLING CAMERA...
      ↓
ENTER AR
```

---

# 7. Screen 2 — Hunt Dashboard

The current hunt dashboard is useful but should be treated as a transitional / planning interface, not the primary hunt experience.

Keep:

- `FILM HUNT`
- signal status
- sets count
- timer
- target information
- set list

But reduce its visual dominance.

## Important

The target set selector should not dominate the real hunt.

If the intended game loop is discovery through proximity, the user should not feel like they are simply selecting the answer from a dropdown.

The target selector can remain available for:

- demo mode
- development mode
- accessibility/debug use
- explicit target selection if the product requires it

But production hunt mode should emphasize:

> wander → signal sharpens → discover

rather than:

> select target → navigate there

---

# 8. AR Entry / Calibration State

When `START THE HUNT` is pressed, transition into camera mode.

Do not instantly dump all HUD elements onto the camera.

Use a short calibration sequence.

## State A — Camera starting

Screen:

```text
FILM HUNT

STARTING CAMERA
```

Keep this brief.

## State B — Tracking initialization

Show live camera.

Center:

```text
┌──────────────┐
│              │
│      +       │
│              │
└──────────────┘

MOVE YOUR PHONE
SLOWLY
```

Use a subtle viewfinder reticle.

## State C — World locked

Once tracking is `NORMAL`:

```text
WORLD LOCKED

CAMERA READY
```

Then transition into hunt mode.

Do not show technical terminology such as:

- SLAM
- `NORMAL`
- `XR8`
- engine version
- camera pipeline
- tracking reason

to normal users.

Those belong in debug mode only.

---

# 9. AR Screen — Overall Layout

The AR screen should be approximately:

```text
┌─────────────────────────────┐
│ FILM HUNT        01 / 05    │
│                             │
│                             │
│                             │
│        REAL CAMERA          │
│                             │
│            +                │
│                             │
│        WORLD AR             │
│                             │
│                             │
│                             │
│ SIGNAL                      │
│ WARM                        │
│                             │
│                    RECENTER │
└─────────────────────────────┘
```

## Top HUD

Keep it minimal.

Suggested:

```text
FILM HUNT          01 / 05
```

Optional:

```text
01 / 05
TAKE 01
```

Timer can be a small secondary element.

Do not create a large persistent dashboard.

## Bottom HUD

Signal should be compact:

```text
SIGNAL
WARM
```

with a small visual meter.

Recenter should be a floating circular / viewfinder-style control.

Exit should be secondary and hidden behind a small menu if possible.

---

# 10. AR Reticle

Create a reusable screen-space AR reticle.

Visual direction:

```text
      ┌────┐
      │ +  │
      └────┘
```

But make it cinematic and minimal.

Use four corner brackets rather than a literal box.

States:

### Searching

Dim / slow pulse.

### Tracking

Stable.

### Target nearby

Subtle amber pulse.

### Reveal

Reticle expands briefly and resolves into the reveal animation.

CSS is sufficient for the reticle.

---

# 11. First Real AR Object — Film Reel

This is a required feature of the overhaul.

When tracking locks, instantiate a world-space 3D film reel or similarly recognizable film object.

The object must:

- exist in Three.js
- be positioned in world space
- remain anchored while the user moves
- rotate slowly
- have restrained amber/cream material treatment
- have a subtle glow
- have a ground shadow or contact cue
- respond to the current AR state

The purpose is not merely decoration.

It is the user's first proof that:

> this is AR.

The user should be able to move the phone left/right/up/down and clearly observe that the object remains attached to the world.

---

# 12. World-Space Object Hierarchy

Create a dedicated AR visual layer / manager.

Conceptually:

```text
ARWorld
├── HuntAnchor
│   ├── FilmReel
│   ├── GroundShadow
│   ├── SpatialLabel
│   └── SignalEffects
│
├── Trail
│   ├── Marker01
│   ├── Marker02
│   ├── Marker03
│   └── Marker04
│
└── Reveal
    ├── Clapperboard
    ├── FilmFrame
    ├── FilmStrips
    └── Particles
```

Do not scatter these objects throughout unrelated application code.

Create a coherent AR visual abstraction.

---

# 13. Spatial Film Trail

Replace the current generic arrow aesthetic with a film-themed spatial trail.

Current implementation has five directional arrows.

Preserve the underlying navigation/tracking concept if it remains useful, but redesign the visual objects.

Possible marker design:

- small film frame
- film reel
- diamond marker
- glowing amber dot
- tiny "TAKE" marker

Example:

```text
        ◇
         \
          ◇
           \
            ◇
```

Each marker should be:

- world anchored
- progressively smaller/dimmer with distance
- softly animated
- visually connected
- placed at meaningful world-space distances

Do not create a huge glowing neon path.

The AR layer should feel cinematic rather than game-like.

---

# 14. Spatial Labels

Create world-space labels for important AR objects.

Example:

```text
             ◇
             │
             │
      CENTRAL LIBRARY
          42 m
```

The label should be associated with the Three.js object.

It should:

- track the object's screen projection
- scale appropriately
- fade based on distance if necessary
- avoid excessive overlap
- use the same typography as the screen UI

If a true 3D text implementation is too heavy, a projected HTML label is acceptable as long as it is positioned from world-space coordinates and clearly follows the AR object.

---

# 15. Signal Mechanic

The existing signal concept is strong.

Maintain:

```text
COLD
WARM
HOT
FOUND
```

Do not turn this into a complicated map.

The signal should become increasingly spatial.

## COLD

- muted screen indicator
- AR object dim
- slow pulse

## WARM

- amber begins appearing
- reel / marker becomes brighter
- pulse increases slightly

## HOT

- strong amber
- spatial object pulse
- subtle particles / film-strip effects
- label becomes more prominent

## FOUND

- signal disappears into reveal animation
- world object transitions into scene reveal

---

# 16. Do Not Use a Traditional Map

The experience should remain:

> no map, no conventional GPS navigation UI, discover through signal.

Do not introduce:

- Google Maps
- minimap
- large compass UI
- conventional navigation route
- giant arrows across the screen

unless a later product requirement explicitly asks for them.

The lack of a map is part of the experience.

---

# 17. AR Reveal — Primary "Wow" Moment

This should be the most heavily designed interaction.

Current content:

```text
SCENE FOUND
THE QUAD
FILMED HERE
THE GRADUATE
```

Keep the information.

Change the presentation.

## Reveal sequence

### Step 1 — Arrival

The spatial marker becomes stable.

### Step 2 — Lock

Reticle / spatial marker contracts.

### Step 3 — Clapperboard

A 3D clapperboard appears in world space.

### Step 4 — Clapperboard animation

The top arm closes / opens with a subtle motion.

### Step 5 — Film transition

Small film strips / particles move outward.

### Step 6 — World title

A 3D frame or title card appears:

```text
THE QUAD

FILMED HERE

THE GRADUATE
```

### Step 7 — Screen information

Only after the AR reveal has happened should a screen-space information card appear.

This establishes:

> AR spectacle first → UI information second.

---

# 18. 3D Reveal Frame

Create a reusable `FilmFrame` object.

Visual direction:

- physical frame
- cream border
- dark interior
- amber highlights
- slight depth
- subtle glow
- optional film perforation details

Possible content:

```text
1967

THE GRADUATE

FILMED HERE
```

It should appear as though a piece of cinematic history has been inserted into the user's environment.

---

# 19. Historical "THEN / NOW" Extension

If historical imagery is available, support a second-stage reveal.

Example:

```text
THE GRADUATE
1967

[ historical image ]

FILMED HERE
```

Then allow:

```text
THEN  ↔  NOW
```

This can be implemented as:

- image swap
- slider
- crossfade
- split-frame

Do not add this until the basic AR reveal is stable.

It is a Phase 2 enhancement.

---

# 20. Screen-Space Reveal Card

After the AR reveal:

Bottom sheet / floating card:

```text
┌─────────────────────────────┐
│ SCENE FOUND                 │
│                             │
│ THE QUAD                    │
│ FILMED HERE                 │
│ THE GRADUATE                │
│                             │
│ Found in 01:42.6            │
│                             │
│        CONTINUE HUNT        │
└─────────────────────────────┘
```

Design requirements:

- not full-screen unless necessary
- camera remains visible behind it
- world AR remains visible
- card uses cream/black/amber system
- card has strong hierarchy
- animation should feel like a film title card / slate
- card should not look like a generic SaaS modal

---

# 21. Film Progress

Replace plain `0/5` emphasis with a film-reel inspired progress indicator.

Examples:

```text
● ● ○ ○ ○
```

or:

```text
[●][●][ ][ ][ ]
```

or subtle film-frame marks.

Keep numeric progress as secondary:

```text
02 / 05
```

The progress system should feel like the user is completing "takes" or "scenes".

---

# 22. Timer

Keep the timer.

Change its visual language from generic stopwatch to cinematic timecode.

Examples:

```text
01:42.6
```

or:

```text
TAKE 01
01:42.6
```

Use a mono font.

Do not make it enormous.

The timer should support the game's tension without dominating the AR scene.

---

# 23. Recenter Control

The existing recenter behavior should remain.

The visual should become:

- circular
- viewfinder-like
- minimal
- floating over camera
- large enough for touch
- low visual weight

Possible icon:

```text
↻
```

with small label:

```text
RECENTER
```

On tap:

```text
RECENTERING
```

Then:

```text
WORLD LOCKED
```

Do not expose engine terminology.

---

# 24. Tracking-Lost State

When tracking becomes limited/lost:

Do not display raw debug information.

Show:

```text
TRACKING LOST

Move your phone slowly
across a textured surface.

[ RECENTER ]
```

The camera remains visible.

The AR content can:

- fade slightly
- freeze
- become semi-transparent
- hide until tracking returns

When tracking returns:

```text
WORLD LOCKED
```

Then smoothly restore AR content.

---

# 25. Debug HUD

The current debug HUD is useful during development.

Do not delete it.

Move it behind a development-only flag.

Production users should not see:

- engine state
- camera pipeline state
- raw tracking reason
- XR8 state
- implementation terminology

Keep the existing developer hook / simulation mechanisms working.

The debug interface should be visually separate from the production interface.

---

# 26. CSS Design System

Create centralized design tokens.

Do not hard-code random colors throughout the stylesheet.

Suggested conceptual tokens:

```css
--color-bg: #07080b;
--color-bg-soft: #0d1017;
--color-cream: #f1ead8;
--color-cream-muted: #aaa697;
--color-amber: #f3b52f;
--color-amber-hot: #ffd66b;
--color-red: #bd4a3d;
--color-border: rgba(241, 234, 216, 0.14);
--color-border-strong: rgba(241, 234, 216, 0.26);
--color-white-soft: rgba(255, 255, 255, 0.72);
```

These are starting values, not mandatory exact values.

The important requirement is consistency.

---

# 27. Typography System

Use three roles.

## Display

For:

- FIND THE
- MOVIE SETS
- COLD
- HOT
- SCENE FOUND
- THAT'S A WRAP

Characteristics:

- condensed
- bold
- cinematic
- tight line height

## UI

For:

- descriptions
- buttons
- labels
- instructions
- cards

Characteristics:

- clean
- highly readable
- medium weight

## Mono

For:

- timer
- timecode
- technical metadata
- optional coordinates/debug information

Never use the mono face for the entire interface.

---

# 28. Component System

Build reusable CSS/HTML primitives rather than styling every screen independently.

Recommended components:

```text
FilmBadge
FilmButton
FilmPill
SignalMeter
ProgressRail
Viewfinder
StatusIndicator
SpatialLabel
RevealCard
BottomSheet
TimerDisplay
RecenterControl
```

Every component must use the central design tokens.

Avoid one-off CSS unless genuinely necessary.

---

# 29. Animation System

Animations should be subtle and cinematic.

Use:

- opacity
- transform
- scale
- blur
- glow
- clip-path where appropriate

Avoid:

- excessive bouncing
- cartoon spring animations
- constant motion everywhere
- huge zooms
- flashy neon effects

Recommended timing ranges:

```text
micro interaction: 120–180ms
UI transition:      220–400ms
panel entrance:     350–600ms
cinematic reveal:   700–1400ms
```

Use `prefers-reduced-motion`.

---

# 30. Film Grain

Add a very subtle CSS film-grain layer.

Requirements:

- low opacity
- pointer-events: none
- does not block camera
- does not materially reduce performance
- does not make text harder to read

Possible implementation:

- CSS noise texture
- tiny repeated raster texture
- pseudo-element

Do not use an expensive constantly regenerated canvas texture unless necessary.

---

# 31. Vignette

Add a subtle camera-mode vignette.

It should:

- darken corners slightly
- keep the center clear
- help screen UI remain legible
- reinforce cinematic style

Do not make it look like a horror game.

---

# 32. Safe Areas

All AR screen UI must respect:

```css
env(safe-area-inset-top)
env(safe-area-inset-bottom)
env(safe-area-inset-left)
env(safe-area-inset-right)
```

This is mandatory.

The app must work on:

- iPhone Safari
- Android Chrome
- mobile browsers with browser chrome visible/hidden
- portrait orientation

Do not assume viewport height is static.

Use modern dynamic viewport units where appropriate:

```css
100dvh
100svh
```

rather than relying exclusively on `100vh`.

---

# 33. Touch Targets

All interactive controls:

- minimum approximately 44px touch target
- adequate spacing
- no tiny text-only controls
- visible pressed state

AR controls must remain usable while holding a phone.

Avoid placing important controls too close to edges without safe-area padding.

---

# 34. Responsive Behavior

The desktop screenshots are useful for design review but the real target is mobile.

Design mobile-first.

Desktop should be a graceful adaptation, not the primary layout.

On narrow mobile:

- camera occupies full viewport
- HUD stays compact
- cards become bottom sheets
- buttons become full-width where appropriate
- text remains readable
- world-space objects remain correctly scaled

---

# 35. Performance Requirements

Do not let visual polish destroy AR performance.

Target:

- smooth camera rendering
- stable tracking
- no unnecessary DOM reflows
- minimal layout thrashing
- animation via transform/opacity where possible
- avoid huge textures
- dispose Three.js geometries/materials/textures when no longer needed
- reuse meshes where practical

The AR experience should prioritize:

1. tracking stability
2. camera responsiveness
3. world anchoring
4. UI polish

in that order.

---

# 36. Three.js AR Visual Library

Create reusable constructors/classes/functions for:

```text
createFilmReel()
createFilmMarker()
createFilmTrail()
createSpatialLabel()
createClapperboard()
createFilmFrame()
createRevealParticles()
createGroundShadow()
```

Each should:

- expose configuration
- have a clean lifecycle
- support show/hide
- support animation
- support disposal
- avoid leaking resources

Do not put all visual construction inside the main AR lifecycle function.

---

# 37. AR World State Machine

Keep visual state separate from application/game state where practical.

Recommended visual states:

```text
IDLE
TRACKING
WORLD_LOCKED
HUNTING
WARM
HOT
ARRIVAL
REVEALING
REVEALED
PAUSED
TRACKING_LOST
```

The game can still maintain its own state.

The AR renderer reacts to that state.

Example:

```text
gameState = WARM

→ ARWorld.setSignalState("warm")

→ film reel brightness increases
→ markers pulse faster
→ spatial label becomes more visible
→ screen HUD says WARM
```

This keeps the system maintainable.

---

# 38. Avoid Fake AR

The following are explicitly discouraged:

- giant HTML cards pretending to be world objects
- CSS arrows pretending to be spatial arrows
- fixed screen elements positioned to look like they are attached to the world
- arbitrary parallax without world tracking
- decorative 3D objects that do not remain anchored
- animations that move independently of camera tracking

If something is described as:

> "in the world"

it should preferably actually be a world-space object.

---

# 39. World-Space vs Screen-Space Decision Table

| Element | Implementation |
|---|---|
| Film reel in environment | Three.js |
| Spatial marker | Three.js |
| Film trail | Three.js |
| Clapperboard | Three.js |
| Historical frame | Three.js |
| Ground shadow | Three.js |
| World-space label | Three.js or projected HTML |
| Signal text | HTML/CSS |
| Timer | HTML/CSS |
| Progress | HTML/CSS |
| Recenter | HTML/CSS |
| Tracking warning | HTML/CSS |
| Reveal information | HTML/CSS |
| Landing page | HTML/CSS |
| Film grain | CSS |
| Vignette | CSS |

---

# 40. Do Not Add an External UI Framework

Do not introduce:

- React
- Material UI
- Bootstrap
- generic dashboard templates
- large component libraries

unless the existing project is already using them.

The current app is simple enough that a small custom CSS design system is preferable.

External references can be used for inspiration.

The implementation should remain coherent with the current codebase.

---

# 41. Do Not Overhaul the Brand

Keep the existing:

- Campus Film Society
- Film Hunt
- FIND THE MOVIE SETS
- black background
- cream typography
- amber/gold accent
- film vocabulary
- cinematic tone

The goal is:

> better execution of the existing concept

not:

> invent an entirely different product.

---

# 42. Production vs Demo Mode

The app currently has demo/development concepts.

Maintain the distinction.

Production:

- no jump controls
- no raw debug HUD
- no forced reveal
- no developer hooks
- no target-selection shortcuts unless intentionally part of product

Demo/dev:

- jump target
- force reveal
- debug HUD
- simulation hooks
- test tracking states

Ensure production builds do not accidentally expose cheat/debug behavior.

---

# 43. Suggested File Structure

Adapt to the existing structure rather than blindly creating files, but aim toward something conceptually similar to:

```text
src/
├── main.ts
├── ar.ts
├── styles/
│   ├── tokens.css
│   ├── base.css
│   ├── landing.css
│   ├── hunt.css
│   ├── ar-ui.css
│   └── reveal.css
│
├── ui/
│   ├── components.ts
│   ├── hud.ts
│   ├── reveal-card.ts
│   └── viewfinder.ts
│
├── ar/
│   ├── world.ts
│   ├── film-reel.ts
│   ├── film-marker.ts
│   ├── film-trail.ts
│   ├── clapperboard.ts
│   ├── film-frame.ts
│   └── effects.ts
│
├── reveal/
│   └── ...
│
└── data/
    └── ...
```

Do not restructure the entire repository if doing so creates unnecessary risk.

---

# 44. Implementation Phases

## Phase 1 — Screen UI system

Complete:

- design tokens
- typography
- buttons
- pills
- signal meter
- progress
- viewfinder
- timer
- reveal card
- safe areas
- responsive behavior
- film grain
- vignette

No major AR behavior changes yet.

## Phase 2 — AR camera experience

Complete:

- full-screen camera
- calibration sequence
- reticle
- minimal HUD
- tracking-lost state
- recenter control
- removal of debug HUD from production view

## Phase 3 — Spatial AR

Complete:

- film reel
- world anchor
- ground shadow
- spatial label
- redesigned markers
- spatial trail
- signal-reactive AR

This is the most important phase.

## Phase 4 — Cinematic reveal

Complete:

- clapperboard
- film frame
- reveal animation
- particles/film strips
- world-space title
- screen-space reveal card

## Phase 5 — Polish

Complete:

- animation tuning
- typography tuning
- mobile QA
- tracking QA
- performance optimization
- reduced-motion support
- production/debug separation

---

# 45. Acceptance Criteria

The overhaul is not complete merely because the CSS looks better.

## Visual

- [ ] Landing page feels cinematic.
- [ ] Hunt UI shares a coherent visual system.
- [ ] No generic dashboard appearance.
- [ ] No excessive rounded-card styling.
- [ ] Typography has clear display/UI/mono roles.
- [ ] Amber/cream/black system is consistent.
- [ ] UI remains legible over arbitrary camera footage.

## Camera

- [ ] Camera occupies essentially the full mobile viewport.
- [ ] UI respects safe areas.
- [ ] Camera is not visually boxed inside a webpage.
- [ ] Browser viewport changes do not break layout.

## AR

- [ ] A clear 3D object appears in the physical environment.
- [ ] Object is genuinely world anchored.
- [ ] Object remains stable while user moves the phone.
- [ ] Object has convincing scale/depth cues.
- [ ] Ground shadow/contact cue is present where appropriate.
- [ ] Spatial markers feel like physical AR objects.
- [ ] AR content reacts to signal state.

## Reveal

- [ ] Scene discovery happens visually in the AR world.
- [ ] Reveal begins with world-space content.
- [ ] Clapperboard or equivalent cinematic object appears.
- [ ] Film frame/title appears in world space.
- [ ] Information card appears after the AR reveal.
- [ ] The reveal feels like a reward, not a modal.

## UX

- [ ] User understands tracking state.
- [ ] User knows what to do when tracking is lost.
- [ ] User can recenter.
- [ ] User can understand signal state without a map.
- [ ] User can see progress.
- [ ] User can complete the hunt without needing technical knowledge.

## Performance

- [ ] No obvious frame-rate degradation from visual effects.
- [ ] No memory/resource leaks from repeated reveals.
- [ ] AR tracking remains stable.
- [ ] UI animations do not block the main thread.
- [ ] Assets are appropriately sized.

---

# 46. Manual QA Script

Test on a real mobile device.

## Test A — Landing

1. Open app.
2. Confirm landing screen fills viewport.
3. Confirm title hierarchy.
4. Confirm CTA is obvious.
5. Confirm no horizontal overflow.
6. Confirm safe-area handling.

## Test B — AR entry

1. Tap START THE HUNT.
2. Camera opens.
3. Confirm camera fills screen.
4. Confirm calibration message appears.
5. Move phone slowly.
6. Confirm WORLD LOCKED state.
7. Confirm reticle transitions correctly.

## Test C — World anchor

1. Allow a film reel/object to appear.
2. Move phone left.
3. Move phone right.
4. Move closer.
5. Move farther away.
6. Confirm object remains in the same physical location.
7. Confirm object scale/depth feels believable.

## Test D — Signal

1. Move away from target.
2. Confirm COLD.
3. Move toward target.
4. Confirm WARM.
5. Approach target.
6. Confirm HOT.
7. Confirm AR effects change accordingly.

## Test E — Recenter

1. Move phone to a different position.
2. Tap RECENTER.
3. Confirm old AR path clears.
4. Confirm new world origin establishes correctly.
5. Confirm AR content is re-anchored.

## Test F — Tracking loss

1. Point camera at low-feature / difficult surface.
2. Confirm tracking warning.
3. Confirm AR content does not behave unpredictably.
4. Move back to textured environment.
5. Confirm tracking recovers.

## Test G — Reveal

1. Enter target area.
2. Trigger reveal.
3. Confirm spatial marker transitions.
4. Confirm clapperboard appears.
5. Confirm title/frame appears in world space.
6. Confirm information card appears afterward.
7. Confirm card can be dismissed.
8. Confirm hunt continues.

## Test H — Repeatability

Repeat at least three reveals.

Confirm:

- no duplicate objects
- no stale animations
- no memory accumulation
- no broken state
- no AR content remaining from previous target

---

# 47. Priority Rules for the Agent

When making implementation decisions, use this priority order:

```text
1. AR stability
2. World anchoring
3. Mobile usability
4. Clear interaction
5. Cinematic visual identity
6. Animation polish
7. Decorative effects
```

Never sacrifice tracking stability for visual effects.

Never sacrifice usability for aesthetics.

Never add decorative AR content unless it reinforces the film-hunt concept.

---

# 48. Final Experience Standard

The final application should pass this simple test:

### Before AR

It should feel like:

> a premium cinematic film-hunt microsite.

### Once the camera opens

It should immediately feel like:

> an AR application.

### While hunting

It should feel like:

> the real campus has become the game board.

### When a location is found

It should feel like:

> a piece of film history has appeared in the physical world.

### After the reveal

It should feel like:

> a cinematic reward has been unlocked.

The application should never feel like:

> a normal webpage with a camera behind it.

---

# 49. Final Instruction to the Coding Agent

Inspect the existing implementation before modifying it.

Do not rewrite working AR infrastructure unnecessarily.

Do not remove existing tracking/recenter/reveal functionality merely to achieve visual changes.

Implement the overhaul incrementally.

After each phase:

1. typecheck
2. build
3. run existing tests/smoke tests
4. test AR lifecycle
5. verify production/debug separation
6. inspect mobile layout
7. verify world anchoring

Most importantly:

**Do not stop at CSS polish.**

The user's primary complaint is that the experience does not feel like real AR.

Therefore the completed implementation must contain meaningful, visible, world-anchored Three.js content throughout the hunt.

CSS/HTML handles the interface.

Three.js/8th Wall handles the world.

The two layers must work together as one coherent cinematic AR experience.
