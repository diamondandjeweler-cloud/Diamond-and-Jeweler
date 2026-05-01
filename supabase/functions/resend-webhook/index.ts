/**
 * resend-webhook
 *
 * Receives Resend event webhooks (email delivery events).
 * On hard bounce: marks profiles.email_bounced = true so future sends are skipped.
 *
 * Setup in Resend Dashboard → Webhooks → Add Endpoint:
 *   URL: https://sfnrpbsdscikpmbhrzub.supabase.co/functions/v1/resend-webhook
 *   Events: email.bounced, email.complained
 *
 * Webhook signature (Svix): verified via RESEND_WEBHOOK_SECRET env var.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { adminClient } from '../_shared/supabase.ts'

import { webhookCorsHeaders as corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Verify Svix signature — fail closed if secret is not configured.
  const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('RESEND_WEBHOOK_SECRET is not set — rejecting webhook to prevent fake bounce attacks')
    return new Response('Service misconfigured', { status: 500 })
  }

  const svixId        = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing Svix headers', { status: 401 })
  }

  // Verify: HMAC-SHA256 of "<svix-id>.<svix-timestamp>.<body>" with the secret (base64-encoded).
  const rawBody = await req.text()
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const keyBytes = Uint8Array.from(atob(webhookSecret.replace(/^whsec_/, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const computed = 'v1,' + btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
  const supplied = svixSignature.split(' ').find(s => s.startsWith('v1,'))
  if (!supplied || computed !== supplied) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = JSON.parse(rawBody) as ResendEvent
  return await handleEvent(event)
})

interface ResendEvent {
  type: string
  data?: {
    email_id?: string
    to?: string[]
    from?: string
    subject?: string
  }
}

async function handleEvent(event: ResendEvent): Promise<Response> {
  const HARD_BOUNCE_TYPES = ['email.bounced', 'email.complained']
  if (!HARD_BOUNCE_TYPES.includes(event.type)) {
    return new Response('ok', { status: 200 })
  }

  const toAddresses = event.data?.to ?? []
  if (toAddresses.length === 0) return new Response('ok', { status: 200 })

  const db = adminClient()

  for (const email of toAddresses) {
    const { error } = await db.from('profiles')
      .update({ email_bounced: true })
      .eq('email', email)
    if (error) console.error(`bounce mark failed for ${email}:`, error.message)
    else console.log(`Marked email_bounced=true for ${email} (event: ${event.type})`)
  }

  return new Response('ok', { status: 200 })
}
