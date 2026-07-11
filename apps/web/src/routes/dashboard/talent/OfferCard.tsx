import { memo } from 'react'
import { fmt } from '../../../lib/format'
import { useTranslation } from 'react-i18next'
import { Button, Card, Badge } from '../../../components/ui'
import MatchExplain from '../../../components/MatchExplain'
import type { InterviewRound, InterviewProposal } from '../../../types/db'
import { TALENT_OUTCOME_KEYS, type MatchRow, type TalentFeedbackEntry } from './types'
import { isTalentOpen } from '../../../shared/domain/match/lifecycle'

function OfferCardImpl({
  m, rounds, pendingProposal, actionBusy,
  respond, onAcceptOffer, onDeclineOffer,
  onPickSlot, onDeclineProposal,
  feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  m: MatchRow
  rounds: InterviewRound[]
  pendingProposal: InterviewProposal | null
  actionBusy: string | null
  respond: (id: string, next: 'accepted_by_talent' | 'declined_by_talent') => void
  onAcceptOffer: () => void
  onDeclineOffer: () => void
  onPickSlot: (slot: 1 | 2 | 3) => void
  onDeclineProposal: () => void
  feedbackEntry: TalentFeedbackEntry
  onFeedbackChange: (patch: Partial<{ rating: number; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const { t } = useTranslation()
  const pct = Math.round(m.compatibility_score ?? 0)
  const busy = (suffix: string) => actionBusy === `${m.id}:${suffix}`

  return (
    <Card hoverable className="animate-slide-up">
      <div className="p-6">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h3 className="font-display text-xl text-fg mb-0.5">{m.roles?.title ?? t('talentDash.roleFallback')}</h3>
            <div className="text-xs text-fg-muted flex gap-2 flex-wrap">
              {m.roles?.location && <span>{m.roles.location}</span>}
              {m.roles?.work_arrangement && (<><span>·</span><span className="capitalize">{m.roles.work_arrangement}</span></>)}
            </div>
          </div>
          <CompatibilityRing pct={pct} />
        </div>

        {(m.roles?.salary_min || m.roles?.salary_max) && (
          <div className="mb-3 text-sm text-ink-700 dark:text-fg-strong">
            <span className="font-medium">RM {fmt(m.roles?.salary_min)} – {fmt(m.roles?.salary_max)}</span>
            <span className="text-ink-400 dark:text-fg-muted"> {t('talentDash.perMonth')}</span>
          </div>
        )}

        {m.roles?.description && (
          <p className="text-sm text-ink-600 dark:text-fg-strong line-clamp-3 mb-4">{m.roles.description}</p>
        )}

        {m.application_summary && (
          <div className="mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">{t('talentDash.yourPitch')}</p>
            <p className="text-sm text-ink-800 dark:text-fg-strong leading-relaxed whitespace-pre-line">{m.application_summary}</p>
          </div>
        )}

        <StatusPill status={m.status} />

        {m.roles?.employment_type && m.roles.employment_type !== 'full_time' && (
          <div className="mt-2">
            <Badge tone="accent">{m.roles.employment_type}</Badge>
            {m.roles.hourly_rate != null && (<span className="ml-2 text-xs text-fg-muted">RM {Number(m.roles.hourly_rate).toFixed(2)}/hr</span>)}
            {m.roles.duration_days != null && (<span className="ml-2 text-xs text-fg-muted">{m.roles.duration_days}d</span>)}
          </div>
        )}

        <MatchExplain reasoning={m.public_reasoning} />

        {/* Pending interview proposal — pick one of 3 slots */}
        {pendingProposal && (
          <div className="mt-4 border-2 border-brand-300 rounded-lg overflow-hidden bg-brand-50/60">
            <div className="bg-brand-100 px-3 py-2 text-xs font-semibold text-brand-900 uppercase tracking-wide">
              {t('talentDash.proposalHeading')}
            </div>
            <div className="p-3 space-y-2">
              {([1, 2, 3] as const).map((slot) => {
                const at = slot === 1 ? pendingProposal.slot_1_at : slot === 2 ? pendingProposal.slot_2_at : pendingProposal.slot_3_at
                const busy = actionBusy === `${m.id}:accept_interview_slot:${slot}`
                return (
                  <div key={slot} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand-100 bg-surface px-3 py-2">
                    <div className="text-sm text-fg">
                      <span className="text-xs text-ink-400 dark:text-fg-muted mr-2">{t('talentDash.slotLabel', { n: slot })}</span>
                      {new Date(at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} {t('talentDash.myt')}
                    </div>
                    <Button
                      size="sm"
                      loading={busy}
                      disabled={actionBusy !== null}
                      onClick={() => onPickSlot(slot)}
                    >
                      {t('talentDash.pickThisTime')}
                    </Button>
                  </div>
                )
              })}
              <Button
                size="sm"
                variant="secondary"
                loading={actionBusy === `${m.id}:decline_interview_proposal`}
                disabled={actionBusy !== null}
                onClick={onDeclineProposal}
              >
                {t('talentDash.proposalNoneWork')}
              </Button>
            </div>
          </div>
        )}

        {/* Interview rounds panel — visible once scheduling begins */}
        {rounds.length > 0 && (
          <div className="mt-4 border border-border rounded-lg overflow-hidden">
            <div className="bg-ink-50 dark:bg-surface px-3 py-2 text-xs font-semibold text-ink-600 dark:text-fg-strong uppercase tracking-wide">
              {t('talentDash.yourInterviews')}
            </div>
            {rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-y-1 px-3 py-2 border-t border-border first:border-t-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-fg">{t('talentDash.roundLabel', { n: r.round_number })}</span>
                  <span className="text-xs text-ink-400 dark:text-fg-muted ml-2">
                    {new Date(r.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} {t('talentDash.myt')}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoundBadge status={r.status} />
                  {r.status === 'scheduled' && (
                    <a
                      href={r.interview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-2.5 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-700 font-medium whitespace-nowrap"
                    >
                      {t('talentDash.joinVideoCall')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Offer panel */}
        {m.status === 'offer_made' && (
          <div className="mt-4 border border-emerald-200 rounded-lg p-4 bg-emerald-50">
            <p className="text-sm font-semibold text-emerald-900 mb-1">{t('talentDash.offerReceivedTitle')}</p>
            <p className="text-xs text-emerald-700 mb-3">
              {t('talentDash.offerCongratsLead')} <strong>{m.roles?.title ?? t('talentDash.roleFallback')}</strong>.{' '}
              {t('talentDash.offerCongratsTail')}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('accept_offer')}
                disabled={actionBusy !== null}
                onClick={onAcceptOffer}
              >
                {t('talentDash.acceptOffer')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('decline_offer')}
                disabled={actionBusy !== null}
                onClick={onDeclineOffer}
              >
                {t('talentDash.decline')}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {/* Stage 1: new offers — accept/decline */}
          {isTalentOpen(m.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => respond(m.id, 'accepted_by_talent')} disabled={actionBusy !== null} loading={actionBusy === `${m.id}:accepted_by_talent`} size="sm">{t('talentDash.accept')}</Button>
              <Button onClick={() => respond(m.id, 'declined_by_talent')} disabled={actionBusy !== null} loading={actionBusy === `${m.id}:declined_by_talent`} size="sm" variant="secondary">{t('talentDash.decline')}</Button>
            </div>
          )}

          {/* Feedback widget */}
          {['interview_completed', 'offer_made', 'hired'].includes(m.status) && (
            <div className="border border-border rounded-lg p-3 space-y-2 bg-ink-50 dark:bg-surface">
              <p className="text-xs font-semibold text-ink-700 dark:text-fg-strong uppercase tracking-wide">{t('talentDash.rateOpportunity')}</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => onFeedbackChange({ rating: star })}
                    className={`text-xl leading-none transition-colors ${feedbackEntry.rating >= star ? 'text-amber-400' : 'text-ink-200 dark:text-fg-subtle hover:text-amber-300'}`}
                    aria-label={t('talentDash.starAria', { n: star })}
                  >
                    ★
                  </button>
                ))}
                {feedbackEntry.rating > 0 && (
                  <span className="ml-2 text-xs text-fg-muted">
                    {['', t('talentDash.ratePoor'), t('talentDash.rateBelowAverage'), t('talentDash.rateAverage'), t('talentDash.rateGood'), t('talentDash.rateExcellent')][feedbackEntry.rating]}
                  </span>
                )}
              </div>
              <select
                value={feedbackEntry.outcome}
                onChange={(e) => onFeedbackChange({ outcome: e.target.value })}
                className="w-full border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-surface dark:text-fg-strong"
              >
                {TALENT_OUTCOME_KEYS.map((o) => <option key={o.value} value={o.value}>{o.emoji}{t(o.tKey)}</option>)}
              </select>
              <textarea
                value={feedbackEntry.freeText}
                onChange={(e) => onFeedbackChange({ freeText: e.target.value })}
                placeholder={t('talentDash.feedbackPlaceholder')}
                rows={2}
                className="w-full border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-surface dark:text-fg-strong dark:placeholder-fg-subtle resize-none"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">
                  {feedbackEntry.pointsAwarded
                    ? t('talentDash.feedbackSavedPoints', { points: feedbackEntry.pointsAwarded })
                    : t('talentDash.feedbackSaved')}
                </p>
              ) : (
                <Button
                  size="sm"
                  onClick={onFeedbackSubmit}
                  disabled={feedbackEntry.rating === 0 || feedbackEntry.saving}
                  loading={feedbackEntry.saving}
                >
                  {t('talentDash.saveFeedback')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

export const OfferCard = memo(OfferCardImpl)

function RoundBadge({ status }: { status: InterviewRound['status'] }) {
  const { t } = useTranslation()
  const m = {
    scheduled: { label: t('talentDash.roundUpcoming'),  tone: 'brand' as const },
    completed: { label: t('talentDash.roundDone'),      tone: 'green' as const },
    cancelled: { label: t('talentDash.roundCancelled'), tone: 'gray' as const },
    no_show:   { label: t('talentDash.roundNoShow'),    tone: 'amber' as const },
  }
  const { label, tone } = m[status] ?? { label: status, tone: 'gray' as const }
  return <Badge tone={tone}>{label}</Badge>
}

function CompatibilityRing({ pct }: { pct: number }) {
  const { t } = useTranslation()
  const radius = 20
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ
  const tone = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-accent-700' : 'text-ink-400'
  return (
    <div className="relative shrink-0" aria-label={t('talentDash.compatibilityAria', { pct })}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} stroke="currentColor" className="text-ink-100 dark:text-border-strong" strokeWidth="4" fill="none" />
        <circle
          cx="26" cy="26" r={radius}
          stroke="currentColor"
          className={tone}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-display font-semibold">{pct}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation()
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' | 'red' }> = {
    generated:            { label: t('talentDash.statusNewMatch'),         tone: 'brand' },
    viewed:               { label: t('talentDash.statusViewed'),           tone: 'gray' },
    accepted_by_talent:   { label: t('talentDash.statusYouAccepted'),      tone: 'green' },
    invited_by_manager:   { label: t('talentDash.statusManagerInvited'),   tone: 'brand' },
    hr_scheduling:        { label: t('talentDash.statusHrScheduling'),     tone: 'amber' },
    interview_scheduled:  { label: t('talentDash.statusInterviewScheduled'), tone: 'green' },
    interview_completed:  { label: t('talentDash.statusInterviewComplete'), tone: 'brand' },
    offer_made:           { label: t('talentDash.statusOfferReceived'),    tone: 'green' },
    hired:                { label: t('talentDash.statusHired'),            tone: 'green' },
    cancelled:            { label: t('talentDash.statusCancelled'),        tone: 'gray' },
    no_show:              { label: t('talentDash.statusNoShow'),           tone: 'red' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}
