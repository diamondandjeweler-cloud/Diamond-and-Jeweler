// _shared/non-negotiables.ts
//
// Atom vocabulary + validators shared between the extract-non-negotiables
// Edge Function and match-core scoring. Keep this file's exported types in
// sync with the JSONB shape stored in roles.non_negotiables_atoms and
// talents.priority_concerns_atoms.

export type AtomType =
  | 'salary_floor'
  | 'salary_ceiling'
  | 'min_qualification'
  | 'required_certification'
  | 'company_size'
  | 'industry_only'
  | 'industry_exclude'
  | 'work_arrangement_strict'
  | 'schedule_strict'
  | 'free_text'

export type EducationLevel =
  | 'none' | 'spm' | 'diploma' | 'professional_cert'
  | 'degree' | 'masters' | 'phd'

export type EducationClass =
  | 'pass' | 'third' | 'second_lower' | 'second_upper' | 'first'

export type CompanySize =
  | 'startup' | 'sme' | 'mnc' | 'enterprise' | 'govt' | 'ngo'

export type WorkArrangement = 'remote' | 'hybrid' | 'onsite'

export interface AtomSalaryFloor    { type: 'salary_floor';    value: number; currency?: 'MYR' }
export interface AtomSalaryCeiling  { type: 'salary_ceiling';  value: number; currency?: 'MYR' }
export interface AtomMinQual        { type: 'min_qualification'; value: EducationLevel; class?: EducationClass }
export interface AtomRequiredCert   { type: 'required_certification'; value: string }
export interface AtomCompanySize    { type: 'company_size';    value: CompanySize[] }
export interface AtomIndustryOnly   { type: 'industry_only';   value: string[] }
export interface AtomIndustryExclude{ type: 'industry_exclude';value: string[] }
export interface AtomWorkArrStrict  { type: 'work_arrangement_strict'; value: WorkArrangement }
export interface AtomScheduleStrict { type: 'schedule_strict'; value: string }
export interface AtomFreeText       { type: 'free_text';       value: string; confidence?: number }

export type Atom =
  | AtomSalaryFloor | AtomSalaryCeiling | AtomMinQual | AtomRequiredCert
  | AtomCompanySize | AtomIndustryOnly | AtomIndustryExclude
  | AtomWorkArrStrict | AtomScheduleStrict | AtomFreeText

const EDU_VALUES: ReadonlyArray<EducationLevel> = [
  'none', 'spm', 'diploma', 'professional_cert', 'degree', 'masters', 'phd',
] as const
const CLASS_VALUES: ReadonlyArray<EducationClass> = [
  'pass', 'third', 'second_lower', 'second_upper', 'first',
] as const
const SIZE_VALUES: ReadonlyArray<CompanySize> = [
  'startup', 'sme', 'mnc', 'enterprise', 'govt', 'ngo',
] as const
const WA_VALUES: ReadonlyArray<WorkArrangement> = ['remote', 'hybrid', 'onsite'] as const

// Sanity caps. AI sometimes hallucinates outsized numbers — we clamp to safety.
const SALARY_MIN = 0
const SALARY_MAX = 200_000     // RM 200k / month ceiling

