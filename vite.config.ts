import {cpSync, existsSync} from 'node:fs'
import {resolve} from 'node:path'
import autoprefixer from 'autoprefixer'
import tailwindcss from 'tailwindcss'
import {defineConfig, type Plugin} from 'vite'

/**
 * The 8th Wall engine binary is NOT a normal importable module — it must be
 * loaded via a <script> tag. The script file (`xr.js`) resolves its SLAM chunk
 * (`xr-slam.js`) and its resources relative to its own URL, so we copy the
 * whole engine `dist` folder into `public/xr8/` and reference it statically.
 *
 * This gives us a pinned, offline-capable engine (no CDN dependency) while
 * keeping the `@8thwall/engine-binary` npm package as the single source of it.
 */
const ENGINE_DIST = resolve(process.cwd(), 'node_modules/@8thwall/engine-binary/dist')
const PUBLIC_XR8 = resolve(process.cwd(), 'public/xr8')

function copyEngineBinary(): Plugin {
  return {
    name: 'copy-8thwall-engine-binary',
    buildStart() {
      if (!existsSync(ENGINE_DIST)) {
        this.warn(
          `[8thwall] Engine not found at "${ENGINE_DIST}". ` +
            'Did you run "npm install" before starting Vite?',
        )
        return
      }
      cpSync(ENGINE_DIST, PUBLIC_XR8, {recursive: true})
    },
  }
}

export default defineConfig({
  // Relative base so the built app can be served from any path/sub-directory.
  base: './',

  plugins: [copyEngineBinary()],

  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },

  server: {
    // Expose on the LAN so a phone on the same network can reach the dev server.
    host: true,
    // Allow arbitrary tunnel hosts (ngrok / cloudflared) in dev.
    allowedHosts: true,
  },
})