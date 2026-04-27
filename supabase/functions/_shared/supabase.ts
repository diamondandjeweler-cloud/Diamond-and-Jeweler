import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * Admin client. Uses the service-role key; bypasses RLS entirely.
 * Only use inside Edge Functions for trusted server-side work.
 */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

/**
 * User-scoped client that forwards a caller's JWT. RLS still applies.
 * Useful when an Edge Function needs to act *as* the caller rather than bypass RLS.
 */
export function userClient(token: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}
