import {defineConfig} from 'vitest/config'

export default defineConfig({
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
