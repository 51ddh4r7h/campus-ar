import {svelte} from '@sveltejs/vite-plugin-svelte'
import {defineConfig} from 'vite'

export default defineConfig({
  base: './',
  plugins: [svelte()],
  // .m4a isn't in Vite's built-in asset list; the wrap applause is one.
  assetsInclude: ['**/*.m4a'],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    modulePreload: {polyfill: false},
    reportCompressedSize: false,
    // three.js is a deliberate lazy chunk — only loads at the AR reveal.
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
})
