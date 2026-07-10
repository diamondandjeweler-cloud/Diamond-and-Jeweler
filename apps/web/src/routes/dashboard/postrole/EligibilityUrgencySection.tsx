import { memo } from 'react'
import { FormSection, OpenToSelect, EligibilitySelect } from '../../../components/role-form'
import { Select } from '../../../components/ui'

interface EligibilityUrgencySectionProps {
  startUrgency: string
  setStartUrgency: (v: string) => void
  openTo: string[]
  setOpenTo: (v: string[]) => void
  eligibilityWorkAuth: string[]
  setEligibilityWorkAuth: (v: string[]) => void
}

/**
 * The "Eligibility & urgency" form section — start-urgency Select, the
 * OpenToSelect widget (side="role"), and the EligibilitySelect widget.
 * Relocated VERBATIM from PostRole.tsx.
 */
function EligibilityUrgencySection({
  startUrgency, setStartUrgency,
  openTo, setOpenTo,
  eligibilityWorkAuth, setEligibilityWorkAuth,
}: EligibilityUrgencySectionProps) {
  return (
    <FormSection
      title="Eligibility & urgency"
      description="Who can apply, how soon you need them."
      defaultOpen={false}
    >
      <Select label="Start urgency" value={startUrgency} onChange={(e) => setStartUrgency(e.target.value)}>
        <option value="">Not specified</option>
        <option value="immediate">Immediate</option>
        <option value="within_2_weeks">Within 2 weeks</option>
        <option value="within_1_month">Within 1 month</option>
        <option value="flexible">Flexible</option>
      </Select>

      <OpenToSelect
        label="Open to"
        hint="Tick all that apply. Empty = no restriction."
        value={openTo}
        onChange={setOpenTo}
        side="role"
      />

      <EligibilitySelect value={eligibilityWorkAuth} onChange={setEligibilityWorkAuth} />
    </FormSection>
  )
}

export default memo(EligibilityUrgencySection)
