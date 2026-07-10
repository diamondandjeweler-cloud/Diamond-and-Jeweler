import { supabase } from './supabase'

/**
 * Coerce a backend error field to a display string.
 *
 * Edge functions are supposed to return a top-level STRING `error` field, but
 * if one ever returns an object, `new Error(msg)` would show users
 * "[object Object]". Walk the common shapes instead. Exported for tests.
 */
export function coerceErrorMessage(
  raw: unknown,
  fallback = 'Request failed — please try again.',
): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const msg = (raw as { message?: unknown }).message
    if (typeof msg === 'string' && msg) return msg
  }
  try {
    const json = JSON.stringify(raw)
    if (typeof json === 'string') return json
  } catch { /* circular structure — fall through */ }
  return fallback
}

/**
 * Invoke a Supabase Edge Function with the current user's JWT.
 * Throws on error; returns parsed JSON body on success.
 */
export async function callFunction<T = unknown>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data: sess } = await supabase.auth.getSession()
  const token = sess.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  })
  if (error) {
    // FunctionsHttpError wraps the raw Response — try to parse the JSON body
    // so the caller sees the actual message instead of the generic Supabase one.
    const ctx = (error as unknown as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      let parsed: { error?: unknown; message?: unknown } | null = null
      try { parsed = await ctx.json() as { error?: unknown; message?: unknown } } catch { /* non-JSON body — ignore */ }
      if (parsed) {
        const raw = parsed.error ?? parsed.message
        if (raw) throw new Error(coerceErrorMessage(raw))
      }
    }
    throw error
  }
  return data as T
}
