import { supabase } from './supabase'

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
      let parsed: { error?: string; message?: string } | null = null
      try { parsed = await ctx.json() as { error?: string; message?: string } } catch { /* non-JSON body — ignore */ }
      if (parsed) {
        const msg = parsed.error ?? parsed.message
        if (msg) throw new Error(msg)
      }
    }
    throw error
  }
  return data as T
}