export function validateAtoms(raw: unknown): Atom[] {
  if (!Array.isArray(raw)) return []
  const out: Atom[] = []
  for (const item of raw) {
    const atom = validateAtom(item)
    if (atom) out.push(atom)
  }
  // Dedupe (type+value JSON key)
  const seen = new Set<string>()
  return out.filter((a) => {
    const k = `${a.type}:${JSON.stringify((a as { value: unknown }).value)}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

function validateAtom(item: unknown): Atom | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const type = typeof o.type === 'string' ? o.type : null
  if (!type) return null

  switch (type) {
    case 'salary_floor':
    case 'salary_ceiling': {
      const v = Number(o.value)
      if (!Number.isFinite(v) || v < SALARY_MIN || v > SALARY_MAX) return null
      return { type, value: Math.round(v), currency: 'MYR' } as Atom
    }
    case 'min_qualification': {
      const v = String(o.value ?? '').toLowerCase()
      if (!EDU_VALUES.includes(v as EducationLevel)) return null
      const cls = typeof o.class === 'string' ? o.class.toLowerCase() : undefined
      return {
        type: 'min_qualification',
        value: v as EducationLevel,
        ...(cls && CLASS_VALUES.includes(cls as EducationClass) ? { class: cls as EducationClass } : {}),
      }
    }
    case 'required_certification': {
      const v = String(o.value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
      if (!v) return null
      return { type: 'required_certification', value: v }
    }
    case 'company_size': {
      const arr = Array.isArray(o.value) ? o.value : []
      const filtered = arr
        .map((x) => String(x).toLowerCase())
        .filter((x): x is CompanySize => SIZE_VALUES.includes(x as CompanySize))
      if (filtered.length === 0) return null
      return { type: 'company_size', value: filtered }
    }
    case 'industry_only':
    case 'industry_exclude': {
      const arr = Array.isArray(o.value) ? o.value : []
      const filtered = arr.map((x) => String(x).trim().toLowerCase()).filter(Boolean)
      if (filtered.length === 0) return null
      return { type, value: filtered } as Atom
    }
    case 'work_arrangement_strict': {
      const v = String(o.value ?? '').toLowerCase()
      if (!WA_VALUES.includes(v as WorkArrangement)) return null
      return { type: 'work_arrangement_strict', value: v as WorkArrangement }
    }
    case 'schedule_strict': {
      const v = String(o.value ?? '').trim()
      if (!v) return null
      return { type: 'schedule_strict', value: v.slice(0, 200) }
    }
    case 'free_text': {
      const v = String(o.value ?? '').trim()
      if (!v) return null
      const confRaw = Number(o.confidence)
      const conf = Number.isFinite(confRaw) ? Math.min(1, Math.max(0, confRaw)) : 0.6
      return { type: 'free_text', value: v.slice(0, 500), confidence: conf }
    }
    default:
      return null
  }
}

// Builds the LLM prompt. Same shape for both sides; the "side" inflects examples.
export function buildExtractionPrompt(text: string, side: 'hm' | 'talent'): string {
  const ctx = side === 'hm'
    ? 'A hiring manager listed these as non-negotiable requirements for their role'
    : 'A job seeker listed these as their absolute deal-breakers — things they will NOT accept'

  return `${ctx}:

"""
${text.slice(0, 2000)}
"""

Parse this into structured atoms. Return ONLY a JSON array — no markdown fences, no commentary.

Allowed atom shapes:
- { "type": "salary_floor",          "value": <integer RM/month> }
- { "type": "salary_ceiling",        "value": <integer RM/month> }
- { "type": "min_qualification",     "value": "spm|diploma|professional_cert|degree|masters|phd",
                                     "class": "pass|third|second_lower|second_upper|first" (optional) }
- { "type": "required_certification","value": "<slug, snake_case>" }
- { "type": "company_size",          "value": ["startup"|"sme"|"mnc"|"enterprise"|"govt"|"ngo", ...] }
- { "type": "industry_only",         "value": ["<industry-slug>", ...] }
- { "type": "industry_exclude",      "value": ["<industry-slug>", ...] }
- { "type": "work_arrangement_strict","value": "remote"|"hybrid"|"onsite" }
- { "type": "schedule_strict",       "value": "<short human-readable phrase>" }
- { "type": "free_text",             "value": "<verbatim or paraphrased clause>", "confidence": 0.0-1.0 }

Rules:
- Be conservative — only output an atom when the constraint is explicit.
- Convert salary phrases ("RM 8k", "8000 minimum", "lapan ribu") to integer values.
- "2nd class upper" / "2:1" / "second class upper" → class: "second_upper".
- "Must work in MNC only" → company_size: ["mnc"].
- "Only F&B industry" → industry_only: ["fnb"]. "No alcohol/gambling" → industry_exclude.
- "Must have ACCA Part II" → required_certification: "acca_part_qual".
- For any clause that doesn't fit the above, emit a free_text atom verbatim.
- Examples (do not include in output):
    "Min RM 8000" → { "type": "salary_floor", "value": 8000 }
    "Must have degree with 2nd class upper" → { "type": "min_qualification", "value": "degree", "class": "second_upper" }
    "MNC only" → { "type": "company_size", "value": ["mnc"] }
- Output an EMPTY ARRAY [] if nothing extractable.`.trim()
}

// Map atoms to legacy structured fields where possible. Returns side-effect
// patches that the caller can apply to the appropriate table.
export function deriveLegacyPatches(atoms: Atom[], side: 'hm' | 'talent'): {
  // Talent-side legacy patches
  talentDealBreakers?: Record<string, unknown>
  // HM-side legacy patches  (applied to hiring_managers.must_haves)
  hmMustHaves?: Record<string, unknown>
} {
  const out: ReturnType<typeof deriveLegacyPatches> = {}
  if (side === 'talent') {
    const patches: Record<string, unknown> = {}
    for (const a of atoms) {
      if (a.type === 'salary_floor') patches.min_salary_hard = a.value
      else if (a.type === 'work_arrangement_strict' && a.value === 'remote') patches.remote_only = true
    }
    if (Object.keys(patches).length > 0) out.talentDealBreakers = patches
  } else {
    const patches: Record<string, unknown> = {}
    for (const a of atoms) {
      if (a.type === 'min_qualification') patches.min_qualification = a.value
    }
    if (Object.keys(patches).length > 0) out.hmMustHaves = patches
  }
  return out
}
