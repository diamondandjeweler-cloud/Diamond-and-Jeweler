// Stringify caught errors safely for display.
//
// The plain `String(e)` pattern gives "[object Object]" for plain-object
// rejections (Supabase PostgrestError, fetch responses, etc.) which silently
// swallows the actual reason. This walks the common shapes first and falls
// back to JSON.

export function formatError(e: unknown): string {
  if (e === null || e === undefined) return 'Unknown error'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message

  if (typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message) return obj.message
    if (typeof obj.error === 'string' && obj.error) return obj.error
    if (typeof obj.error_description === 'string' && obj.error_description) return obj.error_description
    if (obj.error && typeof (obj.error as { message?: unknown }).message === 'string') {
      return (obj.error as { message: string }).message
    }
    // Surface useful PostgREST / Supabase error fields when message is empty
    const code = typeof obj.code === 'string' ? obj.code : null
    const hint = typeof obj.hint === 'string' ? obj.hint : null
    const details = typeof obj.details === 'string' ? obj.details : null
    if (code || hint || details) {
      const parts = [
        code ? `[${code}]` : null,
        details,
        hint ? `(hint: ${hint})` : null,
      ].filter(Boolean) as string[]
      if (parts.length) return parts.join(' ').trim()
    }
    try {
      const json = JSON.stringify(e)
      // {"message":""} is what PostgREST returns on RLS denial without a body —
      // not useful to render as-is. Convert to a clear hint.
      if (json === '{"message":""}' || json === '{}') {
        return 'Empty error from server (likely RLS denial — check that your account has the required role).'
      }
      if (json) return json
    } catch {
      // fall through
    }
  }

  return String(e)
}
