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
