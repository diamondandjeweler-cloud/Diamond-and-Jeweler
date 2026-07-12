/**
 * _shared/audit — client-IP keyed-hash tests (finding edge-infra-3)
 *
 * Run in CI's edge-tests job: deno test --allow-all --no-check supabase/functions/
 * Hermetic — no network, no DB (only std/assert + Deno.env, which is set/cleared
 * within each test).
 *
 * REGRESSION GUARD (edge-infra-3): the client IP was hashed with plain unsalted
 * SHA-256, and the IPv4 keyspace (~2^32) is precomputable in minutes, so any
 * audit_log dump could be reversed back to raw IPs. hashIp now uses HMAC-SHA256
 * with a server-held AUDIT_IP_PEPPER when present. This test pins that (a) with a
 * pepper the output is NOT the plain SHA-256, (b) it is deterministic, and (c) a
 * different pepper yields a different digest.
 */
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { hashIp } from './audit.ts'

const IP = '203.0.113.7'

// Plain unsalted SHA-256 of IP — what the OLD code (and the no-pepper fallback) emit.
async function plainSha256(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.test('with AUDIT_IP_PEPPER set, hashIp is NOT the reversible plain SHA-256 of the IP', async () => {
  const prev = Deno.env.get('AUDIT_IP_PEPPER')
  Deno.env.set('AUDIT_IP_PEPPER', 'super-secret-pepper')
  try {
    const hashed = await hashIp(IP)
    const plain = await plainSha256(IP)
    assertNotEquals(hashed, plain, 'a peppered HMAC must differ from the brute-forceable plain hash')
    assertEquals(hashed.length, 64) // HMAC-SHA256 hex is 32 bytes
  } finally {
    if (prev === undefined) Deno.env.delete('AUDIT_IP_PEPPER')
    else Deno.env.set('AUDIT_IP_PEPPER', prev)
  }
})

Deno.test('peppered hashIp is deterministic (same IP + pepper → same digest, enables correlation)', async () => {
  const prev = Deno.env.get('AUDIT_IP_PEPPER')
  Deno.env.set('AUDIT_IP_PEPPER', 'pepper-1')
  try {
    assertEquals(await hashIp(IP), await hashIp(IP))
  } finally {
    if (prev === undefined) Deno.env.delete('AUDIT_IP_PEPPER')
    else Deno.env.set('AUDIT_IP_PEPPER', prev)
  }
})

Deno.test('a different pepper yields a different digest for the same IP', async () => {
  const prev = Deno.env.get('AUDIT_IP_PEPPER')
  try {
    Deno.env.set('AUDIT_IP_PEPPER', 'pepper-A')
    const a = await hashIp(IP)
    Deno.env.set('AUDIT_IP_PEPPER', 'pepper-B')
    const b = await hashIp(IP)
    assertNotEquals(a, b)
  } finally {
    if (prev === undefined) Deno.env.delete('AUDIT_IP_PEPPER')
    else Deno.env.set('AUDIT_IP_PEPPER', prev)
  }
})

Deno.test('empty IP hashes to empty string (unchanged)', async () => {
  assertEquals(await hashIp(''), '')
})
