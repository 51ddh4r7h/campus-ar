# Third-party assets

3D models are Draco-compressed and texture-optimised copies of downloaded
assets, served from `client/public/models/`. The originals are not in the repo;
the pipeline that produced them is:

```bash
npx @gltf-transform/cli@4 optimize in.glb out.glb \
  --compress draco --texture-compress webp --texture-size 512 --simplify false
```

That took the four together from 8.7 MB to 427 MB… 427 **KB**, a 95% reduction,
almost all of it texture weight.

The Draco decoder in `client/public/draco/` is copied verbatim from the
`three` package so nothing is fetched from a CDN at runtime.

## Map data — OpenStreetMap

The campus plan on the finish screen is built from OpenStreetMap, baked into
`client/src/lib/campus-map.ts` at build time by `npm run map`. Geometry is
committed rather than fetched at runtime: a player on a hilltop with two bars
should not need a third-party map server, and OSM's tile policy is not written
for an app hammering it on induction day.

> Map data © OpenStreetMap contributors, available under the Open Database
> Licence (ODbL).

That line is a licence condition, and it is rendered under the map itself in
`CampusMap.svelte`. Do not remove it.

## Attribution — INCOMPLETE, do not ship a public build until filled in

Every model below came from a source offering **CC Attribution (CC-BY)**, which
requires crediting the author. Note that a model *titled* "CC0 - …" is not
necessarily CC0; the licence panel is what counts, and at least one of these is
CC-BY despite its name.

| File | Used | Author | Source URL | Licence |
| --- | --- | --- | --- | --- |
| `film_projector.glb` | yes — the AR guide | **TODO** | **TODO** | CC-BY (confirm) |
| `clapperboard.glb` | not yet | plaggy | **TODO** | CC-BY |
| `stage_light.glb` | not yet | **TODO** | **TODO** | CC-BY (confirm) |
| `film_reel.glb` | not yet | **TODO** | **TODO** | CC-BY (confirm) |

Use the "Copy Credits" button on each model's download page and paste the exact
text here. Once complete, surface it in the app — the How to play sheet is the
natural home, since it is reachable without interrupting a run.

## svelte-bits

Three components are vendored from svelte-bits (the Svelte port of React Bits)
into `client/src/lib/components/bits/`, kept close to upstream so they can be
re-synced: **LaserFlow** (the projector beam on the hero), **GridScan** (the
surveying grid behind the permissions screen) and **TrueFocus** (the rack-focus
title). They are exempted from the house lint rules in `oxlint.config.ts` for
that reason — those rules police code we write.

One change is not cosmetic. **GridScan's face-tracking path is removed**, and
with it the `face-api.js` dependency: it opened the *front* camera on the
landing screen and fetched model weights from a CDN at runtime. This app asks
for the *rear* camera later, with an explanation, and a selfie prompt at the
door would be refused by most people — a refusal there poisons the request we
actually need. The component's own gyroscope handler drives the tilt instead,
which is the right input on a phone anyway.

`Sheen`, `EdgeBlur` and `StepDots` are separate, and are our own code; the ideas
behind the first two come from the same library — `ShinyText` and `GradualBlur`
respectively.

> svelte-bits, Copyright (c) 2026 David Haz. MIT + Commons Clause.
> https://github.com/DavidHDev/svelte-bits

The licence permits use as part of an application and forbids reselling the
components themselves, which is not something we do. Their source was not
copied, for reasons that are worth recording:

- Those components are styled with Tailwind; this app has no Tailwind, only the
  tokens in `client/src/tokens.css`.
- `ShinyText` animates a gradient by writing component state from a
  requestAnimationFrame loop — sixty renders a second for something CSS does on
  the compositor for nothing. On a screen that is already cross-fading a
  photographic backdrop on a mid-range phone, that is the wrong trade.
- `GradualBlur` stacks five to ten layers, each with its own `backdrop-filter`.
  Every one of those forces a separate full-screen render pass. `EdgeBlur` uses
  three, which is where the ramp stops looking stepped, and stops there.

Most of the library needs a cursor — `Magnet`, `GlareHover`, `SplashCursor`,
`TextPressure` and friends — so it has nothing to offer a phone-only game. The
WebGL backgrounds were declined for the same reason the proximity ring avoids a
second WebGL context: three.js is already a lazy chunk for the AR stage and the
entry screen is the worst place to pay for another one.

