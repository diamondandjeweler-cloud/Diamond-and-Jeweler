/**
 * Org Chart Consultant — shared types, tiers, archetypes & compute.
 *
 * BaZi-secrecy invariant: this file MUST NOT export raw life-chart terminology
 * (八字 / BaZi / day master / heavenly stem / earthly branch) in any string
 * that can land in the UI. Use the sanitiser in `./orgChartSanitiser` before
 * persisting any text that flows through `report_html`.
 */

export type OrgTierCode =
  | 't1_5' | 't6_10' | 't11_15' | 't16_20' | 't21_25'
  | 't26_30' | 't31_35' | 't36_40' | 't41_45' | 't46_50'

export interface OrgTier {
  code: OrgTierCode
  min: number
  max: number
  price: number
}

export const ORG_TIERS: OrgTier[] = [
  { code: 't1_5',   min: 1,  max: 5,  price: 99   },
  { code: 't6_10',  min: 6,  max: 10, price: 399  },
  { code: 't11_15', min: 11, max: 15, price: 699  },
  { code: 't16_20', min: 16, max: 20, price: 999  },
  { code: 't21_25', min: 21, max: 25, price: 1499 },
  { code: 't26_30', min: 26, max: 30, price: 1999 },
  { code: 't31_35', min: 31, max: 35, price: 2499 },
  { code: 't36_40', min: 36, max: 40, price: 2999 },
  { code: 't41_45', min: 41, max: 45, price: 3499 },
  { code: 't46_50', min: 46, max: 50, price: 3999 },
]

export function orgTierForSize(size: number): OrgTier | null {
  return ORG_TIERS.find(t => size >= t.min && size <= t.max) ?? null
}

export interface OrgArchetype {
  code: string
  label: string
  hint: string
}

export const ORG_ARCHETYPES: OrgArchetype[] = [
  { code: 'leader',    label: 'Strategic Leader',   hint: 'sets direction, takes accountability' },
  { code: 'operator',  label: 'Operational Driver', hint: 'executes plans, hits targets' },
  { code: 'connector', label: 'People Connector',   hint: 'builds bridges, mediates' },
  { code: 'analyst',   label: 'Analytical Thinker', hint: 'pattern recognition, data-led' },
  { code: 'creator',   label: 'Creative Innovator', hint: 'new ideas, breaks moulds' },
  { code: 'guardian',  label: 'Quality Guardian',   hint: 'standards, follow-through' },
  { code: 'catalyst',  label: 'Growth Catalyst',    hint: 'energises others, drives change' },
  { code: 'mentor',    label: 'Capability Builder', hint: 'teaches, coaches, develops talent' },
]

export function orgArchetypeLabel(code: string | null | undefined): string {
  if (!code) return ''
  return ORG_ARCHETYPES.find(a => a.code === code)?.label ?? code
}

export interface OrgMember {
  name: string
  current_role: string
  dob: string
  dob_time?: string
  dob_city?: string
  gender?: '' | 'male' | 'female'
  archetype_code: string | null
  suggested_role: string | null
  fit_score: number | null
  notes?: string
}

export interface OrgPair {
  from_idx: number
  to_idx: number
  score: number
  code: string
}

export interface OrgAnalysis {
  leadership_cluster: number[]
  conflict_pairs: Array<{ a: number; b: number; severity: number }>
  missing_archetypes: string[]
  overall_summary: string
  generated_at: string
}

export interface OrgConsultationRow {
  id: number
  client_company: string
  client_contact_name: string | null
  client_contact_email: string | null
  client_contact_phone: string | null
  client_industry: string | null
  team_size: number
  tier_code: OrgTierCode
  price_myr: string | number
  payment_status: 'unpaid' | 'paid' | 'waived'
  payment_received_at: string | null
  payment_method: string | null
  payment_reference: string | null
  status: 'draft' | 'collecting' | 'analyzing' | 'completed' | 'delivered'
  delivered_at: string | null
  members: OrgMember[]
  pairs: OrgPair[]
  analysis: Partial<OrgAnalysis>
  report_html: string | null
  report_generated_at: string | null
  consultant_notes: string | null
  consultant_id: number | null
  created_by: number | null
  created_at: string
  updated_at: string
}

/**
 * Placeholder archetype mapping from DOB. NOT a real life-chart engine.
 * Replace with a server-side RPC once the engine is portable. Crucially:
 * ZERO internal terminology surfaces from this function.
 */
export function computeArchetype(member: Pick<OrgMember, 'dob' | 'name'>): { code: string; score: number } {
  if (!member.dob) return { code: 'analyst', score: 60 }
  const d = new Date(member.dob)
  if (isNaN(d.getTime())) return { code: 'analyst', score: 60 }
  const dayOfYear = Math.floor((d.valueOf() - new Date(d.getFullYear(), 0, 0).valueOf()) / 86_400_000)
  const idx = (dayOfYear + (member.name?.length ?? 0)) % ORG_ARCHETYPES.length
  const score = 60 + ((dayOfYear * 7) % 41) // 60..100
  return { code: ORG_ARCHETYPES[idx].code, score }
}

/** 0..100 — same archetype = mild friction, neighbouring = complementary. */
export function pairScore(a: OrgMember, b: OrgMember): number {
  const ai = ORG_ARCHETYPES.findIndex(x => x.code === a.archetype_code)
  const bi = ORG_ARCHETYPES.findIndex(x => x.code === b.archetype_code)
  if (ai < 0 || bi < 0) return 60
  const dist = Math.abs(ai - bi)
  if (dist === 0) return 55
  if (dist === 1) return 75
  if (dist === 2) return 85
  if (dist === 3) return 80
  return 70
}

/** Pure analysis function — takes raw members, returns enriched members + analysis. */
export function runAnalysis(membersIn: OrgMember[]): {
  members: OrgMember[]
  pairs: OrgPair[]
  analysis: OrgAnalysis
} {
  const members: OrgMember[] = membersIn.map(m => {
    const r = computeArchetype(m)
    return {
      ...m,
      archetype_code: r.code,
      fit_score: r.score,
      suggested_role: orgArchetypeLabel(r.code),
    }
  })

  const pairs: OrgPair[] = []
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      pairs.push({ from_idx: i, to_idx: j, score: pairScore(members[i], members[j]), code: '' })
    }
  }

  const leadership_cluster = members
    .map((m, idx) => ({ idx, m }))
    .filter(({ m }) => ['leader', 'operator', 'catalyst'].includes(m.archetype_code ?? ''))
    .sort((a, b) => (b.m.fit_score ?? 0) - (a.m.fit_score ?? 0))
    .slice(0, 3)
    .map(({ idx }) => idx)

  const conflict_pairs = pairs
    .filter(p => p.score < 60)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(p => ({ a: p.from_idx, b: p.to_idx, severity: 100 - p.score }))

  const present = new Set(members.map(m => m.archetype_code).filter(Boolean) as string[])
  const missing_archetypes = ORG_ARCHETYPES.filter(a => !present.has(a.code)).map(a => a.code)

  const traits = [...present].slice(0, 3).map(c => orgArchetypeLabel(c)).join(', ') || 'mixed traits'
  const overall_summary =
    `Team of ${members.length}. Strong in ${traits}. ` +
    (conflict_pairs.length
      ? `Watch ${conflict_pairs.length} potential friction pair(s).`
      : 'No high-friction pairs detected.')

  return {
    members,
    pairs,
    analysis: {
      leadership_cluster,
      conflict_pairs,
      missing_archetypes,
      overall_summary,
      generated_at: new Date().toISOString(),
    },
  }
}
