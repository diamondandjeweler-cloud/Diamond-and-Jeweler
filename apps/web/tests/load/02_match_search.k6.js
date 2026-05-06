import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { assertUatOnly, env, authHeaders } from './_guard.k6.js'

assertUatOnly()

const errors = new Rate('errors')
const searchLatency = new Trend('search_latency_ms')

// Cache one JWT per VU for the run.
let jwt = null

export const options = {
  stages: [
    { duration: '1m',  target: 50 },
    { duration: '2m',  target: 200 },
    { duration: '3m',  target: 500 },
    { duration: '3m',  target: 500 },
    { duration: '1m',  target: 0 },
  ],
  thresholds: {
    'errors':            ['rate<0.01'],
    'search_latency_ms': ['p(95)<300'],   // launch plan target
    'http_req_duration': ['p(95)<500'],
  },
}

export function setup() {
  // Single login at start so we don't hammer auth alongside search.
  const r = http.post(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY } },
  )
  if (r.status !== 200) throw new Error(`Setup login failed: ${r.status} — ${r.body}`)
  return { jwt: r.json('access_token') }
}

export default function (data) {
  jwt = data.jwt

  // Hit urgent-priority-search edge fn — the AI matching hot path
  const url = `${env.SUPABASE_URL}/functions/v1/urgent-priority-search`
  const params = { headers: authHeaders(jwt), tags: { name: 'urgent_priority_search' } }
  const body = JSON.stringify({ limit: 10 })

  const res = http.post(url, body, params)
  searchLatency.add(res.timings.duration)

  const ok = check(res, {
    'status 2xx': (r) => r.status >= 200 && r.status < 300,
  })
  errors.add(!ok)

  sleep(2)
}
