// Flat config (ESLint 10). Migrated from .eslintrc.cjs — every rule, override,
// and ignore is preserved verbatim, including the three architectural guard-rails
// (data-access seam, domain purity, one-way restaurant module boundary).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  // ── ignorePatterns → global ignores ────────────────────────────────────────
  // (`.eslintrc.cjs` is gone; the remaining entries are carried over 1:1.)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'storybook-static/**',
      'vite.config.ts',
      'vitest.config.ts',
      'src/routes/restaurant/**',
    ],
  },

  // Preserve eslintrc v8 behaviour: it did NOT report unused eslint-disable
  // directives (default was off). Flat config flips this default to "warn", so
  // pin it back off to keep output identical to the pre-migration config.
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },

  // ── extends → shared recommended configs ────────────────────────────────────
  // eslint:recommended, @typescript-eslint/recommended, react-hooks/recommended,
  // jsx-a11y/recommended.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  // NOTE: react-hooks/recommended is applied via the explicit two-rule block in
  // the base config below. The bundled `configs['recommended-latest']` in
  // eslint-plugin-react-hooks@7 (a) still declares a legacy string-array
  // `plugins` (rejected by ESLint 10 flat config) and (b) turns on ~15 NEW
  // React-Compiler rules at error level that were NOT in the original v4.6.2
  // `plugin:react-hooks/recommended` (which was only rules-of-hooks:error +
  // exhaustive-deps:warn). To PRESERVE the original config's exact behaviour we
  // register the plugin and set those two rules ourselves — nothing more.

  // ── parser / parserOptions / env / settings / plugins + base rules ──────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: { react: { version: '18' } },
    plugins: {
      'react-refresh': reactRefresh,
      'react-hooks': reactHooks,
    },
    rules: {
      // react-hooks/recommended (v4.6.2 semantics), preserved exactly:
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
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
  },

  // ── override: test files ────────────────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },

  // ── override: storybook stories ─────────────────────────────────────────────
  {
    files: ['**/*.stories.tsx', '**/*.stories.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },

  // ── GUARD-RAIL 1 (ERROR): data-access seam ──────────────────────────────────
  // Direct supabase.from(...) / supabase.rpc(...) belongs in src/data/repositories/*.
  // The repository migration reached zero raw call sites in recruitment surfaces,
  // so this is a hard rule. lib/restaurant/** is exempt — it IS the restaurant
  // bounded-context's data layer (routes/restaurant is already excluded via the
  // global ignores above). `ignores` alongside `files` reproduces eslintrc
  // `excludedFiles` (non-global, this config only).
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/data/repositories/**', 'src/lib/restaurant/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='supabase'][callee.property.name='from']",
          message:
            'Direct supabase.from() outside src/data/repositories — add or reuse a repository function instead (data-access seam).',
        },
        {
          selector:
            "CallExpression[callee.object.name='supabase'][callee.property.name='rpc']",
          message:
            'Direct supabase.rpc() outside src/data/repositories — add or reuse a repository function instead (data-access seam).',
        },
        {
          // Also catch schema-scoped access, e.g. supabase.schema('x').from(...),
          // which bypasses the two selectors above (callee.object is a CallExpression).
          selector:
            "CallExpression[callee.property.name=/^(from|rpc)$/][callee.object.callee.object.name='supabase'][callee.object.callee.property.name='schema']",
          message:
            'Direct supabase.schema().from()/.rpc() outside src/data/repositories — route it through a repository function (data-access seam).',
        },
      ],
    },
  },

  // ── GUARD-RAIL 3 (WARN): one-way restaurant module boundary ─────────────────
  // Recruitment code must not import from the restaurant module. Base rule spans
  // all of src; the exemption below lets the restaurant files import each other.
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

  // ── GUARD-RAIL 2 (ERROR): domain-layer purity ───────────────────────────────
  // src/shared/domain/** is PURE — deterministic, framework-free business logic
  // with no React/router/Supabase/infrastructure imports. Deps point inward only.
  // (As in the eslintrc, this later override fully replaces no-restricted-imports
  // for domain files, so the restaurant-boundary warn does not also apply here.)
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
];
