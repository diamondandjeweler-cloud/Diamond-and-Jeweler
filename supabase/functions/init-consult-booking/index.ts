/**
 * init-consult-booking
 *
 * Creates a pending consult_bookings row for the signed-in user and (when
 * ToyyibPay is configured) returns a payment redirect URL. If ToyyibPay
 * keys aren't set yet, returns a `manual: true` flag so the frontend can
 * show a "we'll be in touch" message and the admin can manually mark
 * the booking paid.
 *
 * Body: { tier: 'quick' | 'standard' | 'deep' }
 *
 * Auth: any authenticated user.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body { tier?: 'quick' | 'standard' | 'deep' }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req)
  if (auth instanceof Response) return auth
  if (auth.isServiceRole) return json({ error: 'Service role cannot book consults' }, 403)

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* empty body tolerated */ }
  const tier = body.tier
  if (tier !== 'quick' && tier !== 'standard' && tier !== 'deep') {
    return json({ error: 'tier must be quick, standard, or deep' }, 400)
  }

  const db = adminClient()

  // Pull current admin-configured price + duration.
  const [pRow, mRow] = await Promise.all([
    db.from('system_config').select('value').eq('key', `consult_price_${tier}`).maybeSingle(),
    db.from('system_config').select('value').eq('key', `consult_minutes_${tier}`).maybeSingle(),
  ])
  const price = typeof pRow.data?.value === 'number' ? pRow.data.value : null
  const minutes = typeof mRow.data?.value === 'number' ? mRow.data.value : null
  if (price == null || price <= 0 || minutes == null || minutes <= 0) {
    return json({ error: `Tier ${tier} is not yet configured. Ask the admin to set the price.` }, 503)
  }

  // Create the pending booking row.
  const { data: row, error: insErr } = await db.from('consult_bookings')
    .insert({
      profile_id: auth.userId,
      tier,
      duration_minutes: minutes,
      price_rm: price,
      payment_provider: 'toyyibpay',
      status: 'pending',
    })
    .select('id')
    .single()
  if (insErr || !row) return json({ error: insErr?.message ?? 'Failed to create booking' }, 500)

  const tpSecret = Deno.env.get('TOYYIBPAY_SECRET')
  const tpCategory = Deno.env.get('TOYYIBPAY_CATEGORY_CODE')
  const tpBaseUrl = Deno.env.get('TOYYIBPAY_BASE_URL') ?? 'https://toyyibpay.com'
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''

  // If ToyyibPay isn't configured yet, return a manual flag so the
  // frontend can show "admin will be in touch" instead of a fake URL.
  if (!tpSecret || !tpCategory) {
    return json({
      booking_id: row.id,
      tier, price_rm: price, duration_minutes: minutes,
      manual: true,
      message: 'Payment provider not yet configured. The admin will contact you to confirm.',
    }, 200)
  }

  // Create a ToyyibPay bill.
  const billParams = new URLSearchParams({
    userSecretKey: tpSecret,
    categoryCode: tpCategory,
    billName: `BoLe career consult (${tier})`.slice(0, 30),
    billDescription: `${minutes}-minute 1:1 consult`.slice(0, 100),
    billPriceSetting: '1',
    billPayorInfo: '1',
    billAmount: String(Math.round(price * 100)),  // sen
    billReturnUrl: `${siteUrl}/consult/return?booking_id=${row.id}`,
    billCallbackUrl: `${supabaseUrl}/functions/v1/payment-webhook`,
    billExternalReferenceNo: row.id,
    billTo: auth.email,
    billEmail: auth.email,
    billPhone: '',
    billSplitPayment: '0',
    billPaymentChannel: '0',
    billContentEmail: 'Thank you for booking a consult. Once paid, you will receive your video link by email.',
    billChargeToCustomer: '0',
  })

  let billCode = ''
  try {
    const resp = await fetch(`${tpBaseUrl}/index.php/api/createBill`, {
      method: 'POST',
      body: billParams,
    })
    const text = await resp.text()
    const parsed = JSON.parse(text) as Array<{ BillCode?: string }>
    billCode = parsed?.[0]?.BillCode ?? ''
  } catch (e) {
    console.error('toyyibpay createBill failed', e)
  }

  if (!billCode) {
    return json({
      booking_id: row.id,
      tier, price_rm: price, duration_minutes: minutes,
      manual: true,
      message: 'Could not reach payment provider. The admin will contact you to confirm.',
    }, 200)
  }

  const redirectUrl = `${tpBaseUrl}/${billCode}`
  await db.from('consult_bookings')
    .update({ payment_ref: billCode, payment_redirect_url: redirectUrl })
    .eq('id', row.id)

  return json({
    booking_id: row.id,
    tier, price_rm: price, duration_minutes: minutes,
    redirect_url: redirectUrl,
    manual: false,
  }, 200)
})
