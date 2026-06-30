import { memo } from 'react'

interface DbDraftOffer {
  data: Record<string, unknown>
  updatedAt: string
}

interface DraftBannersProps {
  hasDraft: boolean
  dbDraftOffer: DbDraftOffer | null
  onDiscardLocalDraft: () => void
  onRestoreCloudDraft: (data: Record<string, unknown>) => void
  onDiscardCloudDraft: () => void
}

/**
 * The two draft-restore banners shown above the role form:
 *  - the amber "Draft restored from your last session" banner (localStorage), and
 *  - the blue "Cloud draft found" restore/discard banner (DB draft).
 *
 * Relocated VERBATIM from PostRole.tsx — same markup, same copy, same gating.
 * The side-effecting bits (localStorage / supabase / reload) stay in the parent
 * and are passed in as callbacks so behaviour is unchanged.
 */
function DraftBanners({
  hasDraft, dbDraftOffer, onDiscardLocalDraft, onRestoreCloudDraft, onDiscardCloudDraft,
}: DraftBannersProps) {
  return (
    <>
      {hasDraft && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-sm">
          <span className="text-amber-800">Draft restored from your last session.</span>
          <button
            type="button"
            onClick={onDiscardLocalDraft}
            className="text-xs text-amber-700 underline hover:text-amber-900 shrink-0"
          >
            Discard draft
          </button>
        </div>
      )}

      {dbDraftOffer && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-3 text-sm">
          <span className="text-blue-800">Cloud draft found from {new Date(dbDraftOffer.updatedAt).toLocaleDateString()}. Restore it?</span>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onRestoreCloudDraft(dbDraftOffer.data)}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >Restore</button>
            <button
              type="button"
              onClick={onDiscardCloudDraft}
              className="text-xs text-blue-700 underline hover:text-blue-900"
            >Discard</button>
          </div>
        </div>
      )}
    </>
  )
}

export default memo(DraftBanners)
