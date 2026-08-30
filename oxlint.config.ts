import type {OxlintConfig} from 'oxlint'

const config: OxlintConfig = {
  ignorePatterns: [
    '_legacy/**',
    '**/dist/**',
    '**/.svelte-kit/**',
    'public/xr8/**',
    'client/public/xr8/**',
    'tools/oxlint/anti-slop/**',
    '.agent/**',
    '.agents/**',
    '.claude/**',
    '.codex/**',
    '.cursor/**',
    '.gemini/**',
    '.opencode/**',
  ],
  jsPlugins: [{name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts'}],
  rules: {
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-known-value-widening': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-object-parameters': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-runtime-typeof': ['error', {allowInTypeGuards: true}],
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-parameters': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-unsafe-dictionary-type': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',
  },
  overrides: [
    {
      files: ['**/*.test.ts', 'scripts/**/*.ts'],
      rules: {
        'anti-slop/no-chained-type-assertions': 'off',
        'anti-slop/no-runtime-typeof': 'off',
        'anti-slop/require-safety-comment-for-type-assertion': 'off',
      },
    },
  ],
}

export default config
