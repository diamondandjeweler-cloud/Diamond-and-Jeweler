// Minimal fetch wrappers for QA scripts.

import { config } from '../config.mjs'

/** Hit Supabase PostgREST as a specific user (or anon). */
export async function pgrest(path, opts = {}) {
  const url = `${config.SUPABASE_URL}/rest/v1${path}`
  const headers = {
    apikey: opts.token ? config.SUPABASE_ANON_KEY : config.SUPABASE_ANON_KEY,
    Authorization: opts.token
      ? `Bearer ${opts.token}`
      : `Bearer ${config.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  return fetch(url, { method: opts.method ?? 'GET', headers, body: opts.body })
}

/** Call a Supabase Edge Function. */
export async function edgeFn(name, opts = {}) {
  const url = `${config.SUPABASE_URL}/functions/v1/${name}`
  const headers = {
    apikey: config.SUPABASE_ANON_KEY,
    Authorization: opts.token
      ? `Bearer ${opts.token}`
      : `Bearer ${config.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  }
  return fetch(url, {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
}

/** Run SQL via Supabase Management API. Returns rows[]. */
export async function mgmtSql(sql) {
  const url = `https://api.supabase.com/v1/projects/${config.SUPABASE_PROJECT_ID}/database/query`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.SUPABASE_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`mgmtSql failed: ${res.status} ${body}`)
  }
  return res.json()
}
