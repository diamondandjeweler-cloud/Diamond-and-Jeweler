import { memo } from 'react'
import { PageHeader } from '../../../components/ui'

interface PostRoleHeaderProps {
  isEdit: boolean
  fromOnboarding: boolean
}

/**
 * The top PageHeader block. Relocated VERBATIM from PostRole.tsx — the eyebrow /
 * title / description strings are computed purely from isEdit + fromOnboarding.
 * Pure presentational lift; no state or effects.
 */
function PostRoleHeader({ isEdit, fromOnboarding }: PostRoleHeaderProps) {
  return (
    <PageHeader
      eyebrow={isEdit ? 'Review role' : 'New role'}
      title={isEdit ? (fromOnboarding ? 'Review your first role' : 'Edit role') : 'Post a role'}
      description={
        isEdit
          ? fromOnboarding
            ? 'We pre-filled this from your onboarding answers. Check each section, adjust anything that\'s off, then activate it to start receiving candidates.'
            : 'Update the details below. Changes apply immediately to matching.'
          : 'Up to three candidates will be curated for this role as talents become eligible. Pilot estimate: ~14 days.'
      }
    />
  )
}

export default memo(PostRoleHeader)
