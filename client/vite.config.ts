import {svelte} from '@sveltejs/vite-plugin-svelte'
import {defineConfig} from 'vite'

export default defineConfig({
  base: './',
  plugins: [svelte()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {target: 'http://localhost:8787', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '')},
    },
  },
})
