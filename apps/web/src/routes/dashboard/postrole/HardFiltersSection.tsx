import { memo } from 'react'
import { FormSection } from '../../../components/role-form'
import { Switch } from '../../../ui'

interface HardFiltersSectionProps {
  requiresWeekend: boolean
  setRequiresWeekend: (v: boolean) => void
  requiresDrivingLicense: boolean
  setRequiresDrivingLicense: (v: boolean) => void
  requiresTravel: boolean
  setRequiresTravel: (v: boolean) => void
  hasNightShifts: boolean
  setHasNightShifts: (v: boolean) => void
  requiresOwnCar: boolean
  setRequiresOwnCar: (v: boolean) => void
  requiresRelocation: boolean
  setRequiresRelocation: (v: boolean) => void
  requiresOvertime: boolean
  setRequiresOvertime: (v: boolean) => void
  isCommissionBased: boolean
  setIsCommissionBased: (v: boolean) => void
}

/**
 * The "Hard filters" form section — the eight boolean deal-breaker toggles.
 * Extracted from PostRole.tsx (same list order, same labels); the native
 * checkboxes were later converted to the <Switch> primitive (Phase 6 adoption)
 * — each is a controlled boolean setting with no form-submission participation,
 * so switch semantics (Space toggles) apply.
 */
function HardFiltersSection({
  requiresWeekend, setRequiresWeekend,
  requiresDrivingLicense, setRequiresDrivingLicense,
  requiresTravel, setRequiresTravel,
  hasNightShifts, setHasNightShifts,
  requiresOwnCar, setRequiresOwnCar,
  requiresRelocation, setRequiresRelocation,
  requiresOvertime, setRequiresOvertime,
  isCommissionBased, setIsCommissionBased,
}: HardFiltersSectionProps) {
  return (
    <FormSection
      title="Hard filters"
      description="Candidates who refuse these are excluded before scoring."
      defaultOpen={false}
    >
      {[
        { state: requiresWeekend,         setter: setRequiresWeekend,         label: 'Role requires weekend work' },
        { state: requiresDrivingLicense,  setter: setRequiresDrivingLicense,  label: 'Role requires a driving licence' },
        { state: requiresTravel,          setter: setRequiresTravel,          label: 'Role requires travel' },
        { state: hasNightShifts,          setter: setHasNightShifts,          label: 'Role has night shifts / shift work' },
        { state: requiresOwnCar,          setter: setRequiresOwnCar,          label: 'Must have own transport / car' },
        { state: requiresRelocation,      setter: setRequiresRelocation,      label: 'Must be willing to relocate' },
        { state: requiresOvertime,        setter: setRequiresOvertime,        label: 'Overtime is expected' },
        { state: isCommissionBased,       setter: setIsCommissionBased,       label: 'Commission-based or variable pay structure' },
      ].map(({ state, setter, label }, i) => (
        // Whole row stays clickable: the <label htmlFor> forwards activation to
        // the Radix switch button (a labelable element), same as the old
        // label-wrapped checkbox.
        <label key={label} htmlFor={`hard-filter-${i}`} className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-ink-50 dark:hover:bg-surface transition-colors">
          <Switch
            id={`hard-filter-${i}`}
            checked={state}
            onCheckedChange={setter}
          />
          <span className="text-sm text-ink-800 dark:text-fg-strong">{label}</span>
        </label>
      ))}
    </FormSection>
  )
}

export default memo(HardFiltersSection)
