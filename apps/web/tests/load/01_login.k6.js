import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { assertUatOnly, env } from './_guard.k6.js'

assertUatOnly()

const errors = new Rate('errors')
const loginLatency = new Trend('login_latency_ms')

export const options = {
  stages: [
    { duration: '1m',  target: 50 },
    { duration: '2m',  target: 200 },
    { duration: '1m',  target: 200 },
    { duration: '1m',  target: 0 },
  ],
  thresholds: {
    'errors':           ['rate<0.01'],     // <1% error rate
    'login_latency_ms': ['p(95)<800'],     // 95% under 800ms
    'http_req_duration': ['p(95)<1000'],
  },
}

export default function () {
  const url = `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`
  const payload = JSON.stringify({
    email: env.TEST_USER_EMAIL,
    password: env.TEST_USER_PASSWORD,
  })
  const params = {
    headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
    tags: { name: 'login' },
  }

  const res = http.post(url, payload, params)
  loginLatency.add(res.timings.duration)

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'access_token present': (r) => !!r.json('access_token'),
  })
  errors.add(!ok)

  sleep(1) // 1 RPS per VU = realistic
}
