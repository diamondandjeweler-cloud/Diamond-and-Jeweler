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
  if (error) throw error
  return data as T
}
