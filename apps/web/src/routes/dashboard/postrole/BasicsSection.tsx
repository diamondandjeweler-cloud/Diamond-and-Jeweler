import { memo } from 'react'
import { FormSection } from '../../../components/role-form'
import { Input, Textarea } from '../../../components/ui'
import { Tooltip } from '../../../ui'

interface BasicsSectionProps {
  title: string
  setTitle: (v: string) => void
  description: string
  setDescription: (v: string) => void
  department: string
  setDepartment: (v: string) => void
  location: string
  setLocation: (v: string) => void
  locationPostcode: string
  setLocationPostcode: (v: string) => void
  industry: string
  setIndustry: (v: string) => void
  drafting: boolean
  draftErr: string | null
  onGenerateDraft: () => void
}

/**
 * The "Basics" form section — role title, the description block with its
 * Generate/Regenerate draft button + Textarea + error line, the department /
 * location grid, the office-postcode Input (with its inline digit-strip), and
 * the industry Input. Relocated VERBATIM from PostRole.tsx. The draft-generation
 * side effect stays in the parent and is invoked via onGenerateDraft.
 */
function BasicsSection({
  title, setTitle,
  description, setDescription,
  department, setDepartment,
  location, setLocation,
  locationPostcode, setLocationPostcode,
  industry, setIndustry,
  drafting, draftErr, onGenerateDraft,
}: BasicsSectionProps) {
  return (
    <FormSection title="Basics" defaultOpen>
      <Input
        label="Role title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        placeholder="e.g. Senior Backend Engineer"
      />

      <div>
        <div className="flex items-end justify-between gap-3 mb-1">
          <div className="field-label">Description</div>
          <Tooltip content={!title.trim() ? 'Type a role title first' : 'Generate a starter draft from the title'}>
            {/* Focusable proxy (per Tooltip docs): a disabled button emits no
                focus/pointer events, so the span keeps the tip keyboard-reachable
                — but ONLY while disabled, so it never adds a redundant tab stop
                next to an enabled, already-focusable button. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- conditional disabled-trigger tooltip proxy; see comment above */}
            <span tabIndex={drafting || !title.trim() ? 0 : undefined} className="inline-block">
              <button
                type="button"
                onClick={() => void onGenerateDraft()}
                disabled={drafting || !title.trim()}
                className="text-xs px-2.5 py-1 rounded-md border border-border text-ink-700 dark:text-fg-strong hover:border-ink-400 dark:hover:border-gray-500 hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {drafting ? 'Drafting…' : description ? 'Regenerate draft' : 'Generate draft'}
              </button>
            </span>
          </Tooltip>
        </div>
        <Textarea
          hint="What the candidate will own. Keep it concrete. Click 'Generate draft' if you're stuck."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
        />
        {draftErr && <p className="text-xs text-red-600 mt-1">{draftErr}</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Engineering" />
        <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>

      <Input
        label="Office postcode (optional)"
        hint="Used for proximity matching when applicants opt-in to commute distance."
        value={locationPostcode}
        onChange={(e) => setLocationPostcode(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
        inputMode="numeric"
        maxLength={5}
        placeholder="e.g. 50450"
      />

      <Input
        label="Industry (optional)"
        hint="e.g. accounting, retail, F&B, software. Used by the matching engine to gauge background fit."
        value={industry}
        onChange={(e) => setIndustry(e.target.value)}
        placeholder="e.g. accounting"
      />
    </FormSection>
  )
}

export default memo(BasicsSection)
