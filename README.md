# Campus AR — WebAR World Tracking MVP

A minimal, mobile-first WebAR experience that uses the **current 8th Wall Engine**
(`@8thwall/engine-binary`) with **Three.js** for **markerless World Tracking (SLAM)**.

When you press **Start Navigation**, the app:

1. Requests camera permission.
2. Starts 8th Wall **World Tracking** (SLAM).
3. Renders a **transparent Three.js AR scene** over the live camera feed.
4. Anchors a **series of directional 3D arrows** in world space a short distance in front of you.
5. Keeps the arrows locked in place as you move the phone; use **Recenter** to reset the
   world origin and re-place the path in front of you.
6. Shows a small **debug HUD** with live engine / camera / tracking state.

No GPS, VPS, routing, maps, or authentication — this project's only job is reliable
markerless world tracking with anchored Three.js arrows.

> **Which engine is this?** This uses the current
> [8th Wall Engine Binary](https://8thwall.org/docs/engine/overview)
> (`@8thwall/engine-binary`), **not** the archived `8thwall/web` repo. World Tracking is
> added by the engine's `slam` chunk, which registers the classic
> `XR8.XrController` / `XR8.Threejs` / `XR8.addCameraPipelineModules` API.

---

## Stack

| Piece            | Choice                              | Why                                                                 |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Language         | TypeScript (`strict`)               | Type safety for the XR8 API surface.                                |
| Bundler/dev srv  | Vite (v8)                           | Instant dev server, trivial config, static build.                   |
| AR engine        | `@8thwall/engine-binary@1`          | Current engine; `slam` chunk provides world tracking / SLAM.        |
| 3D               | `three` (r185)                      | Scene, camera, and arrow meshes.                                    |
| Build output     | Static files → any HTTPS host       | No server runtime needed.                                           |

There is **no React**, **no Next.js**, **no extra frameworks** — just plain TS modules
and the engine's camera-pipeline plumbing.

---

## How the AR pipeline works (read this before editing)

The 8th Wall engine runs a **camera pipeline** of modules every frame.
`src/main.ts` installs them in this order (order matters):

```ts
XR8.addCameraPipelineModules([
  XR8.GlTextureRenderer.pipelineModule(), // 1. Draws the camera feed to the canvas.
  XR8.Threejs.pipelineModule(),           // 2. Creates the Three.js scene + camera, renders the overlay transparently.
  XR8.XrController.pipelineModule(),      // 3. SLAM: 6DoF world tracking feed.
  sceneModule(),                          // 4. Anchors the arrow path once tracking locks in (custom).
  hudModule(),                            // 5. Feeds the debug HUD (custom).
])
```

- The engine is loaded from `public/xr8/xr.js` (copied from
  `node_modules/@8thwall/engine-binary/dist` by `vite.config.ts` on startup) with
  `data-preload-chunks="slam"`. Because it's loaded via `<script>`, it cannot be
  bundled by Vite and is served verbatim. The engine resolves its SLAM chunk
  (`xr-slam.js`) and resources relative to its own URL, so **the whole `dist`
  folder must be copied** — the config plugin does this automatically.
- `XR8.XrController.pipelineModule()` exposes `processCpuResult.reality` with
  `position`, `rotation`, `intrinsics`, `trackingStatus` (`NORMAL` | `LIMITED`), and
  `trackingReason` (`INITIALIZING`, `EXCESSIVE_MOTION`, …) every frame.
- The app waits for `trackingStatus === 'NORMAL'`, then anchors
  `ARROW_COUNT` arrows at decreasing `-Z` positions (the "forward" direction).
  The arrows live in a top-level `THREE.Group`, so they stay fixed in world space
  while only the camera moves.
- **Recenter** calls `XR8.XrController.recenter()`, which resets the world origin to
  the device's current pose and restarts tracking; the path is cleared and re-anchored
  in front of the user once SLAM re-locks.
- **HUD** state comes from the pipeline's `onCameraStatusChange` (values
  `requesting → hasStream → hasVideo`) and from `reality.trackingStatus` each frame.

### Configuration knobs (`src/main.ts`)

| Constant           | Default | What it controls                        |
| ------------------ | ------- | --------------------------------------- |
| `ARROW_COUNT`      | `5`     | Number of arrows in the path            |
| `ARROW_SPACING`    | `1.6`   | World-unit distance between arrows      |
| `FIRST_ARROW_DIST` | `1.4`   | Distance from the user to the first arrow |
| `ARROW_HEIGHT`     | `0.8`   | Height of the arrows above the origin plane |
| `ARROW_COLOR`      | `#22d3ee` | Arrow material + emissive color       |
| `allowedDevices`   | `ANY`   | `MOBILE_AND_HEADSETS` for a production lock-down |

Change the arrows' size/shape in `createArrow()` — nothing else touches the 3D scene.

---

## Installation

```bash
# Prerequisites: Node 20+ and npm.
cd campus-ar
npm install
```

---

## Development

```bash
npm run dev
```

- Vite copies the engine binary into `public/xr8/` automatically on startup
  (via the `copy-8thwall-engine-binary` plugin).
