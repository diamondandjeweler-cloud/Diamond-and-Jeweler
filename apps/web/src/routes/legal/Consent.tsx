import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { Alert, Button, Card, CardBody, Spinner } from '../../components/ui'

interface ConsentVersion {
  id: string
  version: string
  language: string
  body_md: string
}

export default function Consent() {
  const { t, i18n } = useTranslation()
  const { session, profile, refresh } = useSession()
  const navigate = useNavigate()
  const [versions, setVersions] = useState<ConsentVersion[]>([])
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('consent_versions').select('*').eq('is_active', true)
      .then(({ data }) => setVersions((data as ConsentVersion[] | null) ?? []))
  }, [])

  if (!session) return <Navigate to="/login" replace />
  if (profile?.consent_version) return <Navigate to="/home" replace />

  const lang = i18n.language.startsWith('zh') ? 'zh' : i18n.language.startsWith('ms') ? 'ms' : 'en'
  const v = versions.find((x) => x.language === lang) ?? versions[0]

  const submit = async () => {
    if (!agree) { setError(t('consent.errorRequired')); return }
    if (!v) return
    setBusy(true); setError(null)
    try {
      // Hash IP with a hard 3s timeout — fall back gracefully if slow/blocked.
      let ipHash: string | null = null
      try {
        const ac = new AbortController()
        const tid = setTimeout(() => ac.abort(), 3000)
        const r = await fetch('https://api.ipify.org?format=json', { signal: ac.signal })
        clearTimeout(tid)
        const j = await r.json() as { ip: string }
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(j.ip + session.user.id))
        ipHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
      } catch { /* tolerate */ }

      const { error: e1 } = await supabase.from('profiles').update({
        consent_version: v.version,
        consent_signed_at: new Date().toISOString(),
        consent_ip_hash: ipHash,
      }).eq('id', session.user.id)
      if (e1) throw e1

      // Update local store immediately so ConsentGate unblocks, then navigate.
      useSession.setState((s) => ({
        profile: s.profile ? { ...s.profile, consent_version: v.version } : s.profile,
      }))
      navigate('/home', { replace: true })
      void refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!v) return <div className="p-10 text-center"><Spinner /> {t('common.loading')}</div>

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10">
      <Card elevated>
        <CardBody>
          <div className="eyebrow mb-1">PDPA</div>
          <h1 className="font-display text-2xl md:text-3xl text-ink-900 mb-1">{t('consent.title')}</h1>
          <p className="text-ink-500 mb-6">{t('consent.subtitle')}</p>

          <div
            className="prose prose-sm max-w-none mb-6 max-h-[50vh] overflow-y-auto border border-ink-200 rounded-lg p-4 bg-ink-50"
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(v.body_md) }}
          />

          <label className="flex items-start gap-3 mb-4 cursor-pointer p-3 rounded-lg border border-ink-200 hover:bg-ink-50">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span className="text-sm">{t('consent.agreeLabel')}</span>
          </label>

          {error && <Alert tone="red">{error}</Alert>}

          <Button onClick={submit} loading={busy} variant="brand" className="w-full" disabled={!agree}>
            {busy ? t('consent.saving') : t('consent.agreeButton')}
          </Button>
        </CardBody>
      </Card>

      <p className="text-xs text-ink-400 text-center mt-3">v{v.version} · {v.language.toUpperCase()}</p>
    </div>
  )
}

function simpleMarkdown(md: string): string {
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]!)
  return escape(md)
    .replace(/^# (.*$)/gm, '<h2 class="font-display text-xl mt-4 mb-2">$1</h2>')
    .replace(/^## (.*$)/gm, '<h3 class="font-display text-lg mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="my-2">')
    .replace(/^(?!<)/gm, '<p class="my-2">')
    .replace(/\n/g, ' ')
}
