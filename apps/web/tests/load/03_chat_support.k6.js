import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'
import { assertUatOnly, env, authHeaders } from './_guard.k6.js'

assertUatOnly()

// Note: chat-support is rate-limited to 30 messages/user/hour by 0080_chat_rate_limit.
// This script tests latency and rate-limit behavior — not raw throughput.

const errors = new Rate('errors')
const rateLimited = new Rate('rate_limited')
const chatLatency = new Trend('chat_latency_ms')

export const options = {
  vus: 30,
  duration: '3m',
  thresholds: {
    'errors':              ['rate<0.05'],     // tolerate 5% (some rate limits expected)
    'chat_latency_ms':     ['p(95)<5000'],    // streaming response — first byte
    'rate_limited':        ['rate<0.50'],     // most should not be rate-limited
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
  const url = `${env.SUPABASE_URL}/functions/v1/chat-support`
  const body = JSON.stringify({
    messages: [{ role: 'user', content: 'How do I update my profile?' }],
  })
  const res = http.post(url, body, { headers: authHeaders(data.jwt), tags: { name: 'chat_support' } })
  chatLatency.add(res.timings.duration)

  const ok = check(res, {
    'status 200 or 429': (r) => r.status === 200 || r.status === 429,
  })
  errors.add(!ok)
  rateLimited.add(res.status === 429)

  sleep(5)
}
