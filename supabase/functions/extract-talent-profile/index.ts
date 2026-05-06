/**
 * extract-talent-profile
 *
 * Synchronous extraction endpoint. Kept for admin tooling and re-runs.
 *
 * Onboarding now uses enqueue-talent-extraction (async, returns 202 and runs
 * the LLM call in EdgeRuntime.waitUntil). This endpoint is left as a
 * blocking utility for back-office workflows.
 *
 * PDPA posture: the transcript must contain NO personal identifiers —
 * name, phone, IC, employer names are collected via a separate form
 * and never enter the conversation sent to this function.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate } from '../_shared/auth.ts'
import {
  ExtractionError,
  runExtraction,
  type ExtractionMessage,
} from '../_shared/talent-extraction.ts'

serve(async (req) => {
  const pre = handleOptions(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = await authenticate(req, { requiredRoles: ['talent', 'admin'] })
  if (auth instanceof Response) return auth

  let body: { messages?: ExtractionMessage[]; resume_text?: string } = {}
  try { body = await req.json() } catch { /* empty */ }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: 'No messages provided' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const result = await runExtraction(messages, body.resume_text)
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const status = err instanceof ExtractionError && err.message.includes('No AI provider') ? 503 : 500
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Extraction failed',
    }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
