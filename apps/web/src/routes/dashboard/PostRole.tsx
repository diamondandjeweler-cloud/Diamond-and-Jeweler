import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fmt } from '../../lib/format'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { updateRole, insertRole, getRoleDraft, saveRoleDraft, deleteRoleDraft, getRoleFullById, getRoleCommitCheck } from '../../data/repositories/roles'
import type { Database } from '../../types/db.generated'
import { hmIdByProfileId } from '../../data/repositories/hiringManagers'
import { getMarketRate } from '../../data/repositories/marketRates'
import { callFunction } from '../../lib/functions'
import { FormSkeleton } from '../../components/ListSkeleton'
import { Card, Alert, Select, PageHeader } from '../../components/ui'
import { useSeo } from '../../lib/useSeo'
import {
  FormSection, EnvironmentFlags,
  ScheduleBlock, NonNegotiablesInput,
  type LanguageReq, type ScheduleValue, type NNAtom,
} from '../../components/role-form'
import { validateSalaryRange } from '../../shared/domain/salary/validateSalaryRange'
import { DRAFT_KEY, type TeamMember } from './postrole/types'
import { buildTeamMemberCharacters } from './postrole/teamCharacters'
import { resolveRoleStatus } from './postrole/resolveRoleStatus'
import DraftBanners from './postrole/DraftBanners'
import HardFiltersSection from './postrole/HardFiltersSection'
import TraitPicker from './postrole/TraitPicker'
import TeamDynamicSection from './postrole/TeamDynamicSection'
import PostRoleHeader from './postrole/PostRoleHeader'
import BasicsSection from './postrole/BasicsSection'
import CompensationSection from './postrole/CompensationSection'
import EducationSkillsSection from './postrole/EducationSkillsSection'
import RoleLogisticsSection from './postrole/RoleLogisticsSection'
import EligibilityUrgencySection from './postrole/EligibilityUrgencySection'
import FormActions from './postrole/FormActions'

