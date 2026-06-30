import { memo } from 'react'
import { FormSection } from '../../../components/role-form'
import { Input, Select } from '../../../components/ui'
import type { Gender } from '../../../lib/lifeChartCharacter'
import type { TeamMember } from './types'

interface TeamDynamicSectionProps {
  teamSize: number | ''
  setTeamSize: (v: number | '') => void
  teamMembers: TeamMember[]
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>
}

/**
 * The optional "Team-dynamic reference" section — colleague count + per-colleague
 * year-of-birth and gender rows. Relocated VERBATIM from PostRole.tsx: same
 * clamping (0–50 colleagues, 4-digit YOB, 1950..current-year), same private-data
 * copy, same markup. The teamMembers/teamSize relationship is still owned by the
 * parent effect; this component only renders + edits via the passed setters.
 */
function TeamDynamicSection({ teamSize, setTeamSize, teamMembers, setTeamMembers }: TeamDynamicSectionProps) {
  return (
    <FormSection
      title="Team-dynamic reference (optional)"
      description="Existing colleagues this hire will work with directly."
      defaultOpen={false}
    >
      <div className="field-hint mb-2">
        Tell us how many existing colleagues this hire will work with directly, then enter each colleague&apos;s
        year of birth and gender. We use this to gauge team-dynamic compatibility — it stays private and is
        never shown to candidates.
      </div>
      <Input
        label="How many existing colleagues will this hire work with directly?"
        type="number"
        min={0}
        max={50}
        value={teamSize === '' ? '' : teamSize}
        onChange={(e) => setTeamSize(e.target.value === '' ? '' : Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0)))}
        placeholder="e.g. 4"
      />
      {teamMembers.length > 0 && (
        <div className="space-y-3 mt-3">
          {teamMembers.map((m, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-ink-100 dark:border-gray-700 rounded-lg p-3">
              <Input
                label={`Colleague ${idx + 1} year of birth`}
                type="number"
                inputMode="numeric"
                min={1950}
                max={new Date().getFullYear()}
                placeholder="e.g. 1985"
                value={m.dob}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
                  setTeamMembers((prev) => prev.map((p, i) => i === idx ? { ...p, dob: v } : p))
                }}
              />
              <Select
                label={`Colleague ${idx + 1} gender`}
                value={m.gender}
                onChange={(e) => {
                  const v = e.target.value as '' | Gender
                  setTeamMembers((prev) => prev.map((p, i) => i === idx ? { ...p, gender: v } : p))
                }}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </div>
          ))}
        </div>
      )}
    </FormSection>
  )
}

export default memo(TeamDynamicSection)
