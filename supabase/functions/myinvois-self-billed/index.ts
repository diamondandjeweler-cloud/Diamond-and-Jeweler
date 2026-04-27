/**
 * myinvois-self-billed
 *
 * Triggered for a single PO (or scan-all). Submits the self-billed e-invoice
 * to MyInvois via the same code path as sales (einvoice_build_payload_any
 * dispatches by invoice_type). On validated success, optionally emails the
 * supplier the validated PDF/QR.
 *
 * Inputs:
 *   { purchase_order_id }            -> submit the PO's self_billed submission
 *   { submission_id }                -> submit a specific submission row
 *   { mode: 'scan_pending' }         -> sweep all pending self_billed rows
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import {
  getAccessToken, loadCreds, resolveBaseUrl, signPayload, submitDocument,
  type MyInvoisConfig,
} from '../_shared/myinvois.ts'

type Submission = {
  id: string
  branch_id: string
  invoice_type: 'self_billed'
  purchase_order_id: string | null
  submission_status: string
  uin: string | null
}

type RestSchema = ReturnType<typeof adminClient> & { schema: (n: string) => ReturnType<typeof adminClient> }

async function fetchConfig(admin: ReturnType<typeof adminClient>, branch_id: string): Promise<MyInvoisConfig | null> {
  const rest = (admin as unknown as RestSchema).schema('restaurant')
  const { data } = await rest.from('myinvois_config').select('*').eq('branch_id', branch_id).maybeSingle()
  return (data as MyInvoisConfig | null) ?? null
}

async function buildPayload(admin: ReturnType<typeof adminClient>, submission_id: string): Promise<unknown> {
  const rest = (admin as unknown as RestSchema).schema('restaurant')
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
  const rest = (admin as unknown as RestSchema).schema('restaurant')
  await rest.rpc('einvoice_record_response', {
    p_submission_id: submission_id,
    p_ok: ok,
    p_uin: uin,
    p_qr: qr,
    p_response: response ?? null,
    p_error: errorMsg,
  })
}

async function emailSupplier(
  admin: ReturnType<typeof adminClient>,
  submission_id: string,
  uin: string,
): Promise<{ sent: boolean; reason?: string }> {
  const rest = (admin as unknown as RestSchema).schema('restaurant')
  // Get supplier email + PO id from self_billed_invoice -> supplier
  const { data: sbi } = await rest.from('self_billed_invoice')
    .select('id, purchase_order_id, supplier_id, supplier_name')
    .eq('submission_id', submission_id)
    .maybeSingle()
  if (!sbi) return { sent: false, reason: 'no self_billed_invoice row' }

  const { data: sup } = await rest.from('supplier')
    .select('einvoice_email, name')
    .eq('id', (sbi as { supplier_id: string }).supplier_id)
    .maybeSingle()
  const email = (sup as { einvoice_email: string | null } | null)?.einvoice_email
  if (!email) return { sent: false, reason: 'supplier has no einvoice_email configured' }

  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY not set' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('EINVOICE_FROM_EMAIL') ?? 'einvoice@destinoraclessolution.com',
        to: email,
        subject: `Self-billed e-invoice ${uin}`,
        html: `<p>Dear ${(sup as { name: string }).name ?? 'Supplier'},</p>
               <p>A self-billed e-invoice has been validated by LHDN MyInvois.</p>
               <p><strong>UIN:</strong> ${uin}</p>
               <p>You may verify this invoice via the MyInvois portal.</p>`,
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return { sent: false, reason: `Resend HTTP ${res.status}: ${text.slice(0, 200)}` }
    }

    // Mark shared
    await rest.rpc('mark_self_billed_shared', {
      p_purchase_order_id: (sbi as { purchase_order_id: string }).purchase_order_id,
      p_via: 'email',
    })
    return { sent: true }
  } catch (e) {
    return { sent: false, reason: (e as Error).message }
  }
}

async function submitOne(admin: ReturnType<typeof adminClient>, sub: Submission): Promise<{ ok: boolean; error?: string; uin?: string }> {
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

  await (admin as unknown as RestSchema).schema('restaurant')
    .from('myinvois_submission')
    .update({ request_payload: payload, submission_status: 'submitted', last_attempt_at: new Date().toISOString() })
    .eq('id', sub.id)

  const signed = signPayload(payload, creds)
  const result = await submitDocument(baseUrl, token, signed)
  await recordResponse(admin, sub.id, result.ok, result.uin ?? null, result.qr ?? null, result.response ?? null, result.error ?? null)

  // On success, attempt to email the supplier (non-fatal if it fails)
  if (result.ok && result.uin) {
    await emailSupplier(admin, sub.id, result.uin)
  }
  return { ok: result.ok, error: result.error, uin: result.uin }
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre

  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`
  if (auth !== expected) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => ({})) as {
    purchase_order_id?: string; submission_id?: string; mode?: string
  }
  const admin = adminClient()
  const rest = (admin as unknown as RestSchema).schema('restaurant')

  // Resolve target submissions
  let targets: Submission[] = []
  if (body.submission_id) {
    const { data } = await rest.from('myinvois_submission')
      .select('id, branch_id, invoice_type, purchase_order_id, submission_status, uin')
      .eq('id', body.submission_id).eq('invoice_type', 'self_billed').maybeSingle()
    if (data) targets = [data as Submission]
  } else if (body.purchase_order_id) {
    const { data } = await rest.from('myinvois_submission')
      .select('id, branch_id, invoice_type, purchase_order_id, submission_status, uin')
      .eq('purchase_order_id', body.purchase_order_id)
      .eq('invoice_type', 'self_billed')
      .maybeSingle()
    if (data) targets = [data as Submission]
  } else if (body.mode === 'scan_pending') {
    const { data } = await rest.from('myinvois_submission')
      .select('id, branch_id, invoice_type, purchase_order_id, submission_status, uin')
      .eq('invoice_type', 'self_billed')
      .in('submission_status', ['pending', 'pending_retry'])
      .limit(50)
    targets = (data ?? []) as Submission[]
  } else {
    return new Response(JSON.stringify({ error: 'missing purchase_order_id, submission_id, or mode' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let ok = 0, fail = 0
  const results: Array<{ submission_id: string; ok: boolean; error?: string; uin?: string }> = []
  for (const t of targets) {
    const r = await submitOne(admin, t)
    if (r.ok) ok++; else fail++
    results.push({ submission_id: t.id, ...r })
  }

  return new Response(JSON.stringify({ ok: true, submitted: ok, failed: fail, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
