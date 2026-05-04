import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { supabase } from '../../lib/supabase'
import { Alert, Button, Card, CardBody, Spinner } from '../../components/ui'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

interface ConsentVersion {
  id: string
  version: string
  language: string
  body_md: string
}

export default function Consent() {
  useDocumentTitle('Data processing consent')
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
  const baseVersion = versions.find((x) => x.language === lang) ?? versions[0]
  // Talent and hiring side agree to the same legal waiver, but the
  // *visible* "what data we collect" bullets are role-specific. Hiring users
  // don't upload NRIC/DOB/résumé, so showing them talent-side language was
  // both misleading and a lawyer-flag. We keep the same consent_version row
  // (so the DB record is unchanged) but swap the rendered body for the
  // hiring side. Falls back to the original copy for talents.
  const isHiring = profile?.role === 'hr_admin' || profile?.role === 'hiring_manager'
  const v: ConsentVersion | undefined = baseVersion ? {
    ...baseVersion,
    body_md: isHiring ? hiringBody(lang) : baseVersion.body_md,
  } : undefined

  const submit = async () => {
    if (!agree) { setError(t('consent.errorRequired')); return }
    if (!v) return
    setBusy(true); setError(null)

    // Hash IP once, outside the retry loop — failure here is tolerated.
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

    const writeOnce = async () => {
      const { error: e1 } = await supabase.from('profiles').update({
        consent_version: v.version,
        consent_signed_at: new Date().toISOString(),
        consent_ip_hash: ipHash,
      }).eq('id', session.user.id)
      if (e1) throw e1
    }

    // Retry the row write with exponential backoff: 0ms, 1s, 2s.
    // Each attempt is wrapped in a 15s timeout race so a hung mobile network
    // never leaves the button stuck on "Saving…".
    const RETRY_DELAYS_MS = [0, 1000, 2000]
    let lastErr: unknown = null
    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay))
      try {
        await Promise.race([
          writeOnce(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(t('consent.networkTimeout'))), 15000),
          ),
        ])
        // Success — update local store immediately so ConsentGate unblocks, then navigate.
        useSession.setState((s) => ({
          profile: s.profile ? { ...s.profile, consent_version: v.version } : s.profile,
        }))
        navigate('/home', { replace: true })
        void refresh()
        setBusy(false)
        return
      } catch (e) {
        lastErr = e
      }
    }
    console.error('[Consent] save failed after retries:', lastErr)
    setError((lastErr as Error)?.message ?? t('consent.networkTimeout'))
    setBusy(false)
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

function hiringBody(lang: 'en' | 'ms' | 'zh'): string {
  if (lang === 'ms') {
    return `# Persetujuan Pemprosesan Data dan Penepian Tuntutan (Pihak Pengambilan Pekerja)

Saya yang bertandatangan, memberikan **persetujuan jelas** kepada DNJ ("Platform") untuk mengumpul, menyimpan, dan memproses data berikut:

- Nama penuh, e-mel, nombor telefon
- Nama syarikat, nombor pendaftaran SSM, lesen perniagaan
- Keperluan jawatan, gaji yang ditawarkan, dan penilaian temuduga

Saya faham bahawa Platform menggunakan **algoritma padanan dipacu AI** yang menganalisis profil syarikat dan keperluan jawatan untuk menentukan keserasian dengan calon. Kaedah algoritma adalah rahsia perdagangan dan tidak akan didedahkan kepada saya.

Saya bersetuju bahawa data syarikat boleh dikongsi dengan calon yang berpotensi semata-mata untuk tujuan padanan pengambilan pekerja.

## Penepian Tuntutan

Saya menepikan apa-apa hak untuk membuat tuntutan terhadap Platform di bawah Akta Perlindungan Data Peribadi 2010 (PDPA) untuk apa-apa kerugian yang berbangkit daripada pengumpulan, pemprosesan, atau penggunaan data yang dijelaskan di atas, kecuali kerugian itu berpunca daripada kecuaian melampau atau salah laku oleh Platform.

**Saya mengakui bahawa saya telah membaca dan memahami persetujuan dan penepian ini.**`
  }
  if (lang === 'zh') {
    return `# 数据处理同意书及索赔豁免（招聘方）

本人在此向 DNJ（"平台"）明确同意收集、存储和处理以下数据：

- 全名、电邮、电话号码
- 公司名称、SSM 注册号、营业执照
- 职位要求、薪酬范围与面试评估

本人理解平台使用**专有 AI 匹配算法**分析公司资料与职位要求以确定与候选人的兼容性。该算法方法属商业机密，不会向本人披露。

本人同意公司数据可与潜在候选人共享，仅用于招聘匹配。

## 索赔豁免

本人放弃在《2010 年个人数据保护法》（PDPA）下因上述数据收集、处理或使用所引起的任何索赔权利，惟平台严重过失或故意不当行为所致损失除外。

**本人确认已阅读并理解本同意书及豁免条款。**`
  }
  return `# Data Processing Consent and Waiver (Hiring side)

I, the undersigned, give my **explicit consent** to DNJ ("the Platform") to collect, store, and process the following data:

- Full name, email, phone number
- Company name, SSM registration number, business license
- Role requirements, compensation ranges, and interview assessments

I understand that the Platform uses a **proprietary AI-powered matching algorithm** that analyses company profile data and role requirements to determine compatibility with potential candidates. The exact methodology is a trade secret and will not be disclosed to me.

I agree that company data may be shared with potential candidates solely for recruitment matching.

## Waiver of Claims

I hereby waive any and all rights to bring a claim or legal action against the Platform, its owners, employees, or affiliates under the Personal Data Protection Act 2010 (PDPA) or any other Malaysian law for any loss, damage, or grievance arising from the collection, processing, or use of company data as described above, except where such loss or damage results from gross negligence or willful misconduct of the Platform.

**I acknowledge that I have read and understood this consent and waiver.**`
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
