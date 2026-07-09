import { memo } from 'react'
import { fmt } from '../../../lib/format'
import { useTranslation } from 'react-i18next'
import MatchExplain from '../../../components/MatchExplain'
import ScreeningChecklist from '../../../components/ScreeningChecklist'
import { Button, Card, Badge } from '../../../components/ui'
import type { CultureComparison, InterviewRound, InterviewProposal } from '../../../types/db'
import { hmOutcomes } from './types'
import type { CandidateRow, ProfilePreview, ContactInfo, FeedbackEntry } from './types'
import { needsHmAction } from '../../../shared/domain/match/lifecycle'

function CandidateCardImpl({
  row, rounds, pendingProposal, preview, contact, actionBusy, schedulingFor,
  companyVerified, companyId,
  onInvite, onDecline,
  onScheduleRound, onCancelProposal, onCompleteInterviews, onMakeOffer, onMarkHired, onCancel, onRevealContact,
  onViewResume,
  feedbackEntry, onFeedbackChange, onFeedbackSubmit,
}: {
  row: CandidateRow
  rounds: InterviewRound[]
  pendingProposal: InterviewProposal | null
  preview: ProfilePreview | null
  contact: ContactInfo | null | undefined
  actionBusy: string | null
  schedulingFor: string | null
  companyVerified: boolean | null
  companyId: string | null
  onInvite: () => void
  onDecline: () => void
  onScheduleRound: () => void
  onCancelProposal: (proposalId: string) => void
  onCompleteInterviews: () => void
  onMakeOffer: () => void
  onMarkHired: () => void
  onCancel: () => void
  onRevealContact: () => void
  onViewResume: () => void
  feedbackEntry: FeedbackEntry
  onFeedbackChange: (patch: Partial<{ rating: number; hired: boolean; notes: string; outcome: string; freeText: string }>) => void
  onFeedbackSubmit: () => void
}) {
  const { t } = useTranslation()
  // Company gate: invites + scheduling + offers + résumé reveal all require a
  // verified company (companies.verified=true). Treat null as "still loading"
  // so we don't briefly flash buttons as disabled.
  const companyLocked = companyVerified === false
  const lockTitle = companyLocked
    ? t('hmDash.cardLockTitle')
    : undefined
  const verifyHref = companyId ? `/onboarding/company/verify?company=${companyId}` : null
  // Real name + photo when the talent has opted into public (or whitelist-matched) visibility;
  // otherwise fall back to the anonymized handle. The preview RPC enforces the policy server-side.
  const realName = preview?.display_name ?? null
  const photoUrl = preview?.photo_url ?? null
  const displayName = realName
    ?? (row.talents?.privacy_mode === 'anonymous'
      ? t('hmDash.anonymousCandidate')
      : t('hmDash.candidate'))

  const topTags = Object.entries(row.talents?.derived_tags ?? {})
    .filter(([tag, score]) => !/^\d+$/.test(tag) && typeof score === 'number' && !isNaN(score) && score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const pct = Math.round(row.compatibility_score ?? 0)
  const tone = pct >= 75 ? 'green' : pct >= 50 ? 'amber' : 'gray'
  const busy = (suffix: string) => actionBusy === `${row.id}:${suffix}`

  const isUrgent = row.is_urgent === true

  return (
    <Card hoverable className={`animate-slide-up ${isUrgent ? 'ring-2 ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.15)]' : ''}`}>
      <div className="p-6">
        {isUrgent && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
            {t('hmDash.urgentMatchBadge')}
          </div>
        )}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                loading="lazy"
                decoding="async"
                className="w-14 h-14 rounded-full object-cover border border-ink-100 dark:border-gray-700 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-ink-100 dark:bg-gray-700 text-ink-400 dark:text-gray-400 flex items-center justify-center text-base font-medium shrink-0">
                {(realName ?? '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="font-display text-lg text-ink-900 dark:text-white mb-0.5 truncate">{displayName}</h3>
              <p className="text-sm text-ink-500 dark:text-gray-400">{t('hmDash.forRole', { role: row.roles?.title ?? t('hmDash.roleFallback') })}</p>
            </div>
          </div>
          <Badge tone={tone}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4" /></svg>
            {t('hmDash.pctMatch', { pct })}
          </Badge>
        </div>

        {/* Résumé reveal — promoted to the top of the card so HMs find it
            without scrolling past the long match-reasoning blocks below. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Button
            onClick={onViewResume}
            size="sm"
            loading={actionBusy === `${row.id}:resume`}
            disabled={actionBusy !== null || companyLocked}
            title={companyLocked ? lockTitle : undefined}
          >
            {t('hmDash.viewResume')}
          </Button>
          {companyLocked && verifyHref && (
            <a href={verifyHref} target="_blank" rel="noreferrer" className="text-xs text-amber-700 underline">
              {t('hmDash.lockedVerifyFirst')}
            </a>
          )}
        </div>

        <div className="bg-ink-50 dark:bg-gray-700 rounded-lg p-3 mb-4 text-sm">
          <div className="text-xs text-ink-500 dark:text-gray-400 uppercase tracking-wide mb-0.5">{t('hmDash.expects')}</div>
          <div className="text-ink-900 dark:text-white font-medium">
            RM {fmt(row.talents?.expected_salary_min)} – {fmt(row.talents?.expected_salary_max)}
            <span className="text-ink-400 dark:text-gray-400 font-normal"> {t('hmDash.perMonth')}</span>
          </div>
        </div>

        {topTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {topTags.map(([tag, score]) => (
              <span key={tag} className="text-xs bg-ink-100 dark:bg-gray-700 text-ink-700 dark:text-gray-300 px-2 py-1 rounded-md">
                <span className="font-medium">{tag.replace(/_/g, ' ')}</span>
                <span className="text-ink-400 dark:text-gray-400 ml-1">{Math.round(score * 100)}</span>
              </span>
            ))}
          </div>
        )}

        <StatusNote status={row.status} />

        {row.application_summary && (
          <div className="mt-3 mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">{t('hmDash.whyHire')}</p>
            <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">{row.application_summary}</p>
          </div>
        )}

        <MatchExplain reasoning={row.public_reasoning} />
        {row.public_reasoning?.culture_comparison && (
          <CultureCompare comparison={row.public_reasoning.culture_comparison} />
        )}
        <ScreeningChecklist
          reasoning={row.public_reasoning}
          salaryMin={row.talents?.expected_salary_min ?? null}
          salaryMax={row.talents?.expected_salary_max ?? null}
        />

        {/* Pending interview proposal — awaiting talent to pick a slot */}
        {pendingProposal && (
          <div className="mt-4 border border-amber-200 rounded-lg overflow-hidden bg-amber-50/40">
            <div className="bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 uppercase tracking-wide flex items-center justify-between gap-2">
              <span>{t('hmDash.awaitingConfirmation', { round: pendingProposal.round_number })}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={actionBusy !== null}
                loading={actionBusy === `${row.id}:cancel_interview_proposal`}
                onClick={() => onCancelProposal(pendingProposal.id)}
              >
                {t('hmDash.withdraw')}
              </Button>
            </div>
            <ul className="px-3 py-2 text-xs text-ink-700 dark:text-gray-300 space-y-1">
              {[pendingProposal.slot_1_at, pendingProposal.slot_2_at, pendingProposal.slot_3_at].map((at, i) => (
                <li key={i}>
                  <span className="text-ink-400 dark:text-gray-400 mr-2">{t('hmDash.slot', { n: i + 1 })}</span>
                  {new Date(at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} MYT
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interview rounds panel */}
        {rounds.length > 0 && (
          <div className="mt-4 border border-ink-100 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-ink-50 dark:bg-gray-700 px-3 py-2 text-xs font-semibold text-ink-600 dark:text-gray-300 uppercase tracking-wide">
              {t('hmDash.interviewRounds')}
            </div>
            {rounds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-y-1 px-3 py-2 border-t border-ink-100 dark:border-gray-700 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-ink-900 dark:text-white">{t('hmDash.round', { n: r.round_number })}</span>
                  <span className="text-xs text-ink-400 dark:text-gray-400 ml-2">
                    {new Date(r.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })} MYT
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RoundBadge status={r.status} />
                  {r.status === 'scheduled' && (
                    <a
                      href={r.interview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-700 underline"
                    >
                      {t('hmDash.join')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contact reveal — available once offer is made */}
        {['offer_made', 'hired'].includes(row.status) && (
          <div className="mt-4 border border-emerald-200 rounded-lg p-3 bg-emerald-50">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-2">{t('hmDash.contactDetails')}</p>
            {contact === undefined ? (
              <Button
                size="sm"
                onClick={onRevealContact}
                disabled={companyLocked}
                title={companyLocked ? lockTitle : undefined}
              >
                {t('hmDash.revealContact')}
              </Button>
            ) : contact === null ? (
              <p className="text-xs text-red-600">{t('hmDash.contactLoadFailed')}</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-ink-900 dark:text-white">{contact.full_name}</p>
                <p className="text-ink-700 dark:text-gray-300">{contact.email}</p>
                {contact.phone && <p className="text-ink-700 dark:text-gray-300">{contact.phone}</p>}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {/* Stage 1: new candidates */}
          {needsHmAction(row.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={onInvite}
                size="sm"
                loading={actionBusy === `${row.id}:invite`}
                disabled={actionBusy !== null || companyLocked}
                title={companyLocked ? lockTitle : undefined}
              >
                {t('hmDash.inviteToInterview')}
              </Button>
              <Button
                onClick={onDecline}
                size="sm"
                variant="secondary"
                loading={actionBusy === `${row.id}:decline`}
                disabled={actionBusy !== null}
              >
                {t('hmDash.decline')}
              </Button>
            </div>
          )}

          {/* Stage 2: invited / scheduling */}
          {['invited_by_manager', 'hr_scheduling', 'interview_scheduled'].includes(row.status) && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={onScheduleRound}
                disabled={schedulingFor === row.id || actionBusy !== null || !!pendingProposal || companyLocked}
                title={companyLocked ? lockTitle : (pendingProposal ? t('hmDash.withdrawFirstHint') : undefined)}
              >
                {rounds.length === 0 ? t('hmDash.proposeInterviewTimes') : t('hmDash.proposeNextRound')}
              </Button>
              {row.status === 'interview_scheduled' && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy('complete_interviews')}
                  disabled={actionBusy !== null}
                  onClick={onCompleteInterviews}
                >
                  {t('hmDash.markAllDone')}
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                {t('hmDash.cancel')}
              </Button>
            </div>
          )}

          {/* Stage 3: interview done */}
          {row.status === 'interview_completed' && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('make_offer')}
                disabled={actionBusy !== null || companyLocked}
                title={companyLocked ? lockTitle : undefined}
                onClick={onMakeOffer}
              >
                {t('hmDash.makeOffer')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                {t('hmDash.declineCandidate')}
              </Button>
            </div>
          )}

          {/* Stage 4: offer out */}
          {row.status === 'offer_made' && (
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                loading={busy('mark_hired')}
                disabled={actionBusy !== null || companyLocked}
                title={companyLocked ? lockTitle : undefined}
                onClick={onMarkHired}
              >
                {t('hmDash.confirmHired')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={busy('cancel_match')}
                disabled={actionBusy !== null}
                onClick={onCancel}
              >
                {t('hmDash.cancelOffer')}
              </Button>
            </div>
          )}

          {/* Feedback widget */}
          {['interview_completed', 'offer_made', 'hired', 'declined_by_manager', 'declined_by_talent'].includes(row.status) && (
            <div className="border border-ink-200 dark:border-gray-700 rounded-lg p-3 space-y-2 bg-ink-50 dark:bg-gray-700">
              <p className="text-xs font-semibold text-ink-700 dark:text-gray-300 uppercase tracking-wide">
                {t('hmDash.rateThisMatch')}
              </p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => onFeedbackChange({ rating: star })}
                    className={`text-xl leading-none transition-colors ${feedbackEntry.rating >= star ? 'text-amber-400' : 'text-ink-200 dark:text-gray-600 hover:text-amber-300'}`}
                    aria-label={t('hmDash.starAria', { count: star })}
                  >
                    ★
                  </button>
                ))}
                {feedbackEntry.rating > 0 && (
                  <span className="ml-2 text-xs text-ink-500 dark:text-gray-400">
                    {['', t('hmDash.ratingPoor'), t('hmDash.ratingBelowAverage'), t('hmDash.ratingAverage'), t('hmDash.ratingGood'), t('hmDash.ratingExcellent')][feedbackEntry.rating]}
                  </span>
                )}
              </div>
              <select
                value={feedbackEntry.outcome}
                onChange={(e) => onFeedbackChange({ outcome: e.target.value })}
                className="w-full border border-ink-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-800 dark:text-white"
              >
                {hmOutcomes(t).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <textarea
                value={feedbackEntry.freeText}
                onChange={(e) => onFeedbackChange({ freeText: e.target.value })}
                placeholder={t('hmDash.feedbackPlaceholder')}
                rows={2}
                className="w-full border border-ink-200 dark:border-gray-700 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white dark:bg-gray-800 dark:text-white resize-none"
              />
              {feedbackEntry.saved ? (
                <p className="text-xs text-emerald-600 font-medium">
                  {feedbackEntry.pointsAwarded ? t('hmDash.feedbackSavedPoints', { points: feedbackEntry.pointsAwarded }) : t('hmDash.feedbackSavedHelps')}
                </p>
              ) : (
                <Button
                  size="sm"
                  onClick={onFeedbackSubmit}
                  disabled={feedbackEntry.rating === 0 || feedbackEntry.saving}
                  loading={feedbackEntry.saving}
                >
                  {t('hmDash.saveFeedback')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

const CandidateCard = memo(CandidateCardImpl)
export default CandidateCard

function RoundBadge({ status }: { status: InterviewRound['status'] }) {
  const { t } = useTranslation()
  const m = {
    scheduled:  { label: t('hmDash.roundScheduled'), tone: 'brand' as const },
    completed:  { label: t('hmDash.roundDone'),      tone: 'green' as const },
    cancelled:  { label: t('hmDash.roundCancelled'), tone: 'gray' as const },
    no_show:    { label: t('hmDash.roundNoShow'),    tone: 'amber' as const },
  }
  const { label, tone } = m[status] ?? { label: status, tone: 'gray' as const }
  return <Badge tone={tone}>{label}</Badge>
}

function StatusNote({ status }: { status: string }) {
  const { t } = useTranslation()
  const m: Record<string, { label: string; tone: 'gray' | 'brand' | 'green' | 'amber' | 'red' }> = {
    generated:            { label: t('hmDash.statusGenerated'),           tone: 'brand' },
    viewed:               { label: t('hmDash.statusViewed'),              tone: 'gray' },
    accepted_by_talent:   { label: t('hmDash.statusAcceptedByTalent'),    tone: 'green' },
    invited_by_manager:   { label: t('hmDash.statusInvited'),             tone: 'brand' },
    hr_scheduling:        { label: t('hmDash.statusHrScheduling'),        tone: 'amber' },
    interview_scheduled:  { label: t('hmDash.statusInterviewScheduled'),  tone: 'brand' },
    interview_completed:  { label: t('hmDash.statusInterviewCompleted'),  tone: 'amber' },
    offer_made:           { label: t('hmDash.statusOfferMade'),           tone: 'amber' },
    hired:                { label: t('hmDash.statusHired'),               tone: 'green' },
    cancelled:            { label: t('hmDash.statusCancelled'),           tone: 'gray' },
    no_show:              { label: t('hmDash.statusNoShow'),              tone: 'red' },
  }
  const entry = m[status] ?? { label: status.replace(/_/g, ' '), tone: 'gray' as const }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

function CultureCompare({ comparison }: { comparison: CultureComparison }) {
  const { t } = useTranslation()
  if (comparison.talent_top_wants.length === 0 && comparison.hm_top_offers.length === 0) return null
  return (
    <div className="mt-3 border border-ink-100 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-gray-400 mb-2">{t('hmDash.cultureAlignment')}</p>
      <div className="flex flex-wrap gap-1.5">
        {comparison.overlap.map((k) => (
          <span key={k} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
            ✓ {comparison.labels[k] ?? k.replace('wants_', '')}
          </span>
        ))}
        {comparison.talent_only.map((k) => (
          <span key={k} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
            ~ {comparison.labels[k] ?? k.replace('wants_', '')}
          </span>
        ))}
      </div>
      {(comparison.overlap.length > 0 || comparison.talent_only.length > 0) && (
        <p className="text-xs text-ink-400 dark:text-gray-400 mt-1.5">
          {comparison.overlap.length > 0 && <span className="mr-3">{t('hmDash.cultureAligned')}</span>}
          {comparison.talent_only.length > 0 && <span>{t('hmDash.cultureTalentWants')}</span>}
        </p>
      )}
    </div>
  )
}
