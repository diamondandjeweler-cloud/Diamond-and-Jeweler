/**
 * buy-points
 *
 * Starts a Billplz checkout for a Diamond Points package.
 * Creates a pending point_purchases row, returns a Billplz payment URL.
 * Points are credited to the buyer only after payment-webhook confirms paid=true.
 *
 * Billplz credentials (Edge Function secrets):
 *   BILLPLZ_API_KEY        — Billplz API key (Basic auth username)
 *   BILLPLZ_COLLECTION_ID  — Billplz collection ID
 *   BILLPLZ_BASE_URL       — default https://www.billplz.com
 *   SITE_URL               — used for redirect/callback URLs
 *
 * Falls back to mock mode (no real charge) when BILLPLZ_API_KEY is unset.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface PointsPackage {
  id: string
  name: string
  price_rm: number
  points: number
}

interface Body { package_id?: string }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, {
    requiredRoles: ['talent', 'hiring_manager', 'hr_admin', 'admin'],
  })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }
  const packageId = body.package_id?.trim()
  if (!packageId) return json({ error: 'Missing package_id' }, 400)

  const db = adminClient()

  // Resolve package from system_config (single source of truth — no client trust).
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', 'points_packages').maybeSingle()
  const packages = Array.isArray(cfg?.value) ? cfg!.value as PointsPackage[] : []
  const pkg = packages.find((p) => p.id === packageId)
  if (!pkg) return json({ error: `Unknown package_id: ${packageId}` }, 404)

  // Insert pending purchase row first so the webhook always has something to reconcile.
  const { data: purchase, error: insErr } = await db
    .from('point_purchases')
    .insert({
      user_id: auth.userId,
      package_id: pkg.id,
      package_name: pkg.name,
      amount_rm: pkg.price_rm,
      points: pkg.points,
      currency: 'RM',
      payment_status: 'pending',
      payment_provider: 'billplz',
    })
    .select('id')
    .single()
  if (insErr || !purchase) return json({ error: insErr?.message ?? 'Insert failed' }, 500)

  // Resolve full_name for the Billplz bill customer field.
  const { data: profileRow } = await db.from('profiles').select('full_name')
    .eq('id', auth.userId).maybeSingle()
  const customerName = profileRow?.full_name?.trim() || auth.email

  const apiKey = Deno.env.get('BILLPLZ_API_KEY')
  const collectionId = Deno.env.get('BILLPLZ_COLLECTION_ID')
  const site = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'
  const billplzBase = Deno.env.get('BILLPLZ_BASE_URL') ?? 'https://www.billplz.com'
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`

  // Safety guard: test accounts (@dnj-test.my) must never be routed to the
  // production Billplz domain. If the project secrets still point at prod
  // (billplz.com, not billplz-sandbox.com), force mock mode for testers so a
  // QA click on "Buy" cannot charge a real bank account.
  const isTestEmail = typeof auth.email === 'string' && auth.email.toLowerCase().endsWith('@dnj-test.my')
  const isProdBillplz = /^https?:\/\/(www\.)?billplz\.com/i.test(billplzBase)
  const forceMockForTester = isTestEmail && isProdBillplz

  let billId: string
  let paymentUrl: string

  if (!apiKey || !collectionId || forceMockForTester) {
    // Mock mode for dev/preview environments + safety guard for test accounts.
    billId = `MOCK-PTS-${purchase.id}`
    paymentUrl = `${site}/payment/mock?purchase=${purchase.id}&kind=points`
  } else {
    const credentials = btoa(`${apiKey}:`)
    const billplzRes = await fetch(`${billplzBase}/api/v3/bills`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        collection_id: collectionId,
        description: `DNJ Diamond Points — ${pkg.name} (${pkg.points} pts)`,
        email: auth.email,
        name: customerName,
        amount: Math.round(pkg.price_rm * 100), // Billplz expects cents
        callback_url: webhookUrl,
        redirect_url: `${site}/payment/return?purchase=${purchase.id}&kind=points`,
        reference_1_label: 'Purchase ID',
        reference_1: purchase.id,
        reference_2_label: 'Kind',
        reference_2: 'points',
      }),
    })
    if (!billplzRes.ok) {
      const errText = await billplzRes.text()
      return json({ error: `Billplz createBill failed: ${billplzRes.status} — ${errText}` }, 502)
    }
    const bill = await billplzRes.json() as { id: string; url: string }
    billId = bill.id
    paymentUrl = bill.url
  }

  const { error: linkErr } = await db.from('point_purchases')
    .update({ payment_intent_id: billId })
    .eq('id', purchase.id)
  if (linkErr) return json({ error: `Bill link failed: ${linkErr.message}` }, 500)

  return new Response(
    JSON.stringify({
      purchase_id: purchase.id,
      bill_id: billId,
      paymentUrl,
      amount_rm: pkg.price_rm,
      points: pkg.points,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
