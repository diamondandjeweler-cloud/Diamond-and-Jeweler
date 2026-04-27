/**
 * MyInvois (LHDN) e-invoice client.
 *
 * Mirrors the restaurant.* schema 1:1 for the Phase 5 e-invoice tables, plus
 * thin helpers for the cashier UI (poll-by-payment) and admin config screen.
 */
import { supabase } from '../supabase'

export type Environment = 'sandbox' | 'production'

export type SubmissionStatus =
  | 'pending'
  | 'submitted'
  | 'validated'
  | 'failed'
  | 'pending_retry'
  | 'escalated'
  | 'cancelled'

export type InvoiceType =
  | 'sales'
  | 'self_billed'
  | 'consolidated'
  | 'credit_note'
  | 'debit_note'

export type BuyerClassification = 'b2b' | 'b2c' | 'b2g'

export interface MyInvoisConfig {
  branch_id: string
  tin: string | null
  sst_no: string | null
  business_name: string | null
  registration_no: string | null
  address_line: string | null
  city: string | null
  state: string | null
  postcode: string | null
  country_code: string
  environment: Environment
  client_id_secret_name: string | null
  client_secret_secret_name: string | null
  cert_secret_name: string | null
  cert_password_secret_name: string | null
  consolidate_b2c: boolean
  b2c_threshold_myr: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MyInvoisSubmission {
  id: string
  branch_id: string
  invoice_type: InvoiceType
  order_id: string | null
  payment_id: string | null
  purchase_order_id: string | null
  consolidation_run_id: string | null
  parent_submission_id: string | null
  invoice_date: string
  submission_status: SubmissionStatus
  attempt_count: number
  next_retry_at: string | null
  last_attempt_at: string | null
  uin: string | null
  qr_code: string | null
  request_payload: unknown
  validation_response: unknown
  error_message: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
}

export interface SelfBilledInvoice {
  id: string
  branch_id: string
  purchase_order_id: string
  supplier_id: string | null
  submission_id: string | null
  supplier_name: string | null
  supplier_tin: string | null
  supplier_address: string | null
  total_amount: number
  shared_with_supplier_at: string | null
  shared_via: 'email' | 'portal' | 'manual' | null
  status: 'pending' | 'submitted' | 'validated' | 'failed' | 'shared' | 'escalated' | 'cancelled'
  created_at: string
}

export interface ConsolidationRun {
  id: string
  branch_id: string
  business_date: string
  status: 'pending' | 'submitted' | 'validated' | 'failed' | 'superseded'
  order_count: number
  total_amount: number
  created_at: string
  finalised_at: string | null
}

const db = supabase.schema('restaurant' as never) as unknown as ReturnType<typeof supabase.schema>

/* ============================================================
 * MyInvois config
 * ============================================================ */

export async function getMyInvoisConfig(branchId: string): Promise<MyInvoisConfig | null> {
  const { data, error } = await db.from('myinvois_config').select('*').eq('branch_id', branchId).maybeSingle()
  if (error) throw error
  return (data as MyInvoisConfig) ?? null
}

export async function upsertMyInvoisConfig(patch: Partial<MyInvoisConfig> & { branch_id: string }): Promise<MyInvoisConfig> {
  const { data, error } = await db.from('myinvois_config').upsert(patch, { onConflict: 'branch_id' }).select().single()
  if (error) throw error
  return data as MyInvoisConfig
}

/* ============================================================
 * Submissions
 * ============================================================ */

export async function getSubmissionByPayment(paymentId: string): Promise<MyInvoisSubmission | null> {
  const { data, error } = await db.from('myinvois_submission').select('*')
    .eq('payment_id', paymentId).maybeSingle()
  if (error) throw error
  return (data as MyInvoisSubmission) ?? null
}

export async function getSubmissionByOrder(orderId: string): Promise<MyInvoisSubmission | null> {
  const { data, error } = await db.from('myinvois_submission').select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as MyInvoisSubmission) ?? null
}

export async function listSubmissions(branchId: string, limit = 200): Promise<MyInvoisSubmission[]> {
  const { data, error } = await db.from('myinvois_submission').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MyInvoisSubmission[]
}

/** Invoke the edge function — returns immediately whether it queued / submitted. */
export async function triggerSubmit(submissionId: string): Promise<{ ok: boolean; error?: string; uin?: string }> {
  const { data, error } = await supabase.functions.invoke('myinvois-submit', {
    body: { submission_id: submissionId },
  })
  if (error) return { ok: false, error: error.message }
  return (data as { ok: boolean; error?: string; uin?: string }) ?? { ok: false, error: 'no response' }
}

