import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { encryptDob } from '../lib/api'
import { getLifeChartCharacter, type Gender } from '../lib/lifeChartCharacter'
import { Button, Alert } from './ui'
import Consent from './Consent'

interface Props {
  hmId: string
  profileId: string
  onSaved: () => void
  onCancel: () => void
}

/**
 * Inline DOB collector for HMs whose hiring_managers row is missing
 * date_of_birth_encrypted. Surfaced from HMDashboard banner — see HMDashboard.
 * Saves: hiring_managers.date_of_birth_encrypted/gender/life_chart_character +
 * profiles.consents.dob.
 */
export default function AddHmDobModal({ hmId, profileId, onSaved, onCancel }: Props) {
  const [dob, setDob] = useState('')
  const [gender, setGender] = useState<Gender | ''>('')
  const [dobConsent, setDobConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    if (!dob || !gender || !dobConsent) return
    setErr(null)
    setBusy(true)
    try {
      const dobEncrypted = await encryptDob(dob)
      const lifeChartCharacter = getLifeChartCharacter(dob, gender)

      const { error: hmErr } = await supabase
        .from('hiring_managers')
        .update({
          date_of_birth_encrypted: dobEncrypted,
          gender,
          life_chart_character: lifeChartCharacter,
        })
        .eq('id', hmId)
      if (hmErr) throw hmErr

      const { data: prof } = await supabase
        .from('profiles')
        .select('consents')
        .eq('id', profileId)
        .maybeSingle()
      const nextConsents = {
        ...((prof?.consents as Record<string, unknown>) ?? {}),
        dob: true,
        dob_consented_at: new Date().toISOString(),
      }
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ consents: nextConsents })
        .eq('id', profileId)
      if (pErr) throw pErr

      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hm-add-dob-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 id="hm-add-dob-title" className="text-xl font-semibold text-ink-900">
          A little more about you
        </h2>
        <p className="text-sm text-ink-700">
          We&apos;d love to know a little more about you so we can pitch you to the right talent —
          the kind of person who&apos;ll really click with how you work. Just your date of birth and
          gender. Encrypted and never shown to candidates.
        </p>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          max={new Date(Date.now() - 18 * 365 * 86400000).toISOString().slice(0, 10)}
          className="w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="space-y-1">
          <p className="text-sm text-ink-600">Gender:</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setGender('male')}
              className={`border rounded-lg px-3 py-2 text-sm ${gender === 'male' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
            >Male</button>
            <button
              type="button"
              onClick={() => setGender('female')}
              className={`border rounded-lg px-3 py-2 text-sm ${gender === 'female' ? 'bg-brand-500 text-white border-brand-500' : 'border-ink-200 text-ink-700 hover:bg-ink-50'}`}
            >Female</button>
          </div>
        </div>
        <Consent
          checked={dobConsent}
          onChange={setDobConsent}
          label="I agree to share these details with DNJ to help find the right talent for me. Encrypted and never shown to candidates."
          required
        />
        {err && <Alert tone="red">{err}</Alert>}
        <div className="flex gap-2 pt-2">
          <Button variant="secondary" onClick={onCancel} className="flex-1" disabled={busy}>
            Not now
          </Button>
          <Button
            onClick={() => { void save() }}
            disabled={!dob || !gender || !dobConsent || busy}
            loading={busy}
            className="flex-1"
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}
