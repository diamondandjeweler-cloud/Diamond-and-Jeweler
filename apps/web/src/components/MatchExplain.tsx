import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from './ui'
import type { PublicReasoning } from '../types/db'

/**
 * Renders the user-facing explanation for a match. Defensive against missing
 * data — when reasoning is null we render nothing instead of an error block.
 */
export default function MatchExplain({ reasoning }: { reasoning: PublicReasoning | null | undefined }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!reasoning) return null
  const tone = reasoning.score_band === 'strong' ? 'green' : reasoning.score_band === 'good' ? 'brand' : 'amber'
  return (
    <div className="mt-3 border-t border-ink-100 pt-3 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left text-ink-700 hover:text-ink-900"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Badge tone={tone}>{t(`match.scoreBand.${reasoning.score_band}`)}</Badge>
          <span className="text-xs text-ink-500">Why?</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {reasoning.strengths.length > 0 && (
            <div>
              <div className="font-semibold text-emerald-700 uppercase tracking-wide text-[11px] mb-1">{t('match.strengths')}</div>
              <ul className="space-y-1 text-ink-700">
                {reasoning.strengths.map((s, i) => <li key={i} className="flex items-start gap-1.5"><span className="text-emerald-500 mt-0.5">✓</span> {s}</li>)}
              </ul>
            </div>
          )}
          {reasoning.watchouts.length > 0 && (
            <div>
              <div className="font-semibold text-amber-700 uppercase tracking-wide text-[11px] mb-1">{t('match.watchouts')}</div>
              <ul className="space-y-1 text-ink-700">
                {reasoning.watchouts.map((w, i) => <li key={i} className="flex items-start gap-1.5"><span className="text-amber-500 mt-0.5">!</span> {w}</li>)}
              </ul>
            </div>
          )}
          {reasoning.matched_traits.length > 0 && (
            <div className="md:col-span-2">
              <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">{t('match.matchedTraits')}</div>
              <div className="flex flex-wrap gap-1">
                {reasoning.matched_traits.map((tr) => <Badge key={tr} tone="green">{tr}</Badge>)}
              </div>
            </div>
          )}
          {reasoning.missing_traits.length > 0 && (
            <div className="md:col-span-2">
              <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">{t('match.missingTraits')}</div>
              <div className="flex flex-wrap gap-1">
                {reasoning.missing_traits.map((tr) => <Badge key={tr} tone="amber">{tr}</Badge>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
