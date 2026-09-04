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
