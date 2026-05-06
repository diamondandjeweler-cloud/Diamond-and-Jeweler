import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { assertUatOnly, env, authHeaders } from './_guard.k6.js'

assertUatOnly()

const errors = new Rate('errors')
const flowLatency = new Trend('flow_latency_ms')

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 150 },
    { duration: '3m', target: 300 },
    { duration: '2m', target: 300 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'errors':            ['rate<0.01'],
    'flow_latency_ms':   ['p(95)<2000'],
    'http_req_duration': ['p(95)<800'],
  },
}

export function setup() {
  const r = http.post(
    `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: env.TEST_USER_EMAIL, password: env.TEST_USER_PASSWORD }),
    { headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY } },
  )
  if (r.status !== 200) throw new Error(`Setup login failed: ${r.status}`)
  return { jwt: r.json('access_token') }
}

export default function (data) {
  const start = Date.now()

  // Step 1: list active roles
  const r1 = http.get(
    `${env.SUPABASE_URL}/rest/v1/roles?select=id,title&status=eq.active&limit=20`,
    { headers: authHeaders(data.jwt), tags: { name: 'list_roles' } },
  )
  const roles = r1.json()
  const ok1 = check(r1, { 'list_roles 200': (r) => r.status === 200 })

  // Step 2: fetch single role detail
  let ok2 = true
  if (ok1 && Array.isArray(roles) && roles.length > 0) {
    const roleId = roles[0].id
    const r2 = http.get(
      `${env.SUPABASE_URL}/rest/v1/roles?id=eq.${roleId}&select=*`,
      { headers: authHeaders(data.jwt), tags: { name: 'role_detail' } },
    )
    ok2 = check(r2, { 'role_detail 200': (r) => r.status === 200 })
  }

  flowLatency.add(Date.now() - start)
  errors.add(!ok1 || !ok2)
  sleep(3)
}
