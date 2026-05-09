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
    try {
      const json = JSON.stringify(e)
      if (json && json !== '{}') return json
    } catch {
      // fall through
    }
  }

  return String(e)
}
