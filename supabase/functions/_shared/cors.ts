const ALLOWED_ORIGIN = 'https://diamondandjeweler.com'

/** Restricted CORS for user-facing functions — only allows the production domain. */
export const corsHeaders: HeadersInit = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Headers for server-to-server webhooks (Billplz, Resend, MyInvois, etc.).
 * These callers are not browsers and never perform a CORS preflight, so no
 * Access-Control-Allow-* headers are emitted — only the response content type.
 */
export const webhookCorsHeaders: HeadersInit = {
  'content-type': 'application/json',
}

/** Short-circuits preflight requests. Returns null for non-OPTIONS. */
export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

/** Preflight handler for webhook endpoints (wildcard origin). */
export function handleWebhookOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: webhookCorsHeaders })
  }
  return null
}