## Typefaces

Both are served from the app's own origin via `@fontsource`, latin subset only —
declared by hand in `client/src/fonts.css` rather than through each package's
entrypoint, which would pull six more subsets into the build for no one.

**Cinzel Decorative** — the display face, on the player-facing headings. Roman
inscriptional capitals with a little ornament, which is where the epic feel
comes from. The organiser console and the reporting dashboard are deliberately
set in Geist alone: they are working tools, and a decorative face on a roster
is decoration on a spreadsheet.

- Package: `@fontsource/cinzel-decorative` · Licence: SIL Open Font License 1.1
- One weight is loaded (400); every display heading is set at 400, so nothing
  asks the browser to fake a bold.

**Geist** — the interface face, everywhere else. Vercel's grotesque, drawn for
interfaces; one variable file covering 100-900, of which the app uses 400-700.

- Package: `@fontsource-variable/geist` · Licence: SIL Open Font License 1.1

The monospace role — the player's timers and scores, and the uppercase kickers
on the player screens — is still the platform's own (`ui-monospace` → SF Mono
on iOS, Roboto Mono on Android). It costs nothing to download and both are
good. The organiser surfaces use none of it: their figures are Geist with
`font-variant-numeric: tabular-nums`, which is what actually keeps a column of
roll numbers and times in line.

### Not used: Ringbearer

Ringbearer (Pete Klassen, 2002) was asked for and is not here. It is licensed
for personal use only, so embedding it as a webfont in a deployed app needs a
commercial licence bought from the designer; and it is a replication of the
lettering in the Peter Jackson films' logo, which is a trademark question on
top of the licence one. Cinzel Decorative is the nearest face that is free to
use here without either problem.

## Companion sprite — Cat Pack (Mochi)

The pixel cat on the search screen. ToffeeCraft's Cat Asset Pack —
<https://toffeecraft.itch.io/cat-pack> — **paid edition**, which the creator
licenses "for commercial or personal use". Neither edition permits
redistributing the raw sprites as assets; ours are compiled into an
application, which is the permitted use rather than a download.

The free edition previously used here was non-commercial and has been removed;
every sprite now comes from the paid pack, so there is one set of terms
covering all of them.

Five sheets in `client/src/assets/sprites/`, unmodified, 32px cells:

| File | Source | Frames | Band |
|---|---|---|---|
| `cat-sleep.png` | `Sleep.png` | 4 | Cold |
| `cat-sleepy.png` | `Sleepy.png` | 8 | Chilly |
| `cat-idle.png` | `Idle.png` | 10 | Warm |
| `cat-excited.png` | `Excited.png` | 12 | Hot |
| `cat-dance.png` | `Dance.png` | 4 | You're close |

Together about 8 KB, and small enough that Vite inlines them into the bundle
as data URIs — so a band change never waits on a network fetch.

The pack ships more than these (`Surprised`, `Waiting`, `Cry`, `Sad`,
`LayDown`, `Eating`, `Idle2`, `Box`, `DeadCat`). They are not used yet;
`STATES` in `CompanionCat.svelte` is where they would go.

The download carries no licence file — the terms above are the ones stated on
the itch.io page at the time of purchase. Worth keeping the receipt with the
project.

## Charting — flint-chart and Vega

The reporting screen's charts are specified with **flint-chart** (Microsoft,
MIT) and drawn by **Vega-Lite / Vega** (BSD-3-Clause), via `vega-embed`. flint
takes a high-level description — this is a Bar Chart, this field is a Quantity —
and decides the encodings and layout; Vega renders the result.

The app's palette is handed to Vega as a theme in `FlintChart.svelte`, so a
flint chart and the rest of the console agree on colour and type.

Vega is large: the reporting bundle is about 1.2 MB against 250 KB for the
whole rest of the app. That is acceptable only because the dashboard is loaded
on demand — `App.svelte` imports it dynamically, so none of it reaches the
phone of anyone playing. If that import is ever made static, every player pays
for a chart library they will never see.

Not every chart type flint names is available here. The Vega-Lite backend
carries a different set from the ECharts one — there is no Funnel Chart, for
instance — and asking for one it does not have throws. `FlintChart` treats that
as an empty panel rather than letting it unmount the screen.
