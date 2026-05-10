import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Alert, Button, Spinner } from '../../../components/ui'

interface Package {
  id: string
  name: string
  price_rm: number
  points: number
}

interface EarnRates {
  reject_with_reason: number
  accept_interview: number
  interviewer_rejects: number
  end_review: number
  referrer: number
  referee_welcome: number
}

export default function PricingPanel() {
  const [packages, setPackages] = useState<Package[]>([])
  const [earn, setEarn] = useState<EarnRates>({
    reject_with_reason: 5,
    accept_interview: 5,
    interviewer_rejects: 5,
    end_review: 5,
    referrer: 19,
    referee_welcome: 5,
  })
  const [singleMatchPriceRm, setSingleMatchPriceRm] = useState('9.90')
  const [redemptionCost, setRedemptionCost] = useState('21')
  const [freeQuota, setFreeQuota] = useState('3')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    const keys = [
      'points_packages', 'extra_match_price_rm', 'points_per_extra_match',
      'free_matches_quota', 'earn_reject_with_reason', 'earn_accept_interview',
      'earn_interviewer_rejects', 'earn_end_review', 'points_per_referral',
      'points_referee_welcome',
    ]
    const { data } = await supabase.from('system_config').select('key, value').in('key', keys)
    if (data) {
      const m = Object.fromEntries(data.map((r) => [r.key, r.value]))
      if (Array.isArray(m.points_packages)) setPackages(m.points_packages as Package[])
      if (typeof m.extra_match_price_rm === 'number') setSingleMatchPriceRm(String(m.extra_match_price_rm))
      if (typeof m.points_per_extra_match === 'number') setRedemptionCost(String(m.points_per_extra_match))
      if (typeof m.free_matches_quota === 'number') setFreeQuota(String(m.free_matches_quota))
      setEarn({
        reject_with_reason: typeof m.earn_reject_with_reason === 'number' ? m.earn_reject_with_reason : 5,
        accept_interview:   typeof m.earn_accept_interview === 'number'   ? m.earn_accept_interview   : 5,
        interviewer_rejects:typeof m.earn_interviewer_rejects === 'number'? m.earn_interviewer_rejects: 5,
        end_review:         typeof m.earn_end_review === 'number'         ? m.earn_end_review         : 5,
        referrer:           typeof m.points_per_referral === 'number'     ? m.points_per_referral     : 19,
        referee_welcome:    typeof m.points_referee_welcome === 'number'  ? m.points_referee_welcome  : 5,
      })
    }
    setLoading(false)
  }

  async function save() {
    setErr(null); setOk(false); setSaving(true)
    const priceRm = parseFloat(singleMatchPriceRm)
    const cost    = parseInt(redemptionCost, 10)
    const quota   = parseInt(freeQuota, 10)
    if (isNaN(priceRm) || priceRm <= 0) { setErr('Single-match price must be a positive number'); setSaving(false); return }
    if (isNaN(cost) || cost <= 0) { setErr('Redemption cost must be a positive integer'); setSaving(false); return }
    if (isNaN(quota) || quota <= 0) { setErr('Free matches quota must be a positive integer'); setSaving(false); return }
    for (const pkg of packages) {
      if (!pkg.name.trim()) { setErr('All packages need a name'); setSaving(false); return }
      if (pkg.price_rm <= 0) { setErr(`Package "${pkg.name}": price must be positive`); setSaving(false); return }
      if (pkg.points <= 0) { setErr(`Package "${pkg.name}": points must be positive`); setSaving(false); return }
    }

    const upserts = [
      { key: 'points_packages',         value: packages },
      { key: 'extra_match_price_rm',    value: priceRm },
      { key: 'points_per_extra_match',  value: cost },
      { key: 'free_matches_quota',      value: quota },
      { key: 'earn_reject_with_reason', value: earn.reject_with_reason },
      { key: 'earn_accept_interview',   value: earn.accept_interview },
      { key: 'earn_interviewer_rejects',value: earn.interviewer_rejects },
      { key: 'earn_end_review',         value: earn.end_review },
      { key: 'points_per_referral',     value: earn.referrer },
      { key: 'points_referee_welcome',  value: earn.referee_welcome },
    ]

    for (const row of upserts) {
      const { error } = await supabase.from('system_config')
        .update({ value: row.value }).eq('key', row.key)
      if (error) { setErr(`Failed to save ${row.key}: ${error.message}`); setSaving(false); return }
    }
    setOk(true)
    setSaving(false)
  }

  function addPackage() {
    setPackages((p) => [...p, { id: crypto.randomUUID(), name: '', price_rm: 0, points: 0 }])
  }

  function updatePkg(id: string, field: keyof Package, raw: string) {
    setPackages((p) => p.map((pkg) =>
      pkg.id === id
        ? { ...pkg, [field]: field === 'name' ? raw : parseFloat(raw) || 0 }
        : pkg,
    ))
  }

  function removePkg(id: string) {
    setPackages((p) => p.filter((pkg) => pkg.id !== id))
  }

  if (loading) return <div className="py-8 text-center"><Spinner /></div>

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Points packages */}
      <section>
        <h2 className="font-semibold text-ink-900 mb-1">Diamond Points packages</h2>
        <p className="text-xs text-ink-500 mb-3">Packages users can buy via Billplz FPX. Add, remove, or edit freely.</p>
        <div className="space-y-2">
          {packages.map((pkg) => (
            <div key={pkg.id} className="flex items-center gap-2 bg-white border border-ink-200 rounded-lg px-3 py-2">
              <input
                aria-label="Package name"
                value={pkg.name}
                onChange={(e) => updatePkg(pkg.id, 'name', e.target.value)}
                placeholder="Package name"
                className="flex-1 text-sm border-0 outline-none bg-transparent"
              />
              <label htmlFor={`pkg-rm-${pkg.id}`} className="text-xs text-ink-500 shrink-0">RM</label>
              <input
                id={`pkg-rm-${pkg.id}`}
                type="number"
                min="1"
                step="0.01"
                value={pkg.price_rm || ''}
                onChange={(e) => updatePkg(pkg.id, 'price_rm', e.target.value)}
                className="w-20 text-sm border border-ink-200 rounded px-2 py-1"
              />
              <label htmlFor={`pkg-pts-${pkg.id}`} className="text-xs text-ink-500 shrink-0">Diamond Points</label>
              <input
                id={`pkg-pts-${pkg.id}`}
                type="number"
                min="1"
                value={pkg.points || ''}
                onChange={(e) => updatePkg(pkg.id, 'points', e.target.value)}
                className="w-20 text-sm border border-ink-200 rounded px-2 py-1"
              />
              <button
                type="button"
                onClick={() => removePkg(pkg.id)}
                className="text-red-500 hover:text-red-700 text-xs px-2"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addPackage}
          className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium"
        >
          + Add package
        </button>
      </section>

      {/* Single match + redemption */}
      <section>
        <h2 className="font-semibold text-ink-900 mb-3">Match pricing</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="pricing-single-match-rm" className="block text-xs text-ink-600 mb-1">Single extra match (RM)</label>
            <input
              id="pricing-single-match-rm"
              type="number"
              min="1"
              step="0.01"
              value={singleMatchPriceRm}
              onChange={(e) => setSingleMatchPriceRm(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pricing-redemption-cost" className="block text-xs text-ink-600 mb-1">Redeem cost (Diamond Points / match)</label>
            <input
              id="pricing-redemption-cost"
              type="number"
              min="1"
              value={redemptionCost}
              onChange={(e) => setRedemptionCost(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pricing-free-quota" className="block text-xs text-ink-600 mb-1">Free matches per account</label>
            <input
              id="pricing-free-quota"
              type="number"
              min="1"
              value={freeQuota}
              onChange={(e) => setFreeQuota(e.target.value)}
              className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
      </section>

      {/* Earn rates */}
      <section>
        <h2 className="font-semibold text-ink-900 mb-3">Earn rates (Diamond Points per action)</h2>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['reject_with_reason',  'Reject a match + give reason (each)'],
            ['accept_interview',    'Accept match → interview happens'],
            ['interviewer_rejects', 'Interviewer rejects candidate (consolation)'],
            ['end_review',         'Submit end-to-end review'],
            ['referrer',           'Refer a friend (referrer reward)'],
            ['referee_welcome',    'Sign up via referral (referee welcome)'],
          ] as [keyof EarnRates, string][]).map(([field, label]) => (
            <div key={field}>
              <label className="block text-xs text-ink-600 mb-1">{label}</label>
              <input
                type="number"
                min="0"
                value={earn[field]}
                onChange={(e) => setEarn((r) => ({ ...r, [field]: parseInt(e.target.value, 10) || 0 }))}
                className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      {err && <Alert tone="red">{err}</Alert>}
      {ok  && <Alert tone="green">Saved successfully.</Alert>}

      <Button onClick={() => void save()} loading={saving} variant="brand">
        Save all pricing settings
      </Button>
    </div>
  )
}
