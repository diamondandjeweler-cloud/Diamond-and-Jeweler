import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Alert, Input } from '../../../components/ui'

/** "Add me as HM" modal. Relocated verbatim from HRDashboard.tsx. */
function AddMeAsHmModalImpl({
  jobTitle, busy, err,
  onJobTitleChange, onClose, onSubmit,
}: {
  jobTitle: string
  busy: boolean
  err: string | null
  onJobTitleChange: (v: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-me-hm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 id="add-me-hm-title" className="text-xl font-semibold text-fg">
          {t('hrDash.addMeModalTitle')}
        </h2>
        <p className="text-sm text-ink-700 dark:text-gray-300">
          {t('hrDash.addMeModalBody')}
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label={t('hrDash.jobTitleLabel')}
            value={jobTitle}
            onChange={(e) => onJobTitleChange(e.target.value)}
            placeholder={t('hrDash.jobTitlePlaceholder')}
            required
            // Modal opens with this as the only field; focusing it is the expected behaviour.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {err && <Alert tone="red">{err}</Alert>}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!jobTitle.trim()}>
              {t('hrDash.addMeButton')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

const AddMeAsHmModal = memo(AddMeAsHmModalImpl)
export default AddMeAsHmModal
