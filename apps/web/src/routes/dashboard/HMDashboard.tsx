import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { fmt } from '../../lib/format'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { useSeo } from '../../lib/useSeo'
import { getDisplayName } from '../../shared/domain/identity/displayName'
import Skeleton, { SkeletonCard } from '../../components/Skeleton'
import { Button, Card, Badge, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import AddHmDobModal from '../../components/AddHmDobModal'
import { useHmDashboardData } from './hm/useHmDashboardData'
import CandidateCard from './hm/CandidateCard'
import EmployerReputationPanel from './hm/EmployerReputationPanel'
import type { FeedbackEntry } from './hm/types'

// Pristine feedback-entry default — the constant parts shared by the per-card
// fallback (which overlays the row's saved match_feedback) and the
// onFeedbackChange seed. Module-level so it's a single stable reference.
const DEFAULT_FEEDBACK_ENTRY: FeedbackEntry = {
  rating: 0, hired: false, notes: '', outcome: '', freeText: '', saving: false, saved: false,
}

export default function HMDashboard() {
  const { t } = useTranslation()
  useSeo({ title: t('hmDash.seoTitle'), noindex: true })
  const { session, profile } = useSession(useShallow((s) => ({ session: s.session, profile: s.profile })))
  const userId = session?.user.id

  const {
    URGENT_COST,
    POINTS_PER_EXTRA,
    roleCount,
    candidates,
    oldestRoleOver24h,
    waiting,
    err,
    roleExtras,
    unlockingRoleId,
    redeemingRoleId,
    unlockMsg,
    urgentRoleId,
    urgentBusy,
    urgentMsg,
    pointsBalance,
    feedbackState,
    setFeedbackState,
    hmReputation,
    companyVerified,
    companyId,
    linkRequest,
    linkBusy,
    hmId,
    hmHasDob,
    setHmHasDob,
    showAddDobModal,
    setShowAddDobModal,
    onboardingDraftRole,
    roundsByMatch,
    proposalsByMatch,
    previewByMatch,
    contactByMatch,
    schedulingFor,
    setSchedulingFor,
    scheduleSlots,
    setScheduleSlots,
    actionBusy,
    respondMsg,
    candidatesCount,
    actionNeeded,
    roleCountForStat,
    hiredAllTimeForStat,
    handleUrgentSearch,
    handleUnlockExtra,
    handleRedeemExtra,
    viewResume,
    respond,
    doAction,
    revealContact,
    submitFeedback,
    respondToLinkRequest,
  } = useHmDashboardData(userId)

  // Roles eligible for an extra-match unlock (>=3 active candidates, <3 extras
  // used). Derived once per roleExtras change rather than re-filtering the array
  // twice on every render. `eligibleExtras.length > 0` is identical to the prior
  // `.some(...)` guard since both use the same predicate.
  const eligibleExtras = useMemo(
    () => roleExtras.filter((r) => r.activeCount >= 3 && r.extraUsed < 3),
    [roleExtras],
  )

  return (
    <div>
      {/* Pending company link request banner */}
      {linkRequest && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              {t('hmDash.linkRequestTitle', { company: linkRequest.companyName })}
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              {t('hmDash.linkRequestBody')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={linkBusy} loading={linkBusy} onClick={() => void respondToLinkRequest('accept')}>
              {t('hmDash.accept')}
            </Button>
            <Button size="sm" variant="secondary" disabled={linkBusy} onClick={() => void respondToLinkRequest('decline')}>
              {t('hmDash.decline')}
            </Button>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow={profile && t('dashboard.hmGreeting', { name: getDisplayName(profile) })}
        title={t('hmDash.pageTitle')}
        description={t('hmDash.pageDescription')}
        actions={
          <>
            <Link to="/hm/org-chart" className="btn-secondary">{t('hmDash.orgChartConsultant')}</Link>
            <Link to="/hm/roles" className="btn-secondary">{t('hmDash.myRoles')}</Link>
            <Link to="/hm/post-role" className="btn-primary">{t('hmDash.postRole')}</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label={t('hmDash.statActiveRoles')} value={roleCountForStat == null ? <Skeleton width={40} height={28} /> : roleCountForStat} />
        <Stat label={t('hmDash.statCandidates')} value={candidatesCount == null ? <Skeleton width={40} height={28} /> : candidatesCount} />
        <Stat label={t('hmDash.statAwaitingYou')} value={actionNeeded == null ? <Skeleton width={40} height={28} /> : actionNeeded} tone={(actionNeeded ?? 0) > 0 ? 'brand' : 'default'} />
        <Stat label={t('hmDash.statHiredAllTime')} value={hiredAllTimeForStat == null ? <Skeleton width={40} height={28} /> : hiredAllTimeForStat} />
      </div>

      <CareerNudgePanel side="hm" />

      {hmReputation && hmReputation.feedback_volume > 0 && (
        <EmployerReputationPanel reputation={hmReputation} />
      )}

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}
      {respondMsg && <div className="mb-6"><Alert tone={respondMsg.tone}>{respondMsg.text}</Alert></div>}

      {hmHasDob === false && (
        <div className="mb-6">
          <Alert tone="amber" title={t('hmDash.dobAlertTitle')}>
            {t('hmDash.dobAlertBody')}
            <div className="mt-2">
              <Button size="sm" onClick={() => setShowAddDobModal(true)}>{t('hmDash.dobAddNow')}</Button>
            </div>
          </Alert>
        </div>
      )}

      {companyVerified === false && companyId && (
        <div className="mb-6">
          <Alert tone="amber" title={t('hmDash.companyPendingTitle')}>
            {t('hmDash.companyPendingBody')}{' '}
            <a
              href={`/onboarding/company/verify?company=${companyId}`}
              className="font-semibold underline"
              target="_blank"
              rel="noreferrer"
            >
              {t('hmDash.companyPendingLink')}
            </a>
            {' '}{t('hmDash.companyPendingTail')}
          </Alert>
        </div>
      )}

      {(roleCount ?? 0) > 0 && (
        <div className="mb-6">
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <span className="font-semibold">{t('hmDash.moreMatchesTitle')}</span>{' '}
            {t('hmDash.moreMatchesBody')}
            {' '}<span className="font-semibold">{t('hmDash.moreMatchesRatio')}</span>
          </div>
        </div>
      )}

      {waiting && (
        <div className="mb-6">
          <Alert tone="amber" title={t('hmDash.coldStartTitle', { roles: waiting.roleCount === 1 ? t('hmDash.coldStartOneRole') : t('hmDash.coldStartManyRoles', { count: waiting.roleCount }) })}>
            {t('hmDash.coldStartBody')}{' '}
            <strong>{t('hmDash.coldStartEstimate', { days: waiting.estimatedDays })}</strong>.
          </Alert>
        </div>
      )}

      {/* Schedule round modal — HM proposes 3 slots, talent picks one */}
      {schedulingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-1 dark:text-white">{t('hmDash.proposeTimesTitle')}</h2>
            <p className="text-xs text-ink-500 dark:text-gray-400 mb-4">
              {t('hmDash.proposeTimesHint')}
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="mb-3">
                <label htmlFor={`hm-slot-${i + 1}`} className="block text-xs mb-1 text-ink-700 dark:text-gray-300 font-medium">
                  {t('hmDash.slot', { n: i + 1 })}
                </label>
                <input
                  id={`hm-slot-${i + 1}`}
                  type="datetime-local"
                  value={scheduleSlots[i]}
                  onChange={(e) => setScheduleSlots((s) => {
                    const next: [string, string, string] = [...s] as [string, string, string]
                    next[i] = e.target.value
                    return next
                  })}
                  className="w-full border dark:border-gray-700 dark:bg-gray-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            ))}
            <div className="flex gap-3 mt-4">
              <Button
                disabled={scheduleSlots.some((s) => !s) || actionBusy !== null}
                loading={actionBusy === `${schedulingFor}:schedule_round`}
                onClick={() => {
                  const [s1, s2, s3] = scheduleSlots
                  void doAction(schedulingFor, 'schedule_round', {
                    slot_1_at: new Date(s1).toISOString(),
                    slot_2_at: new Date(s2).toISOString(),
                    slot_3_at: new Date(s3).toISOString(),
                  })
                }}
              >
                {t('hmDash.sendToCandidate')}
              </Button>
              <Button variant="secondary" onClick={() => { setSchedulingFor(null); setScheduleSlots(['', '', '']) }}>
                {t('hmDash.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {candidates == null ? (
        // Pre-fetch: show 2 skeleton candidate cards.
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : candidates.length === 0 ? (
        onboardingDraftRole ? (
          <div className="rounded-xl border-2 border-brand-500 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            <div className="bg-brand-600 px-5 py-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-white shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
              </svg>
              <span className="text-white font-semibold text-sm">{t('hmDash.draftBannerTitle')}</span>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{onboardingDraftRole.title}</h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                {onboardingDraftRole.industry && <span>{onboardingDraftRole.industry}</span>}
                {(onboardingDraftRole.salary_min || onboardingDraftRole.salary_max) && (
                  <span>RM {fmt(onboardingDraftRole.salary_min)} – {fmt(onboardingDraftRole.salary_max)}</span>
                )}
                {onboardingDraftRole.work_arrangement && (
                  <span className="capitalize">{onboardingDraftRole.work_arrangement.replace(/_/g, '-')}</span>
                )}
              </div>
              {onboardingDraftRole.required_traits?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {onboardingDraftRole.required_traits.map((tr) => (
                    <Badge key={tr}>{tr.replace(/_/g, ' ')}</Badge>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
                {t('hmDash.draftReviewHint')}
              </p>
              <div className="mt-5">
                <Link
                  to={`/hm/post-role/${onboardingDraftRole.id}`}
                  className="btn-primary inline-flex items-center gap-2 text-base px-6 py-3"
                >
                  {t('hmDash.draftActivateCta')}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState
              title={roleCount === 0 ? t('hmDash.emptyPostFirstTitle') : oldestRoleOver24h ? t('hmDash.emptyNoMatchesTitle') : t('hmDash.emptyCuratingTitle')}
              description={roleCount === 0
                ? t('hmDash.emptyPostFirstDesc')
                : oldestRoleOver24h
                  ? t('hmDash.emptyNoMatchesDesc')
                  : t('hmDash.emptyCuratingDesc')}
              action={roleCount === 0 ? <Link to="/hm/post-role" className="btn-primary">{t('hmDash.postRole')}</Link> : undefined}
            />
          </Card>
        )
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {candidates.map((c) => {
            const proposals = proposalsByMatch[c.id] ?? []
            const pendingProposal = proposals.find((p) => p.status === 'pending') ?? null
            return (
              <CandidateCard
                key={c.id}
                row={c}
                rounds={roundsByMatch[c.id] ?? []}
                pendingProposal={pendingProposal}
                preview={previewByMatch[c.id] ?? null}
                contact={contactByMatch[c.id]}
                actionBusy={actionBusy}
                schedulingFor={schedulingFor}
                companyVerified={companyVerified}
                companyId={companyId}
                onInvite={() => void respond(c.id, 'invited_by_manager')}
                onDecline={() => void respond(c.id, 'declined_by_manager')}
                onScheduleRound={() => setSchedulingFor(c.id)}
                onCancelProposal={(proposalId) => void doAction(c.id, 'cancel_interview_proposal', { proposal_id: proposalId })}
                onCompleteInterviews={() => void doAction(c.id, 'complete_interviews')}
                onMakeOffer={() => void doAction(c.id, 'make_offer')}
                onMarkHired={() => void doAction(c.id, 'mark_hired')}
                onCancel={() => void doAction(c.id, 'cancel_match')}
                onRevealContact={() => void revealContact(c.id)}
                onViewResume={() => void viewResume(c.id)}
                feedbackEntry={feedbackState[c.id] ?? { ...DEFAULT_FEEDBACK_ENTRY, rating: c.match_feedback?.[0]?.rating ?? 0, hired: c.match_feedback?.[0]?.hired ?? false, notes: c.match_feedback?.[0]?.notes ?? '', saved: !!c.match_feedback?.[0] }}
                onFeedbackChange={(patch) => setFeedbackState((s) => ({ ...s, [c.id]: { ...(s[c.id] ?? DEFAULT_FEEDBACK_ENTRY), ...patch } }))}
                onFeedbackSubmit={() => void submitFeedback(c.id)}
              />
            )
          })}
        </div>
      )}

      {roleExtras.length > 0 && (
        <Card className="mt-8 border-2 border-amber-400 bg-amber-50/40">
          <div className="p-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-sm font-semibold text-amber-900 mb-0.5">
                  {t('hmDash.urgentSearchTitle', { cost: URGENT_COST })}
                </div>
                <p className="text-sm text-ink-600 dark:text-gray-300">
                  {t('hmDash.urgentSearchDesc')}
                </p>
              </div>
              {pointsBalance != null && (
                <div className="text-xs text-ink-600 dark:text-gray-300 whitespace-nowrap">
                  {t('hmDash.balanceLabel')} <span className="font-semibold text-ink-900 dark:text-white">{t('hmDash.pointsValue', { n: pointsBalance })}</span>
                </div>
              )}
            </div>
            {urgentMsg && (
              <div className="mb-3">
                <Alert tone={urgentMsg.tone}>{urgentMsg.text}</Alert>
              </div>
            )}
            <div className="space-y-2">
              {roleExtras.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <div className="text-sm font-medium text-ink-900 dark:text-white">{r.title}</div>
                    <div className="text-xs text-ink-500 dark:text-gray-400">{t('hmDash.activeCandidatesCount', { count: r.activeCount })}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => void handleUrgentSearch(r.id)}
                    disabled={urgentBusy}
                  >
                    {urgentBusy && urgentRoleId === r.id ? t('hmDash.searching') : t('hmDash.urgentButton', { cost: URGENT_COST })}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {eligibleExtras.length > 0 && (
        <Card className="mt-8 border-dashed border-accent-500">
          <div className="p-6">
            <div className="text-sm font-medium text-ink-900 dark:text-white mb-1">{t('hmDash.needMoreTitle')}</div>
            <p className="text-sm text-ink-500 dark:text-gray-400 mb-4">
              {t('hmDash.needMoreBody', { points: POINTS_PER_EXTRA })}{pointsBalance != null ? t('hmDash.needMoreBalance', { balance: pointsBalance }) : ''}
            </p>
            <div className="space-y-2">
              {eligibleExtras
                .map((r) => {
                  const busy = unlockingRoleId === r.id || redeemingRoleId === r.id
                  const insufficientPoints = pointsBalance != null && pointsBalance < POINTS_PER_EXTRA
                  return (
                    <div key={r.id} className="border-t border-ink-100 dark:border-gray-700 pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-ink-900 dark:text-white">{r.title}</div>
                          <div className="text-xs text-ink-500 dark:text-gray-400">{t('hmDash.extraUnlocksRemaining', { count: 3 - r.extraUsed })}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {insufficientPoints ? (
                            <Link
                              to="/points"
                              className="inline-flex items-center rounded-md border border-ink-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-ink-700 dark:text-gray-300 hover:bg-ink-50 dark:hover:bg-gray-700"
                            >
                              {t('hmDash.getPoints', { points: POINTS_PER_EXTRA })}
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => void handleRedeemExtra(r.id, r.title)}
                              disabled={busy}
                            >
                              {redeemingRoleId === r.id ? t('hmDash.redeeming') : t('hmDash.usePoints', { points: POINTS_PER_EXTRA })}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => void handleUnlockExtra(r.id)}
                            disabled={busy}
                          >
                            {unlockingRoleId === r.id ? t('hmDash.startingPayment') : t('hmDash.unlockRm')}
                          </Button>
                        </div>
                      </div>
                      {insufficientPoints && (
                        <div className="mt-2 text-xs text-ink-500 dark:text-gray-400">
                          {t('hmDash.insufficientPoints', { have: pointsBalance ?? 0, need: POINTS_PER_EXTRA })}{' '}
                          <Link to="/points" className="font-medium text-brand-700 hover:underline">{t('hmDash.walletPage')}</Link>.
                        </div>
                      )}
                      {unlockMsg && unlockMsg.roleId === r.id && (
                        <div className={`mt-2 text-xs ${unlockMsg.tone === 'green' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {unlockMsg.text}
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        </Card>
      )}

      {showAddDobModal && hmId && session && (
        <AddHmDobModal
          hmId={hmId}
          profileId={session.user.id}
          onSaved={() => { setShowAddDobModal(false); setHmHasDob(true) }}
          onCancel={() => setShowAddDobModal(false)}
        />
      )}
    </div>
  )
}
