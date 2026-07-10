import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { usePlatformStats } from '../../lib/usePlatformStats'
import { Arrow, StepArrow } from './svg'

// ─────────────────────────────────────────────────────────────────────────────
// BELOW-THE-FOLD SECTIONS  (#audit: #2 How-it-Works, #5 WhatsApp, #6 Social
// proof, #8 Referral, #10 Passive talent, #24 Footer size, #30 Bole)
//
// Relocated verbatim from routes/Landing.tsx — behavior-preserving. No copy,
// className, link target, pricing, analytics or SEO changes. This is the
// SEO/conversion entry page; rendered DOM + text must stay identical.
// ─────────────────────────────────────────────────────────────────────────────

// Paste a YouTube or Vimeo embed URL here when the video is ready.
// Example YouTube: 'https://www.youtube.com/embed/VIDEO_ID?rel=0'
// Leave empty to show the "Coming soon" placeholder.
const VIDEO_URL = ''

/** Thin trust bar immediately below the hero screen */
function TrustStripImpl() {
  const { t } = useTranslation()
  const pills = [
    { icon: '🔒', label: t('landing.trustPdpa') },
    { icon: '🔐', label: t('landing.trustEncrypted') },
    { icon: '✦', label: t('landing.trustAiMatching'), gold: true },
    { icon: '🇲🇾', label: t('landing.trustMalaysiaFirst') },
  ]
  return (
    <div className="bg-navy-800 py-3 px-6">
      <ul className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-x-8 gap-y-2" aria-label={t('landing.trustSignalsAria')}>
        {pills.map((p) => (
          <li key={p.label} className={`flex items-center gap-2 text-sm ${p.gold ? 'text-gold-500 font-semibold' : 'text-white/80'}`}>
            <span aria-hidden>{p.icon}</span>
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
export const TrustStrip = memo(TrustStripImpl)

/** #7 — 60-second explainer video */
function VideoSectionImpl() {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  return (
    <section className="py-14 px-6 bg-white dark:bg-midnight-800" aria-labelledby="video-heading">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-gold-700 dark:text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">{t('landing.videoEyebrow')}</p>
        <h2 id="video-heading" className="text-2xl md:text-3xl font-bold tracking-tight text-navy-900 dark:text-white mb-2">
          {t('landing.videoTitle')}
        </h2>
        <p className="text-sm text-gray-500 max-w-lg mx-auto mb-8 leading-relaxed">
          {t('landing.videoSubtitle')}
        </p>
        <div className="relative w-full aspect-video max-w-4xl mx-auto rounded-2xl overflow-hidden
                        shadow-[0_8px_32px_-8px_rgba(11,23,66,0.22)] ring-2 ring-navy-800/20">
          {VIDEO_URL && playing ? (
            <iframe
              src={VIDEO_URL}
              title={t('landing.videoIframeTitle')}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : VIDEO_URL ? (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-4 group"
              style={{ background: 'linear-gradient(160deg,#0B1742 0%,#0B1220 100%)' }}
              aria-label={t('landing.videoPlayAria')}
            >
              <div className="w-20 h-20 rounded-full bg-gold-500/20 border-2 border-gold-500/60
                              flex items-center justify-center group-hover:bg-gold-500/30 transition-colors">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                  <polygon points="9,6 23,14 9,22" fill="#C9A24D" />
                </svg>
              </div>
              <span className="text-sm font-medium text-white/80">{t('landing.videoClickToPlay')}</span>
            </button>
          ) : (
            /* Coming-soon placeholder */
            <div
              className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-4"
              style={{ background: 'linear-gradient(160deg,#0B1742 0%,#0B1220 100%)' }}
            >
              <div className="w-20 h-20 rounded-full bg-gold-500/20 border-2 border-gold-500/60
                              flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
                  <polygon points="9,6 23,14 9,22" fill="#C9A24D" stroke="#C9A24D" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gold-500">{t('common.comingSoon')}</p>
                <p className="text-xs text-white/60 mt-1">{t('landing.videoComingSoonHint')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
export const VideoSection = memo(VideoSectionImpl)

/** #2 — How Bole works in 3 steps */
function HowItWorksSectionImpl() {
  const { t } = useTranslation()
  return (
    <section className="py-16 px-6 bg-white dark:bg-midnight-800" aria-labelledby="how-it-works-heading">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-gold-700 dark:text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">{t('landing.howEyebrow')}</p>
          <h2 id="how-it-works-heading" className="text-2xl md:text-3xl font-bold tracking-tight text-navy-900 dark:text-white">
            {t('landing.howTitle')}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-lg mx-auto text-sm leading-relaxed">
            {t('landing.howSubtitle')}
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-2">
          {/* Step 1 */}
          <div className="flex-1 text-center bg-gradient-to-b from-[#fafbff] to-white dark:from-navy-700/20 dark:to-midnight-800 rounded-2xl ring-1 ring-midnight-100 dark:ring-midnight-700 p-6 w-full">
            <div className="w-14 h-14 rounded-full bg-gold-500/10 border border-gold-500/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-gold-500 font-bold text-lg leading-none">01</span>
            </div>
            <h3 className="font-bold text-navy-900 dark:text-white mb-2">{t('landing.howStep1Title')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {t('landing.howStep1Desc')}
            </p>
          </div>

          <StepArrow />

          {/* Step 2 — highlighted (Bole) */}
          <div className="flex-1 text-center rounded-2xl ring-1 ring-brand-500/30 p-6 w-full shadow-[0_8px_32px_-8px_rgba(84,104,239,0.25)]"
               style={{ background: 'linear-gradient(160deg,#0B1742 0%,#0B1220 100%)' }}>
            <div className="w-14 h-14 rounded-full bg-gold-500/20 border border-gold-500/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-gold-500 font-bold text-xl leading-none" aria-label={t('landing.boleCharacterAria')}>伯</span>
            </div>
            <h3 className="font-bold text-white mb-2">{t('landing.howStep2Title')}</h3>
            <p className="text-sm text-white/75 leading-relaxed">
              {t('landing.howStep2Desc')}
            </p>
          </div>

          <StepArrow />

          {/* Step 3 */}
          <div className="flex-1 text-center bg-gradient-to-b from-[#fafbff] to-white dark:from-navy-700/20 dark:to-midnight-800 rounded-2xl ring-1 ring-midnight-100 dark:ring-midnight-700 p-6 w-full">
            <div className="w-14 h-14 rounded-full bg-gold-500/10 border border-gold-500/50 flex items-center justify-center mx-auto mb-4">
              <span className="text-gold-500 font-bold text-lg leading-none">03</span>
            </div>
            <h3 className="font-bold text-navy-900 dark:text-white mb-2">{t('landing.howStep3Title')}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {t('landing.howStep3Desc')}
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/start/talent"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-navy-800 text-white font-semibold text-sm hover:bg-navy-700 transition-colors shadow-[0_4px_14px_rgba(11,23,66,0.35)]"
          >
            {t('landing.howStartProfile')} <Arrow />
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t('landing.howFreeNote')}</p>
        </div>
      </div>
    </section>
  )
}
export const HowItWorksSection = memo(HowItWorksSectionImpl)

/** #30 — Meet Bole: the AI behind the matching */
function BoleSectionImpl() {
  const { t } = useTranslation()
  const facets = [
    t('landing.boleFacetSkills'),
    t('landing.boleFacetTrajectory'),
    t('landing.boleFacetCharacter'),
    t('landing.boleFacetWorkingStyle'),
    t('landing.boleFacetGrowth'),
    t('landing.boleFacetCultureFit'),
  ]
  return (
    <section
      className="py-16 px-6"
      style={{ background: 'radial-gradient(110% 120% at 80% 0%, #1B2A6B 0%, #0B1742 50%, #0B1220 100%)' }}
      aria-labelledby="bole-heading"
    >
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-3 uppercase">{t('landing.boleEyebrow')}</p>
          <div className="text-[80px] font-extrabold text-gold-500 leading-none mb-4" aria-hidden>伯樂</div>
          <h2 id="bole-heading" className="text-2xl md:text-3xl font-bold text-white mb-3 tracking-tight">
            {t('landing.boleTitle')}
          </h2>
          <p className="text-white/75 text-sm leading-relaxed max-w-sm">
            {t('landing.boleNamedLead')}{' '}
            <em>{t('landing.boleNamedEmphasis')}</em>{' '}
            {t('landing.boleNamedTrail')}
          </p>
          <p className="text-white/60 text-sm leading-relaxed mt-3 max-w-sm">
            {t('landing.boleDiamondLine')}
          </p>
          <Link
            to="/about"
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-500 hover:text-white transition-colors"
          >
            {t('landing.boleReadStory')} <Arrow />
          </Link>
        </div>
        <div>
          <p className="text-white/50 text-xs tracking-widest uppercase mb-3">{t('landing.boleSixFacets')}</p>
          <div className="flex flex-wrap gap-2">
            {facets.map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full text-sm text-midnight-200 border border-midnight-400/30 bg-midnight-400/10"
              >
                {f}
              </span>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-white/70 leading-relaxed">
            <span className="block text-gold-500 font-semibold mb-1">{t('landing.boleWhyThreeTitle')}</span>
            {t('landing.boleWhyThreeBody')}
          </div>
        </div>
      </div>
    </section>
  )
}
export const BoleSection = memo(BoleSectionImpl)

/** #10 — Passive talent feature: your profile works 24/7 */
function PassiveTalentSectionImpl() {
  const { t } = useTranslation()
  return (
    <section className="py-14 px-6 bg-white dark:bg-midnight-800" aria-labelledby="passive-heading">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl ring-1 ring-midnight-100 dark:ring-midnight-700 bg-gradient-to-br from-[#fafbff] to-[#f0f4ff] dark:from-[#111827] dark:to-midnight-800 p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">{t('landing.passiveEyebrow')}</p>
            <h2 id="passive-heading" className="text-2xl font-bold tracking-tight text-navy-900 mb-3">
              {t('landing.passiveTitle')}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {t('landing.passiveLine1')}
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mt-2">
              {t('landing.passiveLine2')}
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {[
                t('landing.passivePoint1'),
                t('landing.passivePoint2'),
                t('landing.passivePoint3'),
                t('landing.passivePoint4'),
              ].map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <span className="text-gold-500 mt-0.5 flex-shrink-0" aria-hidden>✦</span>
                  {point}
                </li>
              ))}
            </ul>
            <Link
              to="/start/talent"
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-800 text-white text-sm font-semibold hover:bg-navy-700 transition-colors"
            >
              {t('landing.passiveJoinFree')} <Arrow />
            </Link>
          </div>
          {/* Visual: a sleeping diamond / passive indicator */}
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-midnight-100 flex items-center justify-center">
                <svg width="48" height="48" viewBox="0 0 44 44" fill="none" aria-hidden>
                  <polygon points="6,16 22,4 38,16" fill="#a6b6ff" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
                  <polygon points="6,16 38,16 22,40" fill="#0b1742" stroke="#0b1742" strokeWidth="0.9" strokeLinejoin="round" />
                  <polygon points="9,15 22,5 19,15" fill="#ffffff" opacity="0.55" />
                </svg>
              </div>
              {/* Pulse ring */}
              <span className="absolute inset-0 rounded-full border-2 border-midnight-500/40 animate-ping" aria-hidden />
            </div>
            <div className="text-sm text-gray-500 max-w-[180px] leading-relaxed">
              {t('landing.passiveScanCaption')}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
export const PassiveTalentSection = memo(PassiveTalentSectionImpl)

/** #6 + #19 — Social proof strip with live Supabase counters */
function SocialProofStripImpl() {
  const { t } = useTranslation()
  const { talentLabel, companyLabel } = usePlatformStats()

  const signals = [
    {
      stat: companyLabel ?? t('landing.proofCompaniesStatFallback'),
      label: companyLabel ? t('landing.proofCompaniesLabel') : t('landing.proofCompaniesLabelFallback'),
    },
    {
      stat: talentLabel ?? t('landing.proofTalentStatFallback'),
      label: talentLabel ? t('landing.proofTalentLabel') : t('landing.proofTalentLabelFallback'),
    },
    { stat: t('landing.proofPdpaStat'), label: t('landing.proofPdpaLabel') },
    { stat: t('landing.proofTimelineStat'), label: t('landing.proofTimelineLabel') },
  ]
  return (
    <div className="border-y border-gray-100 dark:border-gray-800 bg-[#fafbff] dark:bg-midnight-800 py-8 px-6">
      <ul className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6" aria-label={t('landing.proofAria')}>
        {signals.map((s) => (
          <li key={s.label} className="text-center">
            <div className="text-navy-800 dark:text-midnight-400 font-extrabold text-xl tracking-tight">{s.stat}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{s.label}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
export const SocialProofStrip = memo(SocialProofStripImpl)

/** #8 — Referral teaser */
function ReferralSectionImpl() {
  const { t } = useTranslation()
  return (
    <section className="py-12 px-6 bg-white dark:bg-midnight-800" aria-labelledby="referral-heading">
      <div className="max-w-4xl mx-auto">
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'linear-gradient(135deg,#fffaf1 0%,#fff7e6 100%)', border: '1px solid #e9c97a' }}
        >
          <p className="text-gold-800 tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">{t('landing.referEyebrow')}</p>
          <h2 id="referral-heading" className="text-xl font-bold text-navy-900 mb-2">
            {t('landing.referTitle')}
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            {t('landing.referBody')}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold-500 text-navy-900 text-sm font-bold hover:bg-[#b88c38] transition-colors"
            >
              {t('landing.referCta')} <Arrow />
            </Link>
            <Link
              to="/start/talent"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gold-500/60 text-gold-800 text-sm font-semibold hover:bg-gold-500/10 transition-colors"
            >
              {t('landing.referJoinFirst')}
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
export const ReferralSection = memo(ReferralSectionImpl)

/** #5 — WhatsApp CTA (Malaysia-first contact) */
function WhatsAppCTAImpl() {
  const { t } = useTranslation()
  const WHATSAPP_NUMBER = '601239449333'
  const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t('landing.whatsappPrefill'))}`
  return (
    <section className="py-14 px-6 bg-[#fafbff] dark:bg-midnight-800 border-t border-gray-100 dark:border-gray-800" aria-labelledby="contact-heading">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-gold-700 dark:text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2 uppercase">{t('landing.contactEyebrow')}</p>
        <h2 id="contact-heading" className="text-xl font-bold text-navy-900 dark:text-white mb-2">
          {t('landing.contactTitle')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6 leading-relaxed">
          {t('landing.contactBodyLead')}{' '}
          <a href="mailto:support@diamondandjeweler.com" className="text-navy-700 underline underline-offset-2">
            support@diamondandjeweler.com
          </a>
        </p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-6 py-3 rounded-xl font-semibold text-sm text-brand-navy transition-colors"
          style={{ background: '#25D366' }}
          aria-label={t('landing.whatsappAria')}
        >
          {/* WhatsApp icon */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M10 0C4.477 0 0 4.477 0 10c0 1.763.462 3.415 1.27 4.847L0 20l5.293-1.238A9.953 9.953 0 0010 20c5.523 0 10-4.477 10-10S15.523 0 10 0zm5.34 14.386c-.225.632-1.324 1.208-1.822 1.255-.497.046-1.013.233-3.396-.707-2.895-1.136-4.74-4.084-4.883-4.272-.144-.188-1.177-1.567-1.177-2.987 0-1.42.744-2.118 1.007-2.406.263-.288.576-.36.768-.36.192 0 .384.002.552.01.177.009.414-.067.648.494.24.576.816 1.99.888 2.135.072.145.12.315.024.503-.096.188-.144.303-.288.47-.144.166-.303.37-.432.498-.144.143-.294.3-.126.587.168.288.744 1.227 1.595 1.987 1.095.977 2.018 1.278 2.306 1.422.288.144.456.12.624-.072.168-.192.72-.84.912-1.128.192-.288.384-.24.648-.144.264.096 1.68.793 1.968.937.288.144.48.216.552.336.072.12.072.696-.153 1.328z"/>
          </svg>
          {t('landing.whatsappButton')}
        </a>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">{t('landing.whatsappHours')}</p>
      </div>
    </section>
  )
}
export const WhatsAppCTA = memo(WhatsAppCTAImpl)
