import { Link } from 'react-router-dom'
import { fmt } from '../../lib/format'
import { useTranslation } from 'react-i18next'
import { useSeo } from '../../lib/useSeo'
import { getDisplayName } from '../../lib/displayName'
import Skeleton from '../../components/Skeleton'
import { SkeletonCard } from '../../components/Skeleton'
import { Button, Card, Alert, EmptyState, PageHeader, Stat } from '../../components/ui'
import CareerNudgePanel from '../../components/CareerNudgePanel'
import GrowthNudgePreferences from '../../components/GrowthNudgePreferences'
import { usePushSubscription } from '../../lib/usePushSubscription'
import { useTalentDashboardData } from './talent/useTalentDashboardData'
import { OfferCard } from './talent/OfferCard'
import { ExpiryBanner, CareerHealthPanel, ProfileCompletenessBar } from './talent/panels'

export default function TalentDashboard() {
  const { t } = useTranslation()
  useSeo({ title: t('talentDash.seoTitle'), noindex: true })
  const push = usePushSubscription()
  const {
    profile,
    POINTS_PER_EXTRA,
    URGENT_COST,
    matches,
    err,
    extractionStatus,
    showJustSavedModal, setShowJustSavedModal,
    extraUsed,
    unlocking,
    redeemingExtra,
    unlockMsg,
    urgentBusy,
    urgentResult,
    urgentMsg,
    pointsBalance,
    profileExpiresAt,
    reviving,
    reviveStep, setReviveStep,
    talentReputation,
    profileGaps,
    talentFeedbackState, setTalentFeedbackState,
    roundsByMatch,
    proposalsByMatch,
    actionBusy,
    openCount,
    inFlight,
    totalActive,
    slotsAvailable,
    reviveProfile,
    handleUnlockExtra,
    handleRedeemExtraTalent,
    handleUrgentJobSearch,
    doAction,
    pickInterviewSlot,
    declineInterviewProposal,
    submitTalentFeedback,
    respond,
  } = useTalentDashboardData()

  return (
    <div>
      <PageHeader
        eyebrow={profile && t('dashboard.talentGreeting', { name: getDisplayName(profile) })}
        title={t('talentDash.pageTitle')}
        description={t('talentDash.pageDescription')}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {push.state === 'idle' && push.vapidReady && Notification.permission !== 'denied' && (
              <button
                type="button"
                onClick={() => void push.subscribe()}
                disabled={push.subscribing}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-brand-200 text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-60"
                aria-label={t('talentDash.enableNotificationsAria')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {t('talentDash.enableMatchAlerts')}
              </button>
            )}
            {push.state === 'subscribed' && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>
                {t('talentDash.matchAlertsOn')}
              </span>
            )}
            {push.showIosHint && (
              <span className="text-xs text-gray-500">{t('talentDash.iosHint')}</span>
            )}
            <Link to="/talent/profile" className="btn-secondary">{t('talentDash.editProfile')}</Link>
          </div>
        }
      />

      <ExpiryBanner
        expiresAt={profileExpiresAt}
        reviving={reviving}
        reviveStep={reviveStep}
        onReviveClick={() => setReviveStep('confirm')}
        onReviveConfirm={reviveProfile}
        onReviveCancel={() => setReviveStep('idle')}
      />

      {(extractionStatus === 'pending' || extractionStatus === 'processing') && (
        <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 flex items-start gap-3">
          <svg className="animate-spin h-5 w-5 text-brand-500 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="text-sm text-brand-900">
            <div className="font-semibold">{t('talentDash.analysingTitle')}</div>
            <div className="text-brand-800 mt-0.5">
              {t('talentDash.analysingBody')}
            </div>
          </div>
        </div>
      )}

      {extractionStatus === 'failed' && (
        <div className="mb-6"><Alert tone="red">
          {t('talentDash.analysisFailedLead')}{' '}
          <Link to="/talent/profile" className="underline font-semibold">{t('talentDash.openYourProfile')}</Link>{' '}
          {t('talentDash.analysisFailedTail')}
        </Alert></div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat
          label={t('talentDash.statAwaiting')}
          value={openCount == null ? <Skeleton width={40} height={28} /> : openCount}
          tone={(openCount ?? 0) > 0 ? 'brand' : 'default'}
        />
        <Stat
          label={t('talentDash.statInProgress')}
          value={inFlight == null ? <Skeleton width={40} height={28} /> : inFlight}
        />
        <Stat
          label={t('talentDash.statTotalActive')}
          value={totalActive == null ? <Skeleton width={40} height={28} /> : totalActive}
        />
        <Stat
          label={t('talentDash.statSlotsAvailable')}
          value={slotsAvailable == null ? <Skeleton width={40} height={28} /> : slotsAvailable}
          hint={t('talentDash.statSlotsHint')}
        />
      </div>

      <CareerNudgePanel side="talent" />

      <GrowthNudgePreferences />

      {profileGaps.length > 0 && (
        <ProfileCompletenessBar gaps={profileGaps} />
      )}

      {talentReputation && talentReputation.feedback_volume > 0 && (
        <CareerHealthPanel reputation={talentReputation} />
      )}

      {err && <div className="mb-6"><Alert tone="red">{err}</Alert></div>}

      {matches == null ? (
        // Pre-fetch: 2 skeleton offer cards so the layout feels populated.
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <EmptyState
            title={t('talentDash.emptyTitle')}
            description={t('talentDash.emptyDescription')}
            action={<Link to="/talent/profile" className="btn-secondary">{t('talentDash.refineProfile')}</Link>}
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {matches.map((m) => {
            const proposals = proposalsByMatch[m.id] ?? []
            const pendingProposal = proposals.find((p) => p.status === 'pending') ?? null
            return (
              <OfferCard
                key={m.id}
                m={m}
                rounds={roundsByMatch[m.id] ?? []}
                pendingProposal={pendingProposal}
                actionBusy={actionBusy}
                respond={respond}
                onAcceptOffer={() => void doAction(m.id, 'accept_offer')}
                onDeclineOffer={() => void doAction(m.id, 'decline_offer')}
                onPickSlot={(slot) => pendingProposal && void pickInterviewSlot(m.id, pendingProposal.id, slot)}
                onDeclineProposal={() => pendingProposal && void declineInterviewProposal(m.id, pendingProposal.id)}
                feedbackEntry={talentFeedbackState[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }}
                onFeedbackChange={(patch) => setTalentFeedbackState((s) => ({ ...s, [m.id]: { ...(s[m.id] ?? { rating: 0, outcome: '', freeText: '', saving: false, saved: false }), ...patch } }))}
                onFeedbackSubmit={() => void submitTalentFeedback(m.id)}
              />
            )
          })}
        </div>
      )}

      <Card className="mt-8 border-2 border-amber-400 bg-amber-50/40">
        <div className="p-6">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="text-sm font-semibold text-amber-900 mb-0.5">
                {t('talentDash.urgentHeading', { cost: URGENT_COST })}
              </div>
              <p className="text-sm text-ink-600">
                {t('talentDash.urgentSubtitle')}
              </p>
            </div>
            {pointsBalance != null && (
              <div className="text-xs text-ink-600 whitespace-nowrap">
                {t('talentDash.balanceLabel')} <span className="font-semibold text-ink-900">{t('talentDash.pointsValue', { n: pointsBalance })}</span>
              </div>
            )}
          </div>
          {urgentMsg && (
            <div className="mb-3"><Alert tone={urgentMsg.tone}>{urgentMsg.text}</Alert></div>
          )}
          {urgentResult && (
            <div className="mb-3 rounded-lg border-2 border-amber-300 bg-white p-4">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {t('talentDash.urgentMatchBadge')}
              </div>
              <div className="text-base font-semibold text-ink-900">{urgentResult.role.title}</div>
              <div className="mt-0.5 text-xs text-ink-500 flex gap-2 flex-wrap">
                {urgentResult.role.location && <span>{urgentResult.role.location}</span>}
                {urgentResult.role.work_arrangement && (<><span>·</span><span className="capitalize">{urgentResult.role.work_arrangement}</span></>)}
              </div>
              {(urgentResult.role.salary_min || urgentResult.role.salary_max) && (
                <div className="mt-1 text-sm text-ink-700">
                  RM {fmt(urgentResult.role.salary_min)} – {fmt(urgentResult.role.salary_max)} <span className="text-ink-400">{t('talentDash.perMonth')}</span>
                </div>
              )}
              {urgentResult.role.description && (
                <p className="mt-2 text-sm text-ink-600 line-clamp-3">{urgentResult.role.description}</p>
              )}
              <p className="mt-3 text-xs text-ink-500">
                {t('talentDash.urgentStayOpen')}
              </p>
            </div>
          )}
          <Button onClick={handleUrgentJobSearch} disabled={urgentBusy}>
            {urgentBusy ? t('talentDash.searching') : t('talentDash.urgentButton', { cost: URGENT_COST })}
          </Button>
        </div>
      </Card>

      {(matches?.length ?? 0) >= 3 && extraUsed < 3 && (
        <Card className="mt-8 border-dashed border-accent-500">
          <div className="p-6 text-center">
            <div className="text-sm font-medium text-ink-700 mb-1">{t('talentDash.extraLookedAll')}</div>
            <p className="text-sm text-ink-500 mb-4">
              {t('talentDash.extraUnlockRemaining', { count: 3 - extraUsed })}
              <br />
              {pointsBalance != null
                ? t('talentDash.extraPayOrSpendBalance', { cost: POINTS_PER_EXTRA, balance: pointsBalance })
                : t('talentDash.extraPayOrSpend', { cost: POINTS_PER_EXTRA })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {pointsBalance != null && pointsBalance < POINTS_PER_EXTRA ? (
                <Link
                  to="/points"
                  className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  {t('talentDash.extraGetPoints', { cost: POINTS_PER_EXTRA })}
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  onClick={handleRedeemExtraTalent}
                  disabled={unlocking || redeemingExtra}
                >
                  {redeemingExtra ? t('talentDash.redeeming') : t('talentDash.extraUsePoints', { cost: POINTS_PER_EXTRA })}
                </Button>
              )}
              <Button onClick={handleUnlockExtra} disabled={unlocking || redeemingExtra}>
                {unlocking ? t('talentDash.startingPayment') : t('talentDash.extraUnlockButton')}
              </Button>
            </div>
            {pointsBalance != null && pointsBalance < POINTS_PER_EXTRA && (
              <div className="mt-3 text-xs text-ink-500">
                {t('talentDash.extraEarnHint', { balance: pointsBalance, cost: POINTS_PER_EXTRA })}{' '}
                <Link to="/points" className="font-medium text-brand-700 hover:underline">{t('talentDash.walletPage')}</Link>.
              </div>
            )}
            {unlockMsg && (
              <div className={`mt-3 text-xs ${unlockMsg.tone === 'green' ? 'text-emerald-700' : 'text-red-700'}`}>
                {unlockMsg.text}
              </div>
            )}
          </div>
        </Card>
      )}

      {showJustSavedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="h-14 w-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl">✓</div>
            </div>
            <h2 className="font-display text-2xl text-ink-900 mb-2">{t('talentDash.savedTitle')}</h2>
            <p className="text-sm text-ink-600 leading-relaxed mb-4">
              {t('talentDash.savedBody')}
            </p>
            <p className="text-xs text-ink-500 mb-5">
              {t('talentDash.savedShareNote')}
            </p>
            <Button className="w-full" onClick={() => setShowJustSavedModal(false)}>
              {t('talentDash.savedGotIt')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
