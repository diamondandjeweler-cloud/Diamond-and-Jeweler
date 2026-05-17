import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from './ui'
import type { PublicReasoning } from '../types/db'

const BEHAVIORAL_LABELS: Record<string, string> = {
  ownership:             'Accountability',
  communication_clarity: 'Communication',
  emotional_maturity:    'Emotional maturity',
  problem_solving:       'Problem solving',
  resilience:            'Resilience',
  results_orientation:   'Results focus',
  professional_attitude: 'Professional attitude',
  confidence:            'Confidence',
  coachability:          'Coachability',
}

/**
 * Renders the user-facing explanation for a match. Defensive against missing
 * data — when reasoning is null we render nothing instead of an error block.
 *
 * Sections (all gated on data availability):
 *  • Golden Rule alert — prominent banner when 4+/8 dimensions are uncertain
 *  • Strengths (green) / Watchouts (amber) — grid
 *  • Behavioral interview scores — mini bar chart
 *  • Matched / missing traits
 */
export default function MatchExplain({ reasoning }: { reasoning: PublicReasoning | null | undefined }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!reasoning) return null

  // Separate the Golden Rule watchout so it renders as a dedicated banner.
  const goldenRule = (reasoning.watchouts ?? []).find(
    (w) => w.includes('Platform signals') && w.includes('evaluation dimensions'),
  )
  const regularWatchouts = (reasoning.watchouts ?? []).filter(
    (w) => !(w.includes('Platform signals') && w.includes('evaluation dimensions')),
  )

  const scoreBand = reasoning.score_band
  const tone = scoreBand === 'strong' ? 'green' : scoreBand === 'good' ? 'brand' : 'amber'

  const behavioralPairs = Object.entries(reasoning.behavioral_tags ?? {})
    .filter(([k, v]) => v != null && BEHAVIORAL_LABELS[k])
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0)) as [string, number][]

  return (
    <div className="mt-3 border-t border-ink-100 pt-3 text-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left text-ink-700 hover:text-ink-900"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {scoreBand && <Badge tone={tone}>{t(`match.scoreBand.${scoreBand}`)}</Badge>}
          <span className="text-xs text-ink-500">Why?</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-xs">

          {/* Golden Rule alert — shown above everything else when triggered */}
          {goldenRule && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 text-base leading-none mt-0.5">⚠</span>
                <div>
                  <p className="font-semibold mb-0.5">Structured Interview Recommended</p>
                  <p className="text-amber-800 leading-snug">{goldenRule}</p>
                </div>
              </div>
            </div>
          )}

          {/* Strengths + Watchouts grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(reasoning.strengths ?? []).length > 0 && (
              <div>
                <div className="font-semibold text-emerald-700 uppercase tracking-wide text-[11px] mb-1">{t('match.strengths')}</div>
                <ul className="space-y-1 text-ink-700">
                  {(reasoning.strengths ?? []).map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-emerald-500 mt-0.5 shrink-0">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {regularWatchouts.length > 0 && (
              <div>
                <div className="font-semibold text-amber-700 uppercase tracking-wide text-[11px] mb-1">{t('match.watchouts')}</div>
                <ul className="space-y-1 text-ink-700">
                  {regularWatchouts.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5 shrink-0">!</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Behavioral interview scores */}
          {behavioralPairs.length > 0 && (
            <div>
              <div className="font-semibold text-ink-500 uppercase tracking-wide text-[11px] mb-2">Interview scores</div>
              <div className="space-y-1.5">
                {behavioralPairs.map(([key, score]) => {
                  const pct = Math.round(score * 100)
                  const barTone = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-32 text-ink-600 shrink-0">{BEHAVIORAL_LABELS[key]}</span>
                      <div className="flex-1 h-1.5 bg-ink-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`w-8 text-right font-medium ${pct >= 70 ? 'text-emerald-700' : pct >= 40 ? 'text-amber-700' : 'text-red-600'}`}>
                        {pct}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Matched / missing traits */}
          {(reasoning.matched_traits ?? []).length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">{t('match.matchedTraits')}</div>
              <div className="flex flex-wrap gap-1">
                {(reasoning.matched_traits ?? []).map((tr) => <Badge key={tr} tone="green">{tr.replace(/_/g, ' ')}</Badge>)}
              </div>
            </div>
          )}
          {(reasoning.missing_traits ?? []).length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">{t('match.missingTraits')}</div>
              <div className="flex flex-wrap gap-1">
                {(reasoning.missing_traits ?? []).map((tr) => <Badge key={tr} tone="amber">{tr.replace(/_/g, ' ')}</Badge>)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
