import { memo } from 'react'
import { TRAITS } from './types'

interface TraitPickerProps {
  requiredTraits: string[]
  onToggle: (trait: string) => void
}

/**
 * The "Required traits" chip picker (1–5 cap) from the Matching-profile section.
 * Relocated VERBATIM from PostRole.tsx — same TRAITS source, same 5-cap
 * disabling, same label/hint/markup. Pure given the current selection + toggle.
 */
function TraitPicker({ requiredTraits, onToggle }: TraitPickerProps) {
  return (
    <div>
      <div className="field-label">Required traits <span className="text-red-500">*</span></div>
      <div className="field-hint mb-3">Pick 1–5. We match on these against each talent&apos;s behavioural tags.</div>
      <div className="flex flex-wrap gap-2">
        {TRAITS.map((t) => {
          const on = requiredTraits.includes(t)
          const atCap = !on && requiredTraits.length >= 5
          return (
            <button
              key={t} type="button"
              onClick={() => onToggle(t)}
              disabled={atCap}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${
                on
                  ? 'bg-ink-900 dark:bg-gray-200 text-white dark:text-gray-900 border-ink-900 dark:border-gray-200'
                  : atCap
                    ? 'bg-ink-50 dark:bg-gray-800 text-ink-300 dark:text-gray-600 border-ink-100 dark:border-gray-700 cursor-not-allowed'
                    : 'bg-white dark:bg-gray-800 text-ink-700 dark:text-gray-300 border-ink-200 dark:border-gray-700 hover:border-ink-400 dark:hover:border-gray-500 hover:text-ink-900 dark:hover:text-white'
              }`}
            >
              {t.replace(/_/g, ' ')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default memo(TraitPicker)
