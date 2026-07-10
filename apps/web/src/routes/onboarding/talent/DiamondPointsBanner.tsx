/**
 * Static "free matches" brand banner shown above the ChatShell on the basics
 * phase. Relocated verbatim from TalentOnboarding.tsx — pure static i18n copy,
 * no state, no callbacks. No logic changed.
 */
import { memo } from 'react'
import type { TFunction } from 'i18next'

function DiamondPointsBannerImpl({ t }: { t: TFunction }) {
  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <span className="font-semibold">{t('talentOnboard.freeMatchesBold')}</span>{' '}
      {t('talentOnboard.freeMatchesBody')}
      {' '}<span className="font-semibold">{t('talentOnboard.freeMatchesRate')}</span>
    </div>
  )
}

const DiamondPointsBanner = memo(DiamondPointsBannerImpl)
export default DiamondPointsBanner
