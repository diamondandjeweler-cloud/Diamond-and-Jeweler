// Shared safety guard — refuses to run against the prod Supabase project.
// Imported by every k6 script in this directory.
//
// Usage in a script:
//   import { assertUatOnly, env } from './_guard.k6.js'
//   assertUatOnly()

export const env = {
  SUPABASE_URL: __ENV.SUPABASE_URL,
  SUPABASE_ANON_KEY: __ENV.SUPABASE_ANON_KEY,
  TEST_USER_EMAIL: __ENV.TEST_USER_EMAIL,
  TEST_USER_PASSWORD: __ENV.TEST_USER_PASSWORD,
  PROD_PROJECT_ID: __ENV.PROD_PROJECT_ID || 'sfnrpbsdscikpmbhrzub',
}

export function assertUatOnly() {
  if (!env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL env var is required')
  }
  if (!env.SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_ANON_KEY env var is required')
  }
  if (env.SUPABASE_URL.includes(env.PROD_PROJECT_ID)) {
    throw new Error(
      `REFUSING to run load tests against production Supabase project (${env.PROD_PROJECT_ID}). ` +
      `Use a UAT project URL instead. Override PROD_PROJECT_ID env if your prod ID differs.`
    )
  }
  if (!env.TEST_USER_EMAIL || !env.TEST_USER_PASSWORD) {
    throw new Error('TEST_USER_EMAIL + TEST_USER_PASSWORD env vars required')
  }
  console.log(`Load test target: ${env.SUPABASE_URL} (UAT verified)`)
}

export function authHeaders(jwt) {
  return {
    'Content-Type': 'application/json',
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${jwt || env.SUPABASE_ANON_KEY}`,
  }
}
