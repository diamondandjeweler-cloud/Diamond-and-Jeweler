import { memo } from 'react'
import { Button } from '../../../components/ui'

interface FormActionsProps {
  busy: boolean
  draftSaved: boolean
  cloudSaved: boolean
  dbDraftSaving: boolean
  hmId: string | null
  title: string
  requiredTraits: string[]
  isEdit: boolean
  fromOnboarding: boolean
  onCancel: () => void
  onSaveDraft: () => void
}

/**
 * The footer action bar inside the form — Cancel button, draft/cloud-saved
 * status span, Save-draft button, and the submit Button with its busy / isEdit /
 * fromOnboarding label logic. Relocated VERBATIM from PostRole.tsx. The
 * type="submit" Button still submits the parent's <form onSubmit={submit}> (DOM
 * bubbling, unchanged); navigate / saveToCloud stay in the parent and arrive via
 * onCancel / onSaveDraft callbacks.
 */
function FormActions({
  busy, draftSaved, cloudSaved, dbDraftSaving,
  hmId, title, requiredTraits, isEdit, fromOnboarding,
  onCancel, onSaveDraft,
}: FormActionsProps) {
  return (
    <div className="flex gap-2 justify-between pt-4 border-t border-ink-100 dark:border-border">
      <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      <div className="flex items-center gap-3">
        {(draftSaved || cloudSaved) && <span className="text-xs text-ink-400 dark:text-fg-muted">{cloudSaved ? 'Cloud saved' : 'Draft saved'}</span>}
        <Button type="button" variant="secondary" onClick={onSaveDraft} loading={dbDraftSaving} disabled={!hmId || busy}>
          Save draft
        </Button>
        <Button type="submit" loading={busy} disabled={!title || requiredTraits.length === 0}>
          {busy
            ? (isEdit ? 'Saving…' : 'Posting…')
            : isEdit
              ? (fromOnboarding ? 'Activate role & start matching' : 'Save changes')
              : 'Post role & start matching'}
        </Button>
      </div>
    </div>
  )
}

export default memo(FormActions)
