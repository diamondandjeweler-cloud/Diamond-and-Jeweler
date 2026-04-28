import { useState } from 'react'
import { Alert, Button, Input } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'

export default function OrgSetup() {
  const { createFirstOrg } = useRestaurant()
  const [orgName, setOrgName]       = useState('')
  const [branchName, setBranchName] = useState('')
  const [saving, setSaving]         = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgName.trim() || !branchName.trim()) {
      setErr('Both fields are required.')
      return
    }
    setSaving(true); setErr(null)
    try {
      await createFirstOrg(orgName.trim(), branchName.trim())
    } catch (e) {
      setErr((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🍽️</div>
          <h1 className="font-display text-2xl font-semibold mb-2">Set up your restaurant</h1>
          <p className="text-ink-500 text-sm">
            Create your organisation to get started. You can add more branches and team members after setup.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-ink-200 rounded-2xl p-6 shadow-soft space-y-4">
          {err && <Alert tone="red">{err}</Alert>}

          <Input
            label="Restaurant / organisation name"
            placeholder="e.g. Nasi Lemak Wangi Group"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
          />
          <Input
            label="First branch name"
            placeholder="e.g. KL Central, Bangsar branch…"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            required
          />

          <Button type="submit" disabled={saving} className="w-full justify-center">
            {saving ? 'Setting up…' : 'Create & continue →'}
          </Button>
        </form>

        <p className="text-center text-xs text-ink-400 mt-4">
          You'll be the owner of this organisation. Invite team members from the Admin → Organisation tab.
        </p>
      </div>
    </div>
  )
}
