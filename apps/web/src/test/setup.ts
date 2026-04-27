import '@testing-library/jest-dom/vitest'

// Stub Supabase env vars so lib/supabase.ts can instantiate without throwing
// when pulled in by component tests.
if (!(globalThis as { VITE_TEST_INIT?: boolean }).VITE_TEST_INIT) {
  (globalThis as { VITE_TEST_INIT?: boolean }).VITE_TEST_INIT = true
  import.meta.env.VITE_SUPABASE_URL ??= 'http://localhost:54321'
  import.meta.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key'
  import.meta.env.VITE_SITE_URL ??= 'http://localhost:3000'
}
