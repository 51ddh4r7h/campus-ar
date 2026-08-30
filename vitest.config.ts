import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    include: ['shared/src/**/*.test.ts', 'worker/src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
