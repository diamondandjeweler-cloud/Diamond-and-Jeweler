/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    'storybook-static',
    '.eslintrc.cjs',
    'vite.config.ts',
    'vitest.config.ts',
    'src/routes/restaurant',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-refresh', 'jsx-a11y'],
  settings: { react: { version: '18' } },
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    // Allow text up to three levels deep — checkbox labels in this project commonly
    // wrap a control + a span containing a styled <span>title</span> + <span>hint</span>.
    'jsx-a11y/label-has-associated-control': ['warn', { depth: 3 }],
    'jsx-a11y/no-autofocus': 'warn',
    'no-constant-condition': 'warn',
    'no-inner-declarations': 'warn',
  },
  overrides: [
    {
      files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
    {
      files: ['**/*.stories.tsx', '**/*.stories.ts'],
      rules: {
        'react-hooks/rules-of-hooks': 'off',
        'react-refresh/only-export-components': 'off',
      },
    },
    // DEFERRED — data-access seam guard: a no-restricted-syntax WARN on direct
    // supabase.from(...) / supabase.rpc(...) outside src/data/repositories/* was
    // trialled but currently flags ~190 unmigrated call sites, drowning the lint
    // signal. Re-enable it once the repository migration (src/data/repositories/*)
    // covers the bulk of those calls so the warning count is actionable.
    // Architectural guard-rail (WARN only): one-way module boundary. Recruitment
    // code must not import from the restaurant module (lib/restaurant/** or
    // routes/restaurant/**). The base rule applies across src; the override below
    // exempts the restaurant files themselves so they can import each other.
    {
      files: ['src/**/*.ts', 'src/**/*.tsx'],
      rules: {
        'no-restricted-imports': [
          'warn',
          {
            patterns: [
              {
                group: [
                  '**/lib/restaurant/**',
                  '**/routes/restaurant/**',
                  '@/lib/restaurant/**',
                  '@/routes/restaurant/**',
                ],
                message:
                  'recruitment code must not import the restaurant module (one-way boundary)',
              },
            ],
          },
        ],
      },
    },
    {
      // The restaurant module is exempt from the boundary — it may import itself.
      files: ['src/lib/restaurant/**', 'src/routes/restaurant/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
    // Clean-architecture dependency rule (Phase 1): the domain layer
    // (src/shared/domain/**) is PURE — deterministic, framework-free business
    // logic with no React/router/Supabase/infrastructure imports. Deps point
    // inward only; this LOCKS the relocated life-chart + identity modules clean
    // so the layer can't rot. See docs/ARCHITECTURE.md (target layering).
    {
      files: ['src/shared/domain/**/*.ts', 'src/shared/domain/**/*.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'react', message: 'domain layer must stay pure — no React' },
              { name: 'react-dom', message: 'domain layer must stay pure — no React' },
              { name: 'react-router-dom', message: 'domain layer must stay pure — no routing' },
              { name: '@supabase/supabase-js', message: 'domain layer must stay pure — no Supabase' },
            ],
            patterns: [
              {
                group: [
                  '**/lib/supabase',
                  '**/lib/functions',
                  '**/data/repositories/**',
                  '**/supabaseClient',
                ],
                message:
                  'domain layer must stay pure — no infrastructure/data-access imports',
              },
            ],
          },
        ],
      },
    },
  ],
}
