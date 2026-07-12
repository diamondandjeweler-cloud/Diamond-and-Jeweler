import '@testing-library/jest-dom/vitest'

// jsdom has no ResizeObserver. Radix pulls it in via `useSize` (e.g. the hidden
// radio BubbleInput a RadioGroup renders when it lives inside a <form>), so any
// component test that mounts such a control needs this stub. Additive: only
// defined when absent, so it can't change behaviour for tests that never use it.
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Stub Supabase env vars so lib/supabase.ts can instantiate without throwing
// when pulled in by component tests.
if (!(globalThis as { VITE_TEST_INIT?: boolean }).VITE_TEST_INIT) {
  (globalThis as { VITE_TEST_INIT?: boolean }).VITE_TEST_INIT = true
  import.meta.env.VITE_SUPABASE_URL ??= 'http://localhost:54321'
  import.meta.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key'
  import.meta.env.VITE_SITE_URL ??= 'http://localhost:3000'
}
