import { memo } from 'react'
import { FormSection } from '../../../components/role-form'
import { Input, Select } from '../../../components/ui'

interface RoleLogisticsSectionProps {
  headcount: number
  setHeadcount: (v: number) => void
  directTeamSize: number | ''
  setDirectTeamSize: (v: number | '') => void
  reportsToTitle: string
  setReportsToTitle: (v: string) => void
  probationMonths: number | ''
  setProbationMonths: (v: number | '') => void
  interviewProcess: string
  setInterviewProcess: (v: string) => void
}

/**
 * The "Role logistics" form section — headcount + direct-team-size grid (with
 * their inline clamps), reports-to-title Input, and the probation-months Input +
 * interview-process Select grid. Relocated VERBATIM from PostRole.tsx.
 */
function RoleLogisticsSection({
  headcount, setHeadcount,
  directTeamSize, setDirectTeamSize,
  reportsToTitle, setReportsToTitle,
  probationMonths, setProbationMonths,
  interviewProcess, setInterviewProcess,
}: RoleLogisticsSectionProps) {
  return (
    <FormSection
      title="Role logistics"
      description="Headcount, reporting, probation, interview process."
      defaultOpen={false}
    >
      <div className="grid md:grid-cols-2 gap-5">
        <Input
          label="Headcount needed"
          type="number"
          min={1} max={1000}
          value={headcount}
          onChange={(e) => setHeadcount(Math.max(1, parseInt(e.target.value, 10) || 1))}
        />
        <Input
          label="Direct team size (existing)"
          type="number"
          min={0}
          value={directTeamSize}
          onChange={(e) => setDirectTeamSize(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
          placeholder="e.g. 5"
        />
      </div>

      <Input
        label="Reports to (job title)"
        value={reportsToTitle}
        onChange={(e) => setReportsToTitle(e.target.value)}
        placeholder="e.g. Outlet Manager"
      />

      <div className="grid md:grid-cols-2 gap-5">
        <Input
          label="Probation period (months)"
          type="number"
          min={0} max={12}
          value={probationMonths}
          onChange={(e) => setProbationMonths(e.target.value === '' ? '' : Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0)))}
          placeholder="e.g. 3"
        />
        <Select label="Interview process" value={interviewProcess} onChange={(e) => setInterviewProcess(e.target.value)}>
          <option value="">Not specified</option>
          <option value="walk_in">Walk-in</option>
          <option value="single_interview">Single interview</option>
          <option value="two_rounds">Two rounds</option>
          <option value="assessment_required">Assessment required</option>
          <option value="panel">Panel interview</option>
        </Select>
      </div>
    </FormSection>
  )
}

export default memo(RoleLogisticsSection)
