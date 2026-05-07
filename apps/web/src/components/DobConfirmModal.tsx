import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

interface Props {
  dob: string  // ISO date "YYYY-MM-DD"
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Asks the user to type their birth year a second time before we encrypt + lock
 * the DOB. PDPA + matching-quality double-check: a wrong DOB stays wrong forever,
 * with no way to correct it without a Data Request.
 */
export default function DobConfirmModal({ dob, onConfirm, onCancel }: Props) {
  const [typedYear, setTypedYear] = useState('')
  const [showError, setShowError] = useState(false)
  const yearInputRef = useRef<HTMLInputElement>(null)

  const expectedYear = dob.slice(0, 4)
  const matches = typedYear === expectedYear

  useEffect(() => {
    // Focus the year input when the modal mounts (modal-scoped focus).
    requestAnimationFrame(() => yearInputRef.current?.focus())
  }, [])

  function handleConfirm() {
    if (!matches) {
      setShowError(true)
      return
    }
    onConfirm()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dob-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 id="dob-confirm-title" className="text-xl font-semibold text-ink-900">
          Confirm your date of birth
        </h2>
        <p className="text-sm text-ink-700">
          Once locked, your date of birth cannot be changed without submitting a Data Request.
          Please double-check.
        </p>
        <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-center">
          <div className="text-xs text-ink-500 uppercase tracking-wider mb-1">You entered</div>
          <div className="text-2xl font-mono font-semibold text-ink-900">
            {formatDob(dob)}
          </div>
        </div>
        <div>
          <label htmlFor="dob-year-confirm" className="block text-sm font-medium text-ink-700 mb-1">
            To confirm, type your <strong>birth year</strong> ({expectedYear.length === 4 ? '4 digits' : '...'})
          </label>
          <input
            ref={yearInputRef}
            id="dob-year-confirm"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={typedYear}
            onChange={(e) => { setTypedYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setShowError(false) }}
            className="w-full border border-ink-300 rounded-lg px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="YYYY"
          />
          {showError && (
            <p className="mt-1 text-sm text-red-600">
              That doesn&apos;t match. The year you entered above was <strong>{expectedYear}</strong>.
              Type it exactly to confirm — or click &ldquo;Edit&rdquo; to change your DOB.
            </p>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={onCancel}
            className="flex-1"
          >
            Edit
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={typedYear.length !== 4}
            className="flex-1"
          >
            Confirm &amp; lock
          </Button>
        </div>
      </div>
    </div>
  )
}

function formatDob(iso: string): string {
  if (!iso || iso.length < 10) return iso
  const [y, m, d] = iso.split('-')
  const monthName = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m, 10) - 1] ?? m
  return `${parseInt(d, 10)} ${monthName} ${y}`
}
