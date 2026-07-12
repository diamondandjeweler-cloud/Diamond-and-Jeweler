/**
 * Characterization test for the lazy Supabase client (A2).
 *
 * Pins the contract that the refactor must preserve:
 *  - single-instance identity (one createClient per tab, memoized),
 *  - the in-tab serializing refresh lock survives (auth.lock === inTabLock),
 *  - auth still initializes,
 * plus the new lazy guarantee: no client is constructed at module-import time,
 * only on first use. `@supabase/supabase-js` is mocked so we can inspect the
 * options passed to createClient without a network client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

function makeFakeClient() {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    // Returns `this` so a bound call proves the method targets the real client.
    from: vi.fn(function (this: unknown) { return this }),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  }
}

describe('lib/supabase — lazy client (A2 characterization)', () => {
  beforeEach(() => {
    vi.resetModules()
    createClientMock.mockReset()
    createClientMock.mockImplementation(() => makeFakeClient())
  })

  it('does NOT construct the client at module-import time (lazy)', async () => {
    await import('./supabase')
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('getSupabase() creates exactly one client and memoizes it (single-instance identity)', async () => {
    const { getSupabase } = await import('./supabase')
    const a = getSupabase()
    const b = getSupabase()
    expect(createClientMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('preserves the in-tab serializing refresh lock and auth options', async () => {
    // Import both from the post-resetModules registry so the lock reference the
    // module captured is the same instance this test compares against.
    const { getSupabase } = await import('./supabase')
    const { inTabLock } = await import('./inTabLock')
    getSupabase()
    expect(createClientMock).toHaveBeenCalledTimes(1)
    const opts = createClientMock.mock.calls[0][2] as {
      auth: {
        lock: unknown; autoRefreshToken: boolean; persistSession: boolean
        detectSessionInUrl: boolean; flowType: string
      }
    }
    // The load-bearing lock (§6) must be the exact inTabLock reference.
    expect(opts.auth.lock).toBe(inTabLock)
    expect(opts.auth.autoRefreshToken).toBe(true)
    expect(opts.auth.persistSession).toBe(true)
    expect(opts.auth.detectSessionInUrl).toBe(true)
    expect(opts.auth.flowType).toBe('pkce')
  })

  it('auth initializes and is reachable', async () => {
    const { getSupabase } = await import('./supabase')
    const c = getSupabase()
    expect(c.auth).toBeDefined()
    expect(typeof c.auth.getSession).toBe('function')
    await expect(c.auth.getSession()).resolves.toEqual({ data: { session: null }, error: null })
  })

  it('the `supabase` proxy defers creation, forwards to the same client, and binds methods to it', async () => {
    const mod = await import('./supabase')
    // Importing/holding the proxy has not created a client yet.
    expect(createClientMock).not.toHaveBeenCalled()
    // First property access triggers creation.
    const authViaProxy = mod.supabase.auth
    expect(createClientMock).toHaveBeenCalledTimes(1)
    const real = mod.getSupabase()
    // Proxy forwards to the same memoized underlying instance.
    expect(authViaProxy).toBe(real.auth)
    // A method call through the proxy runs with `this` === the real client
    // (from() returns `this`), proving the bind targets the client not the proxy.
    expect(mod.supabase.from('x' as never)).toBe(real)
    // Still exactly one client after all that.
    expect(createClientMock).toHaveBeenCalledTimes(1)
  })
})
