import { memo } from 'react'
import { FormSection } from '../../../components/role-form'
import { Input, Select, Alert } from '../../../components/ui'
import { Switch } from '../../../ui'

interface CompensationSectionProps {
  workArr: 'remote' | 'hybrid' | 'onsite'
  setWorkArr: (v: 'remote' | 'hybrid' | 'onsite') => void
  experience: 'entry' | 'junior' | 'mid' | 'senior' | 'lead'
  setExperience: (v: 'entry' | 'junior' | 'mid' | 'senior' | 'lead') => void
  employmentType: 'full_time' | 'part_time' | 'contract' | 'gig' | 'internship'
  setEmploymentType: (v: 'full_time' | 'part_time' | 'contract' | 'gig' | 'internship') => void
  hourlyRate: number
  setHourlyRate: (v: number) => void
  salaryMin: number
  setSalaryMin: (v: number) => void
  salaryMax: number
  setSalaryMax: (v: number) => void
  durationDays: number | ''
  setDurationDays: (v: number | '') => void
  startDate: string
  setStartDate: (v: string) => void
  acceptNoExperience: boolean
  setAcceptNoExperience: (v: boolean) => void
  marketWarning: string | null
}

/**
 * The "Compensation & employment type" form section — work-arrangement +
 * experience Selects, employment-type Select, the two conditional Inputs
 * (hourly-rate vs salary-min, duration vs salary-max keyed on employmentType),
 * start-date Input, the market-rate Alert, and the accept-no-experience
 * checkbox. Relocated VERBATIM from PostRole.tsx. The market-rate effect stays
 * in the parent; only its computed marketWarning string is passed down.
 */
function CompensationSection({
  workArr, setWorkArr,
  experience, setExperience,
  employmentType, setEmploymentType,
  hourlyRate, setHourlyRate,
  salaryMin, setSalaryMin,
  salaryMax, setSalaryMax,
  durationDays, setDurationDays,
  startDate, setStartDate,
  acceptNoExperience, setAcceptNoExperience,
  marketWarning,
}: CompensationSectionProps) {
  return (
    <FormSection title="Compensation & employment type" defaultOpen>
      <div className="grid md:grid-cols-2 gap-5">
        <Select label="Work arrangement" value={workArr} onChange={(e) => setWorkArr(e.target.value as typeof workArr)}>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
        </Select>
        <Select label="Experience level" value={experience} onChange={(e) => setExperience(e.target.value as typeof experience)}>
          <option value="entry">Entry</option>
          <option value="junior">Junior</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
          <option value="lead">Lead</option>
        </Select>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Select label="Employment type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}>
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="gig">Gig / project</option>
          <option value="internship">Internship</option>
        </Select>
        {(employmentType === 'gig' || employmentType === 'part_time' || employmentType === 'contract') ? (
          <Input label="Hourly rate (RM)" type="number" min={0} step="0.01" value={hourlyRate || ''} onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)} />
        ) : (
          <Input label="Salary min (RM / month)" type="number" min={0} value={salaryMin || ''} onChange={(e) => setSalaryMin(parseInt(e.target.value, 10) || 0)} />
        )}
        {(employmentType === 'gig' || employmentType === 'contract') ? (
          <Input label="Duration (days)" type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))} />
        ) : (
          <Input label="Salary max (RM / month)" type="number" min={0} value={salaryMax || ''} onChange={(e) => setSalaryMax(parseInt(e.target.value, 10) || 0)} />
        )}
      </div>

      <Input label="Start date (optional)" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />

      {marketWarning && (
        <Alert tone="amber" title="Market-rate check">{marketWarning}</Alert>
      )}

      <Switch
        id="post-role-accept-no-exp"
        checked={acceptNoExperience}
        onCheckedChange={setAcceptNoExperience}
        label="Open to applicants without prior experience in this field."
        description="Off-field candidates won't be filtered out. Senior / lead roles still require relevant background unless this is checked."
      />
    </FormSection>
  )
}

export default memo(CompensationSection)
