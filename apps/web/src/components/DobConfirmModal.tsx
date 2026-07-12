import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

interface Props {
  dob: string  // ISO date "YYYY-MM-DD"
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Compare a free-typed date-of-birth against the canonical ISO `dob`
 * ("YYYY-MM-DD"), validating the FULL date — day, month AND year. Tolerant of
 * separators and missing leading zeros: accepts "15/7/1990", "15-07-1990",
 * "15071990" (day-first, matching the displayed "15 Jul 1990" order). Returns
 * false for anything that doesn't resolve to exactly day+month+year.
 */
export function dobConfirmMatches(dob: string, typed: string): boolean {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob)
  if (!iso) return false
  const [, y, m, d] = iso
  const parts = typed.trim().split(/\D+/).filter(Boolean)
  let day: number, mon: number, yr: number
  if (parts.length === 3) {
    day = Number(parts[0]); mon = Number(parts[1]); yr = Number(parts[2])
  } else {
    const digits = typed.replace(/\D/g, '')
    if (digits.length !== 8) return false
    day = Number(digits.slice(0, 2)); mon = Number(digits.slice(2, 4)); yr = Number(digits.slice(4, 8))
  }
  return day === Number(d) && mon === Number(m) && yr === Number(y)
}

/**
 * Asks the user to re-type their FULL date of birth before we encrypt + lock the
 * DOB. PDPA + matching-quality double-check: a wrong DOB stays wrong forever,
 * with no way to correct it without a Data Request — and month/day are the
 * matching-critical fields, so confirming the year alone gives false assurance
 * for exactly the same-year month/day typos most likely to degrade matching.
 */
export default function DobConfirmModal({ dob, onConfirm, onCancel }: Props) {
  const [typedDate, setTypedDate] = useState('')
  const [showError, setShowError] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const matches = dobConfirmMatches(dob, typedDate)

  useEffect(() => {
    // Focus the confirm input when the modal mounts (modal-scoped focus).
    requestAnimationFrame(() => dateInputRef.current?.focus())
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
          <label htmlFor="dob-confirm-input" className="block text-sm font-medium text-ink-700 mb-1">
            To confirm, re-type your full <strong>date of birth</strong> (day / month / year)
          </label>
          <input
            ref={dateInputRef}
            id="dob-confirm-input"
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={typedDate}
            onChange={(e) => { setTypedDate(e.target.value); setShowError(false) }}
            className="w-full border border-ink-300 rounded-lg px-3 py-2 text-base font-mono focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="DD / MM / YYYY"
          />
          {showError && (
            <p role="alert" aria-live="assertive" className="mt-1 text-sm text-red-600">
              That doesn&apos;t match. You entered <strong>{formatDob(dob)}</strong> above.
              Re-type the full date to confirm — or click &ldquo;Edit&rdquo; to change your DOB.
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
            disabled={typedDate.trim().length === 0}
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
