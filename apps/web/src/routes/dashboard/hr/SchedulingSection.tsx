import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import Skeleton from '../../../components/Skeleton'
import { Button, Card, Badge, EmptyState, Input, Select } from '../../../components/ui'
import { SectionHeader, SubHeader } from './headers'
import type { PendingRow, ScheduledRow } from './types'

/**
 * Scheduling section: upcoming interviews + "awaiting scheduling" queue.
 * Relocated verbatim from HRDashboard.tsx. The create-meeting-link button now
 * calls the `onCreateMeetingLink` handler (which owns the same supabase/fetch
 * logic that previously lived inline) — identical behaviour.
 */
function SchedulingSectionImpl({
  pending, scheduled,
  schedulingId, scheduledAt, format,
  onSetScheduledAt, onSetFormat,
  onStartScheduling, onCancelScheduling, onConfirmSchedule,
  onCreateMeetingLink, onCompleteInterview,
}: {
  pending: PendingRow[] | null
  scheduled: ScheduledRow[] | null
  schedulingId: string | null
  scheduledAt: string
  format: 'video' | 'phone' | 'in_person'
  onSetScheduledAt: (v: string) => void
  onSetFormat: (v: 'video' | 'phone' | 'in_person') => void
  onStartScheduling: (matchId: string) => void
  onCancelScheduling: () => void
  onConfirmSchedule: (matchId: string) => void
  onCreateMeetingLink: (interviewId: string) => void
  onCompleteInterview: (interviewId: string, matchId: string, hired: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <section>
      <SectionHeader
        title={t('hrDash.scheduleInterviewsTitle')}
        subtitle={t('hrDash.scheduleInterviewsSubtitle')}
        count={(pending?.length ?? 0) + (scheduled?.length ?? 0)}
      />

      {(scheduled?.length ?? 0) > 0 && (
        <section className="mb-8">
          <SubHeader title={t('hrDash.upcomingInterviews')} count={scheduled!.length} />
          <div className="space-y-3">
            {scheduled!.map((s) => (
              <Card key={s.interview_id}>
                <div className="p-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg text-ink-900 dark:text-white">{s.role_title}</h3>
                    <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5">
                      {t('hrDash.candidate')} ·{' '}
                      {s.scheduled_at
                        ? new Date(s.scheduled_at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                      {' · '}
                      <span>{s.format ? t(`hrDash.format.${s.format}`, { defaultValue: s.format }) : '—'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    {s.meeting_url ? (
                      <a href={s.meeting_url} target="_blank" rel="noopener noreferrer" className="btn-brand btn-sm">
                        {t('hrDash.joinMeeting')}{s.meeting_provider ? ` · ${s.meeting_provider}` : ''}
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => onCreateMeetingLink(s.interview_id)}>{t('hrDash.createMeetingLink')}</Button>
                    )}
                    <Button size="sm" onClick={() => void onCompleteInterview(s.interview_id, s.match_id, true)}>{t('hrDash.markHired')}</Button>
                    <Button size="sm" variant="secondary" onClick={() => void onCompleteInterview(s.interview_id, s.match_id, false)}>{t('hrDash.notHired')}</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <SubHeader title={t('hrDash.awaitingScheduling')} count={pending?.length ?? 0} />
        {pending == null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Card key={i}>
                <div className="p-5 flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Skeleton width={220} height={18} />
                    <Skeleton width={140} height={11} rounded="sm" />
                  </div>
                  <Skeleton width={140} height={32} />
                </div>
              </Card>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <Card>
            <EmptyState
              title={t('hrDash.nothingToSchedule')}
              description={t('hrDash.nothingToScheduleDesc')}
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <Card key={p.id}>
                <div className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg text-ink-900 dark:text-white">{p.roles?.title}</h3>
                      <div className="text-xs text-ink-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                        <span>{t('hrDash.candidate')}</span>
                        <Badge tone="green">{t('hrDash.percentMatch', { pct: Math.round(p.compatibility_score ?? 0) })}</Badge>
                      </div>
                    </div>
                    {schedulingId !== p.id && (
                      <Button size="sm" onClick={() => onStartScheduling(p.id)}>{t('hrDash.scheduleInterview')}</Button>
                    )}
                  </div>
                  {schedulingId === p.id && (
                    <div className="mt-5 grid md:grid-cols-3 gap-3 pt-5 border-t border-ink-100 dark:border-gray-700">
                      <Input label={t('hrDash.dateTimeLabel')} type="datetime-local" value={scheduledAt} onChange={(e) => onSetScheduledAt(e.target.value)} />
                      <Select label={t('hrDash.formatLabel')} value={format} onChange={(e) => onSetFormat(e.target.value as typeof format)}>
                        <option value="video">{t('hrDash.format.video')}</option>
                        <option value="phone">{t('hrDash.format.phone')}</option>
                        <option value="in_person">{t('hrDash.format.in_person')}</option>
                      </Select>
                      <div className="flex items-end gap-2">
                        <Button onClick={() => void onConfirmSchedule(p.id)} className="flex-1">{t('hrDash.confirm')}</Button>
                        <Button variant="secondary" onClick={onCancelScheduling}>{t('common.cancel')}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

const SchedulingSection = memo(SchedulingSectionImpl)
export default SchedulingSection
