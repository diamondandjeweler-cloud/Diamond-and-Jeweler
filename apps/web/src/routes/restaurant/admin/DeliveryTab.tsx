import { Card, CardBody } from '../../../components/ui'

/* ─────────────────────────────────────────────
   DELIVERY PLATFORMS TAB
───────────────────────────────────────────── */

const PLATFORMS = [
  {
    id:   'grab',
    name: 'GrabFood',
    color: 'bg-green-50 border-green-200',
    badge: 'bg-green-600',
    steps: [
      'Apply for GrabFood Merchant API access at grab.com/my/merchant',
      'After approval, go to Merchant Portal → Integrations → Webhooks',
      'Register webhook URL: https://www.diamondandjeweler.com/api/webhooks/grab',
      'Copy the signing secret → add to Vercel env as GRAB_SECRET',
      'Copy your Merchant ID  → add to Vercel env as GRAB_MERCHANT_ID',
      'Set GRAB_BRANCH_ID to your branch ID (visible in browser URL when on this page)',
    ],
    envVars: ['GRAB_SECRET', 'GRAB_MERCHANT_ID', 'GRAB_BRANCH_ID'],
  },
  {
    id:   'foodpanda',
    name: 'FoodPanda',
    color: 'bg-pink-50 border-pink-200',
    badge: 'bg-pink-600',
    steps: [
      'Contact FoodPanda Malaysia via vendor.foodpanda.my to request API access',
      'After approval, go to Vendor Portal → API & Webhooks',
      'Register webhook URL: https://www.diamondandjeweler.com/api/webhooks/foodpanda',
      'Copy the HMAC secret  → add to Vercel env as FOODPANDA_SECRET',
      'Set FOODPANDA_BRANCH_ID to your branch ID',
    ],
    envVars: ['FOODPANDA_SECRET', 'FOODPANDA_BRANCH_ID'],
  },
  {
    id:   'shopee',
    name: 'Shopee Food',
    color: 'bg-orange-50 border-orange-200',
    badge: 'bg-orange-500',
    steps: [
      'Apply for Shopee Food partner access at open.shopee.com',
      'After approval, go to Partner Portal → Webhook Settings',
      'Register webhook URL: https://www.diamondandjeweler.com/api/webhooks/shopee',
      'Copy the partner key  → add to Vercel env as SHOPEE_SECRET',
      'Set SHOPEE_BRANCH_ID to your branch ID',
    ],
    envVars: ['SHOPEE_SECRET', 'SHOPEE_BRANCH_ID'],
  },
]

export function DeliveryTab() {
  return (
    <div className="space-y-5">
      {/* How it works */}
      <Card><CardBody>
        <h2 className="font-display text-lg mb-2">How delivery integration works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-ink-600">
          {[
            ['1. Register', 'Apply for API/merchant access with each platform. This requires a business registration.'],
            ['2. Add credentials', 'Paste the secret keys into Vercel → Project → Settings → Environment Variables.'],
            ['3. Map menu items', 'In Menu & pricing → Edit each item → fill in the platform item IDs so orders match correctly.'],
            ['4. Orders flow in', 'Platform orders hit your webhook → parsed → sent to KDS automatically, tagged with source.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-ink-50 rounded-xl p-4">
              <div className="font-semibold text-ink-800 mb-1">{title}</div>
              <div>{desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Add env vars in Vercel:</strong> go to{' '}
          <a href="https://vercel.com/diamondandjeweler-5185s-projects/bole/settings/environment-variables"
            target="_blank" rel="noreferrer" className="underline font-medium">
            Vercel → bole → Settings → Environment Variables
          </a>{' '}
          and add each key below. Then redeploy.
        </div>
        <div className="mt-2 text-xs text-ink-500 font-mono bg-ink-50 rounded p-2">
          SUPABASE_SERVICE_ROLE_KEY = &lt;your-service-role-key-from-supabase-dashboard&gt;
        </div>
      </CardBody></Card>

      {/* Platform cards */}
      {PLATFORMS.map((p) => (
        <div key={p.id} className={`border rounded-xl overflow-hidden ${p.color}`}>
          <div className="px-5 py-4 flex items-center gap-3">
            <span className={`${p.badge} text-white text-xs font-bold px-2 py-0.5 rounded`}>{p.name}</span>
            <span className="text-sm text-ink-500">Not yet connected — follow the steps below</span>
          </div>
          <div className="bg-white px-5 py-4 border-t border-ink-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Steps */}
              <div>
                <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Setup steps</div>
                <ol className="space-y-1.5 text-sm text-ink-700 list-decimal list-inside">
                  {p.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
              {/* Env vars + webhook URL */}
              <div>
                <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Vercel environment variables</div>
                <div className="space-y-1.5 mb-4">
                  {p.envVars.map((v) => (
                    <div key={v} className="font-mono text-xs bg-ink-50 border border-ink-200 rounded px-3 py-1.5 text-ink-700">{v}</div>
                  ))}
                </div>
                <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">Webhook URL to register</div>
                <div className="font-mono text-xs bg-ink-50 border border-ink-200 rounded px-3 py-2 text-brand-700 break-all">
                  https://www.diamondandjeweler.com/api/webhooks/{p.id}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
