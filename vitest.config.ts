import {svelte} from '@sveltejs/vite-plugin-svelte'
import {defineConfig} from 'vitest/config'

export default defineConfig({
  // Client modules named `*.svelte.ts` are runes files — `$state` in them is
  // compiler syntax, not a function, so anything importing a store needs the
  // Svelte plugin to load at all. Without it a whole layer of client code was
  // untestable, and the tests written around that gap tested copies of the
  // logic rather than the logic.
  plugins: [svelte({configFile: './client/svelte.config.js'})],
  resolve: {conditions: ['browser']},
  test: {
    include: [
      'shared/src/**/*.test.ts',
      'worker/src/**/*.test.ts',
      'scripts/**/*.test.ts',
      // Pure client logic only — no component tests, so the node environment holds.
      'client/src/**/*.test.ts',
    ],
    environment: 'node',
  },
})