export async function triggerSelfBilled(purchaseOrderId: string): Promise<{ ok: boolean; submitted: number; failed: number }> {
  const { data, error } = await supabase.functions.invoke('myinvois-self-billed', {
    body: { purchase_order_id: purchaseOrderId },
  })
  if (error) throw error
  return (data as { ok: boolean; submitted: number; failed: number }) ?? { ok: false, submitted: 0, failed: 0 }
}

export async function triggerEodConsolidated(date?: string): Promise<{ ok: boolean }> {
  const { data, error } = await supabase.functions.invoke('myinvois-submit', {
    body: { mode: 'eod_consolidated', date: date ?? new Date().toISOString().slice(0, 10) },
  })
  if (error) throw error
  return (data as { ok: boolean }) ?? { ok: false }
}

/* ============================================================
 * Self-billed
 * ============================================================ */

export async function listSelfBilled(branchId: string, limit = 200): Promise<SelfBilledInvoice[]> {
  const { data, error } = await db.from('self_billed_invoice').select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as SelfBilledInvoice[]
}

export async function getSelfBilledByPO(purchaseOrderId: string): Promise<SelfBilledInvoice | null> {
  const { data, error } = await db.from('self_billed_invoice').select('*')
    .eq('purchase_order_id', purchaseOrderId).maybeSingle()
  if (error) throw error
  return (data as SelfBilledInvoice) ?? null
}

/* ============================================================
 * Suppliers (e-invoice fields)
 * ============================================================ */

export interface SupplierEinvoiceFields {
  tin: string | null
  is_foreign: boolean
  foreign_tax_id: string | null
  country_code: string
  address: string | null
  city: string | null
  state: string | null
  postcode: string | null
  einvoice_email: string | null
  auto_self_billed: boolean
  self_billed_trigger: 'po_creation' | 'goods_receipt'
}

export async function updateSupplierEinvoice(supplierId: string, patch: Partial<SupplierEinvoiceFields>): Promise<void> {
  const { error } = await db.from('supplier').update(patch).eq('id', supplierId)
  if (error) throw error
}

/* ============================================================
 * Order buyer fields (B2B/B2G)
 * ============================================================ */

export interface OrderBuyerFields {
  buyer_classification: BuyerClassification
  buyer_tin: string | null
  buyer_name: string | null
  buyer_address: string | null
  buyer_email: string | null
  buyer_phone: string | null
  buyer_reg_no: string | null
  einvoice_required: boolean
}

export async function getOrderBuyerFields(orderId: string): Promise<OrderBuyerFields | null> {
  const { data, error } = await db.from('orders').select(
    'buyer_classification, buyer_tin, buyer_name, buyer_address, buyer_email, buyer_phone, buyer_reg_no, einvoice_required',
  ).eq('id', orderId).maybeSingle()
  if (error) throw error
  return (data as OrderBuyerFields) ?? null
}

export async function updateOrderBuyerFields(orderId: string, patch: Partial<OrderBuyerFields>): Promise<void> {
  const { error } = await db.from('orders').update(patch).eq('id', orderId)
  if (error) throw error
}

/* ============================================================
 * Consolidated runs / EOD status
 * ============================================================ */

export async function listConsolidationRuns(branchId: string, limit = 30): Promise<ConsolidationRun[]> {
  const { data, error } = await db.from('einvoice_consolidation_run').select('*')
    .eq('branch_id', branchId)
    .order('business_date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as ConsolidationRun[]
}

/* ============================================================
 * Polling helper used by cashier UI
 * ============================================================ */

export async function pollForSubmission(
  paymentId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<MyInvoisSubmission | null> {
  const interval = opts.intervalMs ?? 1500
  const timeout  = opts.timeoutMs  ?? 60000
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const sub = await getSubmissionByPayment(paymentId)
    if (sub && (sub.submission_status === 'validated'
                || sub.submission_status === 'failed'
                || sub.submission_status === 'escalated')) {
      return sub
    }
    if (sub && (sub.submission_status === 'pending' || sub.submission_status === 'submitted')) {
      // Trigger the edge fn to push it forward (idempotent — fn is a no-op if already submitted)
      await triggerSubmit(sub.id).catch(() => {})
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  return getSubmissionByPayment(paymentId)
}
