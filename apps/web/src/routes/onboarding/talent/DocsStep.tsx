/**
 * "Docs" wizard step — photo / résumé / cover-letter uploads.
 *
 * Relocated verbatim from TalentOnboarding.tsx. Purely presentational: file
 * state + setters stay in the parent and are threaded through as props. The
 * "Review & confirm" disabled guard (!photoFile || !resumeFile) moves verbatim
 * — it reads props only. onReview wraps () => setPhase('review'). No logic
 * changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'
import { Button, Alert } from '../../../components/ui'
import { FileRow } from './StepBits'

interface DocsStepProps {
  t: TFunction
  photoFile: File | null
  setPhotoFile: (f: File | null) => void
  resumeFile: File | null
  setResumeFile: (f: File | null) => void
  coverLetterFile: File | null
  setCoverLetterFile: (f: File | null) => void
  err: string | null
  onReview: () => void
}

function DocsStepImpl({ t, photoFile, setPhotoFile, resumeFile, setResumeFile, coverLetterFile, setCoverLetterFile, err, onReview }: DocsStepProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        {t('talentOnboard.docsIntro')}
      </p>
      <FileRow
        label={t('talentOnboard.photoLabel')}
        accept="image/jpeg,image/png,image/webp"
        file={photoFile}
        onChange={setPhotoFile}
        hint={t('talentOnboard.photoHint')}
        maxBytes={2 * 1024 * 1024}
        required
        chooseLabel={t('talentOnboard.choose')}
        noFileLabel={t('talentOnboard.noFileSelected')}
        tooLargeLabel={(mb) => t('talentOnboard.fileTooLarge', { mb })}
      />
      <FileRow
        label={t('talentOnboard.resumeLabel')}
        accept="application/pdf,.doc,.docx"
        file={resumeFile}
        onChange={setResumeFile}
        maxBytes={10 * 1024 * 1024}
        required
        chooseLabel={t('talentOnboard.choose')}
        noFileLabel={t('talentOnboard.noFileSelected')}
        tooLargeLabel={(mb) => t('talentOnboard.fileTooLarge', { mb })}
      />
      <FileRow
        label={t('talentOnboard.coverLetterLabel')}
        accept="application/pdf,.doc,.docx"
        file={coverLetterFile}
        onChange={setCoverLetterFile}
        maxBytes={10 * 1024 * 1024}
        chooseLabel={t('talentOnboard.choose')}
        noFileLabel={t('talentOnboard.noFileSelected')}
        tooLargeLabel={(mb) => t('talentOnboard.fileTooLarge', { mb })}
      />
      <p className="text-xs text-fg-muted italic">
        {t('talentOnboard.nricNote')}
      </p>
      {err && <Alert tone="red">{err}</Alert>}
      <Button
        onClick={onReview}
        disabled={!photoFile || !resumeFile}
        className="w-full"
        size="lg"
      >
        {t('talentOnboard.reviewConfirm')}
      </Button>
    </div>
  )
}

const DocsStep = memo(DocsStepImpl)
export default DocsStep