export default function PostRole() {
  const { id: editRoleId } = useParams<{ id?: string }>()
  const isEdit = !!editRoleId
  useSeo({ title: isEdit ? 'Review your role' : 'Post a role', noindex: true })
  const { session } = useSession(useShallow((s) => ({ session: s.session })))
  const userId = session?.user.id
  const navigate = useNavigate()

  const [hmId, setHmId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromOnboarding, setFromOnboarding] = useState(false)
  // The loaded role's current status (edit mode only). Drives the status
  // guardrail in submit() so re-pointed "Edit" entry points can't silently
  // reactivate a paused role — see resolveRoleStatus().
  const [roleStatus, setRoleStatus] = useState<string | null>(null)
  const [teamSize, setTeamSize] = useState<number | ''>('')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Basics
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('Kuala Lumpur')
  const [locationPostcode, setLocationPostcode] = useState('')
  const [industry, setIndustry] = useState('')
  const [acceptNoExperience, setAcceptNoExperience] = useState(false)
  const [workArr, setWorkArr] = useState<'remote' | 'hybrid' | 'onsite'>('hybrid')
  const [experience, setExperience] = useState<'entry' | 'junior' | 'mid' | 'senior' | 'lead'>('mid')
  const [salaryMin, setSalaryMin] = useState(0)
  const [salaryMax, setSalaryMax] = useState(0)
  const [requiredTraits, setRequiredTraits] = useState<string[]>([])
  const [employmentType, setEmploymentType] = useState<'full_time'|'part_time'|'contract'|'gig'|'internship'>('full_time')
  const [hourlyRate, setHourlyRate] = useState(0)
  const [durationDays, setDurationDays] = useState<number | ''>('')
  const [startDate, setStartDate] = useState<string>('')
  const [requiresWeekend, setRequiresWeekend] = useState(false)
  const [requiresDrivingLicense, setRequiresDrivingLicense] = useState(false)
  const [requiresTravel, setRequiresTravel] = useState(false)
  const [hasNightShifts, setHasNightShifts] = useState(false)
  const [requiresOwnCar, setRequiresOwnCar] = useState(false)
  const [requiresRelocation, setRequiresRelocation] = useState(false)
  const [requiresOvertime, setRequiresOvertime] = useState(false)
  const [isCommissionBased, setIsCommissionBased] = useState(false)
  const [weightPreset, setWeightPreset] = useState<'default'|'operations'|'technical'|'creative'|'sales'|'management'>('default')

  // Structured matching (0112)
  const [schedule, setSchedule] = useState<ScheduleValue>({
    start_time: '', end_time: '', days_per_week: '', off_day_pattern: '', shift_type: '',
  })
  const [minEducationLevel, setMinEducationLevel] = useState<string>('')
  const [minEducationClass, setMinEducationClass] = useState<string>('')
  const [requiredSkills, setRequiredSkills] = useState<string[]>([])
  const [preferredSkills, setPreferredSkills] = useState<string[]>([])
  const [languagesRequired, setLanguagesRequired] = useState<LanguageReq[]>([])
  const [environmentFlags, setEnvironmentFlags] = useState<string[]>([])
  const [openTo, setOpenTo] = useState<string[]>([])
  const [headcount, setHeadcount] = useState<number>(1)
  const [reportsToTitle, setReportsToTitle] = useState('')
  const [directTeamSize, setDirectTeamSize] = useState<number | ''>('')
  const [probationMonths, setProbationMonths] = useState<number | ''>('')
  const [interviewProcess, setInterviewProcess] = useState<string>('')
  const [startUrgency, setStartUrgency] = useState<string>('')
  const [eligibilityWorkAuth, setEligibilityWorkAuth] = useState<string[]>([])

  // Non-negotiables (free-text + AI atoms)
  const [nnText, setNnText] = useState('')
  const [nnAtoms, setNnAtoms] = useState<NNAtom[]>([])

  const [marketWarning, setMarketWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [dbDraftSaving, setDbDraftSaving] = useState(false)
  const [cloudSaved, setCloudSaved] = useState(false)
  const [dbDraftOffer, setDbDraftOffer] = useState<{ data: Record<string, unknown>; updatedAt: string } | null>(null)
  const didMount = useRef(false)
  const submittingRef = useRef(false)

  function collectDraft() {
    return {
      title, description, department, location, locationPostcode, industry,
      acceptNoExperience, workArr, experience, salaryMin, salaryMax,
      requiredTraits, employmentType, hourlyRate, durationDays, startDate,
      requiresWeekend, requiresDrivingLicense, requiresTravel, hasNightShifts,
      requiresOwnCar, requiresRelocation, requiresOvertime, isCommissionBased,
      weightPreset, schedule, minEducationLevel, minEducationClass,
      requiredSkills, preferredSkills, languagesRequired, environmentFlags,
      openTo, headcount, reportsToTitle, directTeamSize, probationMonths,
      interviewProcess, startUrgency, eligibilityWorkAuth, nnText, nnAtoms,
      teamSize, teamMembers,
    }
  }

  function applyDraftData(d: Record<string, unknown>) {
    if (typeof d.title === 'string') setTitle(d.title)
    if (typeof d.description === 'string') setDescription(d.description)
    if (typeof d.department === 'string') setDepartment(d.department)
    if (typeof d.location === 'string') setLocation(d.location)
    if (typeof d.locationPostcode === 'string') setLocationPostcode(d.locationPostcode)
    if (typeof d.industry === 'string') setIndustry(d.industry)
    if (typeof d.acceptNoExperience === 'boolean') setAcceptNoExperience(d.acceptNoExperience)
    if (typeof d.workArr === 'string') setWorkArr(d.workArr as typeof workArr)
    if (typeof d.experience === 'string') setExperience(d.experience as typeof experience)
    if (typeof d.salaryMin === 'number') setSalaryMin(d.salaryMin)
    if (typeof d.salaryMax === 'number') setSalaryMax(d.salaryMax)
    if (Array.isArray(d.requiredTraits)) setRequiredTraits(d.requiredTraits as string[])
    if (typeof d.employmentType === 'string') setEmploymentType(d.employmentType as typeof employmentType)
    if (typeof d.hourlyRate === 'number') setHourlyRate(d.hourlyRate)
    if (d.durationDays !== undefined) setDurationDays(d.durationDays as number | '')
    if (typeof d.startDate === 'string') setStartDate(d.startDate)
    if (typeof d.requiresWeekend === 'boolean') setRequiresWeekend(d.requiresWeekend)
    if (typeof d.requiresDrivingLicense === 'boolean') setRequiresDrivingLicense(d.requiresDrivingLicense)
    if (typeof d.requiresTravel === 'boolean') setRequiresTravel(d.requiresTravel)
    if (typeof d.hasNightShifts === 'boolean') setHasNightShifts(d.hasNightShifts)
    if (typeof d.requiresOwnCar === 'boolean') setRequiresOwnCar(d.requiresOwnCar)
    if (typeof d.requiresRelocation === 'boolean') setRequiresRelocation(d.requiresRelocation)
    if (typeof d.requiresOvertime === 'boolean') setRequiresOvertime(d.requiresOvertime)
    if (typeof d.isCommissionBased === 'boolean') setIsCommissionBased(d.isCommissionBased)
    if (typeof d.weightPreset === 'string') setWeightPreset(d.weightPreset as typeof weightPreset)
    if (d.schedule && typeof d.schedule === 'object') setSchedule(d.schedule as ScheduleValue)
    if (typeof d.minEducationLevel === 'string') setMinEducationLevel(d.minEducationLevel)
    if (typeof d.minEducationClass === 'string') setMinEducationClass(d.minEducationClass)
    if (Array.isArray(d.requiredSkills)) setRequiredSkills(d.requiredSkills as string[])
    if (Array.isArray(d.preferredSkills)) setPreferredSkills(d.preferredSkills as string[])
    if (Array.isArray(d.languagesRequired)) setLanguagesRequired(d.languagesRequired as LanguageReq[])
    if (Array.isArray(d.environmentFlags)) setEnvironmentFlags(d.environmentFlags as string[])
    if (Array.isArray(d.openTo)) setOpenTo(d.openTo as string[])
    if (typeof d.headcount === 'number') setHeadcount(d.headcount)
    if (typeof d.reportsToTitle === 'string') setReportsToTitle(d.reportsToTitle)
    if (d.directTeamSize !== undefined) setDirectTeamSize(d.directTeamSize as number | '')
    if (d.probationMonths !== undefined) setProbationMonths(d.probationMonths as number | '')
    if (typeof d.interviewProcess === 'string') setInterviewProcess(d.interviewProcess)
    if (typeof d.startUrgency === 'string') setStartUrgency(d.startUrgency)
    if (Array.isArray(d.eligibilityWorkAuth)) setEligibilityWorkAuth(d.eligibilityWorkAuth as string[])
    if (typeof d.nnText === 'string') setNnText(d.nnText)
    if (Array.isArray(d.nnAtoms)) setNnAtoms(d.nnAtoms as NNAtom[])
    if (typeof d.teamSize === 'number' || d.teamSize === '') setTeamSize(d.teamSize as number | '')
    if (Array.isArray(d.teamMembers)) setTeamMembers(d.teamMembers as TeamMember[])
  }

  async function generateDraft() {
    setDraftErr(null)
    if (!title.trim()) {
      setDraftErr('Type a role title first — the draft is built from it.')
      return
    }
    setDrafting(true)
    try {
      const res = await callFunction<{ description: string }>('draft-role-description', {
        title: title.trim(),
        location: location || undefined,
        employment_type: employmentType,
        weight_preset: weightPreset === 'default' ? undefined : weightPreset,
        industry: industry.trim() || undefined,
      })
      if (res?.description) setDescription(res.description)
      else setDraftErr('No draft returned. Try again.')
    } catch (e) {
      setDraftErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDrafting(false)
    }
  }

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    void (async () => {
      const { data: hm, error } = await hmIdByProfileId(userId)
      if (cancelled) return
      if (error) { setErr(error.message); setLoading(false); return }
      setHmId(hm?.id ?? null)

      // Edit mode: load the existing role and pre-fill every form field.
      if (editRoleId && hm?.id) {
        const { data: role, error: roleErr } = await getRoleFullById(editRoleId)
        if (cancelled) return
        if (roleErr) setErr(roleErr.message)
        else if (!role) setErr('Role not found.')
        else if (role.hiring_manager_id !== hm.id) setErr('You are not the owner of this role.')
        else {
          setTitle(role.title ?? '')
          setDescription(role.description ?? '')
          setDepartment(role.department ?? '')
          setLocation(role.location ?? 'Kuala Lumpur')
          setLocationPostcode(role.location_postcode ?? '')
          setIndustry(role.industry ?? '')
          setAcceptNoExperience(!!role.accept_no_experience)
          if (role.work_arrangement) setWorkArr(role.work_arrangement as typeof workArr)
          if (role.experience_level) setExperience(role.experience_level as typeof experience)
          setSalaryMin(role.salary_min ?? 0)
          setSalaryMax(role.salary_max ?? 0)
          setRequiredTraits(role.required_traits ?? [])
          if (role.employment_type) setEmploymentType(role.employment_type as typeof employmentType)
          setHourlyRate(role.hourly_rate ?? 0)
          setDurationDays(role.duration_days ?? '')
          setStartDate(role.start_date ?? '')
          setRequiresWeekend(!!role.requires_weekend)
          setRequiresDrivingLicense(!!role.requires_driving_license)
          setRequiresTravel(!!role.requires_travel)
          setHasNightShifts(!!role.has_night_shifts)
          setRequiresOwnCar(!!role.requires_own_car)
          setRequiresRelocation(!!role.requires_relocation)
          setRequiresOvertime(!!role.requires_overtime)
          setIsCommissionBased(!!role.is_commission_based)
          if (role.weight_preset) setWeightPreset(role.weight_preset as typeof weightPreset)
          setSchedule({
            start_time: role.schedule_start_time ?? '',
            end_time: role.schedule_end_time ?? '',
            days_per_week: role.days_per_week ?? '',
            off_day_pattern: (role.off_day_pattern ?? '') as ScheduleValue['off_day_pattern'],
            shift_type: (role.shift_type ?? '') as ScheduleValue['shift_type'],
          })
          setMinEducationLevel(role.min_education_level ?? '')
          setMinEducationClass(role.min_education_class ?? '')
          setRequiredSkills(role.required_skills ?? [])
          setPreferredSkills(role.preferred_skills ?? [])
          setLanguagesRequired((role.languages_required as unknown as LanguageReq[]) ?? [])
          setEnvironmentFlags(role.environment_flags ?? [])
          setOpenTo(role.open_to ?? [])
          setHeadcount(role.headcount ?? 1)
          setReportsToTitle(role.reports_to_title ?? '')
          setDirectTeamSize(role.direct_team_size ?? '')
          setProbationMonths(role.probation_months ?? '')
          setInterviewProcess(role.interview_process ?? '')
          setStartUrgency(role.start_urgency ?? '')
          setEligibilityWorkAuth(role.eligibility_work_auth ?? [])
          setNnText(role.non_negotiables_text ?? '')
          setNnAtoms((role.non_negotiables_atoms as unknown as NNAtom[]) ?? [])
          setFromOnboarding(!!role.from_onboarding)
          setRoleStatus(role.status ?? null)
        }
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId, editRoleId])

  useEffect(() => {
    const n = typeof teamSize === 'number' ? Math.max(0, Math.min(50, teamSize)) : 0
    setTeamMembers((prev) => {
      if (prev.length === n) return prev
      const next = prev.slice(0, n)
      while (next.length < n) next.push({ dob: '', gender: '' })
      return next
    })
  }, [teamSize])

  useEffect(() => {
    if (!title || !salaryMin || !salaryMax) { setMarketWarning(null); return }
    let cancelled = false
    getMarketRate(title, location, experience)
      .then(({ data }) => {
        if (cancelled || !data) { setMarketWarning(null); return }
        const below = salaryMax < (data.min_salary ?? 0)
        const above = salaryMin > (data.max_salary ?? 0)
        if (below) setMarketWarning(`Your range is below market for ${location} ${experience} ${title}: RM ${fmt(data.min_salary)}–${fmt(data.max_salary)} (median RM ${fmt(data.median_salary)}).`)
        else if (above) setMarketWarning(`Your range is above market for ${location} ${experience} ${title}: RM ${fmt(data.min_salary)}–${fmt(data.max_salary)} (median RM ${fmt(data.median_salary)}).`)
        else setMarketWarning(null)
      })
    return () => { cancelled = true }
  }, [title, location, experience, salaryMin, salaryMax])

  // Draft restore — run once on mount. Skipped in edit mode (role is the source).
  useEffect(() => {
    if (isEdit) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw) as Record<string, unknown>
      applyDraftData(d)
      setHasDraft(true)
    } catch {
      localStorage.removeItem(DRAFT_KEY)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Draft autosave — debounced 600 ms, skips first mount. Disabled in edit mode.
  useEffect(() => {
    if (isEdit) return
    if (!didMount.current) { didMount.current = true; return }
    const timer = setTimeout(() => {
      // Serialize inside the debounced callback so the full-draft stringify only
      // runs after typing settles (not on every keystroke). The surviving effect
      // run holds the latest state in its closure, so this produces the same
      // payload the pre-debounce stringify would have.
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    }, 600)
    return () => clearTimeout(timer)
  }, [ // eslint-disable-line react-hooks/exhaustive-deps
    title, description, department, location, locationPostcode, industry,
    acceptNoExperience, workArr, experience, salaryMin, salaryMax,
    requiredTraits, employmentType, hourlyRate, durationDays, startDate,
    requiresWeekend, requiresDrivingLicense, requiresTravel, hasNightShifts,
    requiresOwnCar, requiresRelocation, requiresOvertime, isCommissionBased,
    weightPreset, schedule, minEducationLevel, minEducationClass,
    requiredSkills, preferredSkills, languagesRequired, environmentFlags,
    openTo, headcount, reportsToTitle, directTeamSize, probationMonths,
    interviewProcess, startUrgency, eligibilityWorkAuth, nnText, nnAtoms,
    teamSize, teamMembers,
  ])

  // DB draft check — only when no localStorage draft was found after hmId loads
  useEffect(() => {
    if (isEdit || !hmId || hasDraft) return
    getRoleDraft(hmId)
      .then(({ data, error }) => {
        if (error) return // tolerate — user simply won't see the restore banner
        if (data?.draft_data) {
          setDbDraftOffer({ data: data.draft_data as Record<string, unknown>, updatedAt: data.updated_at })
        }
      })
  }, [hmId, hasDraft]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTrait(t: string) {
    setRequiredTraits((xs) => xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t])
  }

  async function saveToCloud() {
    if (!hmId) return
    setDbDraftSaving(true)
    try {
      const { error } = await saveRoleDraft(hmId, collectDraft())
      if (error) throw error
      setCloudSaved(true)
      setTimeout(() => setCloudSaved(false), 2000)
    } catch { /* tolerate */ }
    finally { setDbDraftSaving(false) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submittingRef.current) return
    setErr(null)
    if (!hmId) { setErr('No hiring manager profile found.'); return }
    if (requiredTraits.length === 0) { setErr('Pick at least one required trait.'); return }
    {
      const salaryErr = validateSalaryRange(salaryMin, salaryMax, {
        minMaxMessage: 'Salary min must be less than or equal to max.',
      })
      if (salaryErr) { setErr(salaryErr); return }
    }

    submittingRef.current = true
    setBusy(true)
    // Use a client-generated ID so we can verify whether the INSERT committed
    // even if the network response arrives after our timeout.
    const roleId = crypto.randomUUID()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      // Status guardrail: INSERT always activates; UPDATE only activates when
      // re-opening an onboarding draft (fromOnboarding && paused), otherwise
      // `status` is omitted so the row's existing value is preserved. This keeps
      // the re-pointed MyRoles / ModerationPanel "Edit" buttons from silently
      // reactivating a paused role. No-op for the onboarding-activate caller.
      const statusPatch = resolveRoleStatus({
        mode: isEdit ? 'update' : 'insert',
        fromOnboarding,
        current: roleStatus,
      })
      const payload = {
        hiring_manager_id: hmId, title,
        description: description || null, department: department || null,
        location: location || null,
        location_postcode: locationPostcode.trim() || null,
        industry: industry.trim() || null,
        accept_no_experience: acceptNoExperience,
        work_arrangement: workArr, experience_level: experience,
        salary_min: salaryMin || null, salary_max: salaryMax || null,
        required_traits: requiredTraits, ...statusPatch,
        employment_type: employmentType,
        hourly_rate: employmentType === 'gig' || employmentType === 'part_time' || employmentType === 'contract' ? (hourlyRate || null) : null,
        duration_days: durationDays === '' ? null : Number(durationDays),
        start_date: startDate || null,
        requires_weekend: requiresWeekend,
        requires_driving_license: requiresDrivingLicense,
        requires_travel: requiresTravel,
        has_night_shifts: hasNightShifts,
        requires_own_car: requiresOwnCar,
        requires_relocation: requiresRelocation,
        requires_overtime: requiresOvertime,
        is_commission_based: isCommissionBased,
        weight_preset: weightPreset === 'default' ? null : weightPreset,
        // ── 0112 structured fields ─────────────────────────────────────────
        schedule_start_time: schedule.start_time || null,
        schedule_end_time:   schedule.end_time   || null,
        days_per_week:       schedule.days_per_week === '' ? null : schedule.days_per_week,
        off_day_pattern:     schedule.off_day_pattern || null,
        shift_type:          schedule.shift_type      || null,
        min_education_level: minEducationLevel || null,
        min_education_class: minEducationClass || null,
        required_skills:     requiredSkills,
        preferred_skills:    preferredSkills,
        languages_required:  languagesRequired,
        environment_flags:   environmentFlags,
        open_to:             openTo,
        headcount:           headcount || 1,
        reports_to_title:    reportsToTitle.trim() || null,
        direct_team_size:    directTeamSize === '' ? null : directTeamSize,
        probation_months:    probationMonths === '' ? null : probationMonths,
        interview_process:   interviewProcess || null,
        start_urgency:       startUrgency || null,
        eligibility_work_auth: eligibilityWorkAuth,
        non_negotiables_text:  nnText.trim() || null,
        non_negotiables_atoms: nnAtoms,
        team_member_characters: buildTeamMemberCharacters(teamMembers),
      }

      const savedId = isEdit ? editRoleId! : roleId
      // languages_required / non_negotiables_atoms are interface[] (LanguageReq[]/NNAtom[])
      // that are structurally valid JSON but lack the index signature the generated Json
      // type demands — boundary-cast the payload; runtime object is unchanged.
      const { error: insErr } = isEdit
        ? await updateRole(editRoleId!, payload as unknown as Database['public']['Tables']['roles']['Update']).abortSignal(controller.signal)
        : await insertRole({ id: roleId, ...payload } as unknown as Database['public']['Tables']['roles']['Insert']).abortSignal(controller.signal)
      clearTimeout(timeoutId)

      if (insErr) throw insErr

      // If user typed non-negotiables but didn't click "Parse", run extraction now
      // and persist atoms. This keeps the matcher honest even when the HM skips the preview.
      if (nnText.trim() && nnAtoms.length === 0) {
        void callFunction('extract-non-negotiables', {
          side: 'hm', text: nnText.trim(), role_id: savedId,
        }).catch(() => {})
      }

      void callFunction('moderate-role', { role_id: savedId }).catch(() => {})
      void callFunction('match-generate', { role_id: savedId }).catch(() => {})
      localStorage.removeItem(DRAFT_KEY)
      void deleteRoleDraft(hmId)
      // Post-save redirect: PostRole always lands on the HM dashboard (/hm),
      // for both new posts and edits. (EditRole — still mounted for stale-loop
      // nudge links — instead returns to /hm/roles.) We intentionally keep the
      // /hm target so the re-pointed "Edit" entry points share the post-role
      // success destination; the dashboard surfaces the updated role.
      navigate('/hm', { replace: true })
    } catch (e) {
      clearTimeout(timeoutId)
      // AbortError means our 30s timeout fired. Check whether the INSERT was
      // actually committed server-side (can happen when the response arrives
      // just after the abort). If so, proceed as success.
      if (e instanceof Error && e.name === 'AbortError') {
        const checkId = isEdit ? editRoleId! : roleId
        const { data: committed } = await getRoleCommitCheck(checkId)
        // Fresh insert: row exists = committed. Edit: the row always exists, so
        // the only cheap positive commit signal is the status flipping to active
        // (the onboarding-draft activation case). A plain field edit that keeps
        // the existing status can't be confirmed this way, so we conservatively
        // fall through to the "timed out — try again" path; updates are
        // idempotent, so a retry is safe.
        const didCommit = isEdit ? committed?.status === 'active' : !!committed
        if (didCommit) {
          void callFunction('moderate-role', { role_id: checkId }).catch(() => {})
          void callFunction('match-generate', { role_id: checkId }).catch(() => {})
          localStorage.removeItem(DRAFT_KEY)
          void deleteRoleDraft(hmId)
          navigate('/hm', { replace: true })
          return
        }
        setErr('Request timed out — check your connection and try again.')
        return
      }
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false); submittingRef.current = false }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader title="Post a role" description="Tell us about the role you want to fill." />
        <Card><div className="p-6"><FormSkeleton fields={12} /></div></Card>
      </div>
    )
  }
  if (!hmId) {
    return (
      <div className="max-w-xl mx-auto">
        <Alert tone="red" title="No hiring-manager profile">
          Ask your HR contact to re-send your invitation.
        </Alert>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PostRoleHeader isEdit={isEdit} fromOnboarding={fromOnboarding} />

      <DraftBanners
        hasDraft={hasDraft}
        dbDraftOffer={dbDraftOffer}
        onDiscardLocalDraft={() => { localStorage.removeItem(DRAFT_KEY); window.location.reload() }}
        onRestoreCloudDraft={(data) => { applyDraftData(data); setDbDraftOffer(null); setHasDraft(true) }}
        onDiscardCloudDraft={() => { setDbDraftOffer(null); void deleteRoleDraft(hmId!) }}
      />

      <Card>
        <form onSubmit={submit} className="p-4 md:p-6 space-y-4">

          {/* ── Basics ──────────────────────────────────────────────────── */}
          <BasicsSection
            title={title} setTitle={setTitle}
            description={description} setDescription={setDescription}
            department={department} setDepartment={setDepartment}
            location={location} setLocation={setLocation}
            locationPostcode={locationPostcode} setLocationPostcode={setLocationPostcode}
            industry={industry} setIndustry={setIndustry}
            drafting={drafting} draftErr={draftErr}
            onGenerateDraft={generateDraft}
          />

          {/* ── Compensation & employment type ───────────────────────────── */}
          <CompensationSection
            workArr={workArr} setWorkArr={setWorkArr}
            experience={experience} setExperience={setExperience}
            employmentType={employmentType} setEmploymentType={setEmploymentType}
            hourlyRate={hourlyRate} setHourlyRate={setHourlyRate}
            salaryMin={salaryMin} setSalaryMin={setSalaryMin}
            salaryMax={salaryMax} setSalaryMax={setSalaryMax}
            durationDays={durationDays} setDurationDays={setDurationDays}
            startDate={startDate} setStartDate={setStartDate}
            acceptNoExperience={acceptNoExperience} setAcceptNoExperience={setAcceptNoExperience}
            marketWarning={marketWarning}
          />

          {/* ── Schedule & shift ─────────────────────────────────────────── */}
          <FormSection
            title="Schedule & shift"
            description="Help candidates self-filter on working hours and shift pattern."
            defaultOpen={false}
          >
            <ScheduleBlock value={schedule} onChange={setSchedule} />
          </FormSection>

          {/* ── Education, skills, languages ─────────────────────────────── */}
          <EducationSkillsSection
            minEducationLevel={minEducationLevel} setMinEducationLevel={setMinEducationLevel}
            minEducationClass={minEducationClass} setMinEducationClass={setMinEducationClass}
            requiredSkills={requiredSkills} setRequiredSkills={setRequiredSkills}
            preferredSkills={preferredSkills} setPreferredSkills={setPreferredSkills}
            languagesRequired={languagesRequired} setLanguagesRequired={setLanguagesRequired}
          />

          {/* ── Work environment ─────────────────────────────────────────── */}
          <FormSection
            title="Work environment"
            description="Physical / sensory conditions this role involves."
            defaultOpen={false}
          >
            <EnvironmentFlags value={environmentFlags} onChange={setEnvironmentFlags} />
          </FormSection>

          {/* ── Role logistics ───────────────────────────────────────────── */}
          <RoleLogisticsSection
            headcount={headcount} setHeadcount={setHeadcount}
            directTeamSize={directTeamSize} setDirectTeamSize={setDirectTeamSize}
            reportsToTitle={reportsToTitle} setReportsToTitle={setReportsToTitle}
            probationMonths={probationMonths} setProbationMonths={setProbationMonths}
            interviewProcess={interviewProcess} setInterviewProcess={setInterviewProcess}
          />

          {/* ── Eligibility & urgency ────────────────────────────────────── */}
          <EligibilityUrgencySection
            startUrgency={startUrgency} setStartUrgency={setStartUrgency}
            openTo={openTo} setOpenTo={setOpenTo}
            eligibilityWorkAuth={eligibilityWorkAuth} setEligibilityWorkAuth={setEligibilityWorkAuth}
          />

          {/* ── Hard filters (existing booleans) ─────────────────────────── */}
          <HardFiltersSection
            requiresWeekend={requiresWeekend}                 setRequiresWeekend={setRequiresWeekend}
            requiresDrivingLicense={requiresDrivingLicense}   setRequiresDrivingLicense={setRequiresDrivingLicense}
            requiresTravel={requiresTravel}                   setRequiresTravel={setRequiresTravel}
            hasNightShifts={hasNightShifts}                   setHasNightShifts={setHasNightShifts}
            requiresOwnCar={requiresOwnCar}                   setRequiresOwnCar={setRequiresOwnCar}
            requiresRelocation={requiresRelocation}           setRequiresRelocation={setRequiresRelocation}
            requiresOvertime={requiresOvertime}               setRequiresOvertime={setRequiresOvertime}
            isCommissionBased={isCommissionBased}             setIsCommissionBased={setIsCommissionBased}
          />

          {/* ── Non-negotiables (free-text + AI atoms) ───────────────────── */}
          <FormSection
            title="Non-negotiables"
            description="Anything else that's an absolute deal-breaker for this role."
            defaultOpen
          >
            <NonNegotiablesInput
              text={nnText}
              atoms={nnAtoms}
              onChange={({ text, atoms }) => { setNnText(text); setNnAtoms(atoms) }}
              side="hm"
            />
          </FormSection>

          {/* ── Matching profile + traits ────────────────────────────────── */}
          <FormSection title="Matching profile" defaultOpen>
            <Select
              label="Matching profile"
              hint="Shifts which signals the engine prioritises for this role. Leave on Default if unsure."
              value={weightPreset}
              onChange={(e) => setWeightPreset(e.target.value as typeof weightPreset)}
            >
              <option value="default">Default — balanced weights</option>
              <option value="operations">Operations — reliability, culture, feedback</option>
              <option value="technical">Technical — hard skills, background, behavioural rigour</option>
              <option value="creative">Creative — culture fit, style, background</option>
              <option value="sales">Sales — relationship signals, character, HM feedback</option>
              <option value="management">Management — leadership behaviourals, culture, seniority</option>
            </Select>

            <TraitPicker requiredTraits={requiredTraits} onToggle={toggleTrait} />
          </FormSection>

          {/* ── Team-dynamic reference (kept last) ───────────────────────── */}
          <TeamDynamicSection
            teamSize={teamSize}
            setTeamSize={setTeamSize}
            teamMembers={teamMembers}
            setTeamMembers={setTeamMembers}
          />

          {err && <Alert tone="red">{err}</Alert>}

          <FormActions
            busy={busy}
            draftSaved={draftSaved}
            cloudSaved={cloudSaved}
            dbDraftSaving={dbDraftSaving}
            hmId={hmId}
            title={title}
            requiredTraits={requiredTraits}
            isEdit={isEdit}
            fromOnboarding={fromOnboarding}
            onCancel={() => navigate('/hm')}
            onSaveDraft={() => void saveToCloud()}
          />
        </form>
      </Card>
    </div>
  )
}
