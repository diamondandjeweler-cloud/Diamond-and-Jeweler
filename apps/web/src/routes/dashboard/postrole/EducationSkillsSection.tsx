import { memo } from 'react'
import { FormSection, SkillChipInput, LanguageRequirement, type LanguageReq } from '../../../components/role-form'
import { Select } from '../../../components/ui'

interface EducationSkillsSectionProps {
  minEducationLevel: string
  setMinEducationLevel: (v: string) => void
  minEducationClass: string
  setMinEducationClass: (v: string) => void
  requiredSkills: string[]
  setRequiredSkills: (v: string[]) => void
  preferredSkills: string[]
  setPreferredSkills: (v: string[]) => void
  languagesRequired: LanguageReq[]
  setLanguagesRequired: (v: LanguageReq[]) => void
}

/**
 * The "Education, skills & languages" form section — minimum-education Select,
 * the conditional minimum-class Select (rendered only when minEducationLevel ===
 * 'degree'), required- and preferred-skills SkillChipInputs (max 15), and the
 * LanguageRequirement widget. Relocated VERBATIM from PostRole.tsx.
 */
function EducationSkillsSection({
  minEducationLevel, setMinEducationLevel,
  minEducationClass, setMinEducationClass,
  requiredSkills, setRequiredSkills,
  preferredSkills, setPreferredSkills,
  languagesRequired, setLanguagesRequired,
}: EducationSkillsSectionProps) {
  return (
    <FormSection
      title="Education, skills & languages"
      description="Tag what's truly required — these become hard filters in matching."
      defaultOpen
    >
      <div className="grid md:grid-cols-2 gap-5">
        <Select label="Minimum education" value={minEducationLevel} onChange={(e) => setMinEducationLevel(e.target.value)}>
          <option value="">No formal requirement</option>
          <option value="spm">SPM</option>
          <option value="diploma">Diploma</option>
          <option value="professional_cert">Professional certificate</option>
          <option value="degree">Degree</option>
          <option value="masters">Master&apos;s</option>
          <option value="phd">PhD</option>
        </Select>
        {minEducationLevel === 'degree' && (
          <Select label="Minimum class (degree only)" value={minEducationClass} onChange={(e) => setMinEducationClass(e.target.value)}>
            <option value="">Any</option>
            <option value="pass">Pass</option>
            <option value="third">Third class</option>
            <option value="second_lower">2nd class lower</option>
            <option value="second_upper">2nd class upper</option>
            <option value="first">First class</option>
          </Select>
        )}
      </div>

      <SkillChipInput
        label="Required skills"
        hint="Hard filter — candidates without these are excluded. Up to 15."
        value={requiredSkills}
        onChange={setRequiredSkills}
        max={15}
      />

      <SkillChipInput
        label="Preferred skills (nice to have)"
        hint="Soft signal — boosts score but never excludes."
        value={preferredSkills}
        onChange={setPreferredSkills}
        max={15}
      />

      <LanguageRequirement
        label="Languages required"
        hint="Talent must be able to communicate at the specified level."
        value={languagesRequired}
        onChange={setLanguagesRequired}
        side="role"
      />
    </FormSection>
  )
}

export default memo(EducationSkillsSection)
