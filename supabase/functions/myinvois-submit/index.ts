/**
 * myinvois-submit
 *
 * Two modes:
 *  - { submission_id } -> submit a single myinvois_submission row
 *  - { mode: 'eod_consolidated', date? } -> run consolidated B2C for every active branch,
 *    then submit each pending consolidated row.
 *
 * Per-row flow: build payload (RPC) -> sign -> submit -> record_response.
 * Sales / consolidated / credit_note all route here. Self-billed has its own function
 * that delegates to the same submitOne logic.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { requireServiceRole } from '../_shared/auth.ts'
import {
  getAccessToken, loadCreds, resolveBaseUrl, signPayload, submitDocument,
  type MyInvoisConfig,
} from '../_shared/myinvois.ts'

type Submission = {
  id: string
  branch_id: string
  invoice_type: 'sales' | 'self_billed' | 'consolidated' | 'credit_note' | 'debit_note'
  submission_status: string
}

async function fetchConfig(admin: ReturnType<typeof adminClient>, branch_id: string): Promise<MyInvoisConfig | null> {
  const rest = (admin as unknown as { schema: (n: string) => ReturnType<typeof adminClient> }).schema('restaurant')
  const { data } = await rest.from('myinvois_config').select('*').eq('branch_id', branch_id).maybeSingle()
  return (data as MyInvoisConfig | null) ?? null
}

async function buildPayload(admin: ReturnType<typeof adminClient>, submission_id: string): Promise<unknown> {
  const rest = (admin as unknown as { schema: (n: string) => ReturnType<typeof adminClient> }).schema('restaurant')
  const { data, error } = await rest.rpc('einvoice_build_payload_any', { p_submission_id: submission_id })
  if (error) throw new Error(`build_payload failed: ${error.message}`)
  return data
}

async function recordResponse(
  admin: ReturnType<typeof adminClient>,
  submission_id: string,
  ok: boolean,
  uin: string | null,
  qr: string | null,
  response: unknown,
  errorMsg: string | null,
): Promise<void> {
  const rest = (admin as unknown as { schema: (n: string) => ReturnType<typeof adminClient> }).schema('restaurant')
  await rest.rpc('einvoice_record_response', {
    p_submission_id: submission_id,
    p_ok: ok,
    p_uin: uin,
    p_qr: qr,
    p_response: response ?? null,
    p_error: errorMsg,
  })
}

export async function submitOne(admin: ReturnType<typeof adminClient>, sub: Submission): Promise<{ ok: boolean; error?: string; uin?: string }> {
  const cfg = await fetchConfig(admin, sub.branch_id)
  if (!cfg || !cfg.is_active) {
    await recordResponse(admin, sub.id, false, null, null, null, 'myinvois_config inactive for branch')
    return { ok: false, error: 'config inactive' }
  }
  const creds = await loadCreds(admin, cfg)
  if (!creds) {
    await recordResponse(admin, sub.id, false, null, null, null, 'missing client credentials in vault')
    return { ok: false, error: 'missing creds' }
  }

  const baseUrl = resolveBaseUrl(cfg.environment)
  const token = await getAccessToken(baseUrl, creds)
  if (!token) {
    await recordResponse(admin, sub.id, false, null, null, null, 'failed to obtain access token (transient)')
    return { ok: false, error: 'no token' }
  }

  let payload: unknown
  try {
    payload = await buildPayload(admin, sub.id)
  } catch (e) {
    await recordResponse(admin, sub.id, false, null, null, null, (e as Error).message)
    return { ok: false, error: (e as Error).message }
  }
  if (!payload) {
    await recordResponse(admin, sub.id, false, null, null, null, 'payload builder returned null')
    return { ok: false, error: 'no payload' }
  }

  // Persist the request payload before sending so audit trail is complete even if request crashes
  await (admin as unknown as { schema: (n: string) => ReturnType<typeof adminClient> })
    .schema('restaurant')
    .from('myinvois_submission')
    .update({ request_payload: payload, submission_status: 'submitted', last_attempt_at: new Date().toISOString() })
    .eq('id', sub.id)

  const signed = signPayload(payload, creds)
  const result = await submitDocument(baseUrl, token, signed)

  await recordResponse(admin, sub.id, result.ok, result.uin ?? null, result.qr ?? null, result.response ?? null, result.error ?? null)
  return { ok: result.ok, error: result.error, uin: result.uin }
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre

  const authErr = requireServiceRole(req)
  if (authErr) return authErr

  const body = await req.json().catch(() => ({})) as { submission_id?: string; mode?: string; date?: string }
  const admin = adminClient()
  const rest = (admin as unknown as { schema: (n: string) => ReturnType<typeof adminClient> }).schema('restaurant')

  // Mode 1: consolidate then submit every fresh consolidated row
  if (body.mode === 'eod_consolidated') {
    const date = body.date ?? new Date().toISOString().slice(0, 10)
    await rest.rpc('run_consolidated_b2c_all', { p_date: date })
    const { data: rows } = await rest.from('myinvois_submission')
      .select('id, branch_id, invoice_type, submission_status')
      .eq('invoice_type', 'consolidated')
      .in('submission_status', ['pending', 'pending_retry'])
    let ok = 0, fail = 0
    for (const r of (rows ?? []) as Submission[]) {
      const res = await submitOne(admin, r)
      if (res.ok) ok++; else fail++
    }
    return new Response(JSON.stringify({ ok: true, mode: 'eod_consolidated', date, submitted: ok, failed: fail }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Mode 2: single submission_id
  if (body.submission_id) {
    const { data: row } = await rest.from('myinvois_submission')
      .select('id, branch_id, invoice_type, submission_status')
      .eq('id', body.submission_id)
      .maybeSingle()
    if (!row) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const res = await submitOne(admin, row as Submission)
    return new Response(JSON.stringify(res), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'missing submission_id or mode' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