- The dev server listens on `0.0.0.0:5173` and prints both a localhost URL and your
  LAN IP. It also accepts tunnel hosts (`ngrok`, `cloudflared`) out of the box.
- Visit `http://localhost:5173` on your computer — the AR screen and HUD will load.
  Desktop browsers have no world tracking, so `trackingStatus` will stay `LIMITED` and
  arrows won't spawn. That's expected: **this MVP targets phones.** Use the HUD to
  verify the camera and engine states.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build       # production build into dist/
npm run preview     # serve the production build locally
```

---

## HTTPS / local testing

Camera access requires a **secure context**:

- `http://localhost:5173` **is** a secure context on modern browsers — fine on
  desktop. (Camera is still gated behind permission prompts.)
- `http://192.168.x.x:5173` (LAN URL on a phone) is **not** a secure context —
  camera access will be blocked.
- Therefore, testing on a phone needs the dev server exposed over **HTTPS**.

---

## Mobile testing (ngrok / cloudflared)

**Option A — ngrok**

```bash
npm run dev            # terminal 1
ngrok http 5173        # terminal 2
```

Open the resulting `https://*.ngrok-free.dev` URL on your phone.

**Option B — cloudflared (no account needed)**

```bash
npm run dev           # terminal 1
cloudflared tunnel --url http://localhost:5173   # terminal 2
```

Open the resulting `https://*.trycloudflare.com` URL on your phone.

The Vite dev server is already configured with `allowedHosts: true`, so **no extra
Vite config is needed** for tunnels.

Testing tips on the phone:

1. Grant camera permission when prompted.
2. In a **well-lit area with texture** (not a blank wall), point at the floor and
   press **Start Navigation**.
3. Slowly move the phone sideways to let SLAM initialize. When the HUD shows
   `Tracking: NORMAL`, arrows appear anchored in front of you.
4. Walk around — the arrows stay put in world space.
5. Tap **Recenter** to reset the origin; the path re-anchors in front of you.

---

## Deployment

### Cloudflare Pages (recommended)

The project ships with a `wrangler.jsonc` config and a `.node-version` file
(Cloudflare's CI reads it to pick the exact Node version: 22.16.0, which satisfies
Vite 8's requirement).

**Option A — Git integration (auto-deploy on every push)**

1. Push this repo to GitHub (done) and open the
   [Cloudflare Pages dashboard](https://dash.cloudflare.com/).
2. **Workers & Pages → Create → Pages → Connect to Git → select `51ddh4r7h/campus-ar`**.
3. In **Build settings**:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Click **Save and Deploy**.
5. On first transfer, download and install the **cloudflared** daemon once, then click
   **Get site**; the production URL is typically `https://campus-ar.pages.dev`.

> The engine binary (`public/xr8/`) is gitignored, so it is **not** in the repo —
> the Vite build copies it from `node_modules` automatically, so CI builds work from
> a fresh clone.

**Option B — Wrangler CLI (currently not signed in on this machine)**

```bash
npx wrangler login                 # opens a browser to authenticate your Cloudflare account
npm run deploy                     # builds dist/ and uploads it → https://campus-ar.pages.dev
npm run deploy:preview             # deploy a preview branch (draft URL) instead
```

### Any other static host

The build is fully static — Netlify, Vercel, GitHub Pages, S3, nginx all work.

```bash
npm run build
```

- Output: `dist/`
- The engine binary is at `dist/xr8/` (copied automatically during build).
- `base: './'` is already set, so the app can be served from `/` or a sub-path.

Notes:

- **HTTPS is mandatory** for camera access on phones. Most static hosts provide it
  for free.
- No API keys are required anywhere — the engine binary is self-contained.
- The engine shows its own "Powered by 8th Wall" branding; see
  [Attribution Guidelines](https://8thwall.org/docs/open-source) and the
  [engine license](https://github.com/8thwall/engine/blob/main/LICENSE) for acceptable use.

---

## Troubleshooting

| Symptom                                          | Likely cause / fix                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| HUD shows `Engine: engine not loaded`            | `npm install` didn't run, or `public/xr8/` is missing. Restart `vite`.         |
| Camera permission prompt never appears           | Visiting via plain `http://` on a non-localhost host — use HTTPS (tunnel).     |
| HUD shows `Tracking: LIMITED` / `INITIALIZING` forever | Not enough visual texture, too dark, or phone is still. Move the phone slowly; aim at a textured area. |
| Tracking drops while walking                     | SLAM under poor lighting / low texture; move to better conditions.             |
| No arrows but tracking is `NORMAL`               | The path was placed at the first lock; tap **Recenter** or reload.             |
| Works nowhere on desktop                         | World tracking requires a mobile-class device; this is a phone-first MVP.      |
| Black/blank canvas                               | Check the browser console; a failed `xr.js` load usually logs clearly.         |

---

## Links

- Engine docs: <https://8thwall.org/docs/engine/overview>
- API reference: <https://8thwall.org/docs/api/engine/xr8>
- Official three.js world-effects example: <https://github.com/8thwall/threejs-world-effects-example>
- Engine binary license: <https://github.com/8thwall/engine/blob/main/LICENSE>
- Open-source engine (no SLAM): <https://github.com/8thwall/8thwall/tree/main/packages/engine>