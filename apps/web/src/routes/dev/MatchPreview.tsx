import { Card, Badge, PageHeader } from '../../components/ui'
import MatchExplain from '../../components/MatchExplain'
import ScreeningChecklist from '../../components/ScreeningChecklist'
import type { PublicReasoning, CultureComparison } from '../../types/db'

const culture: CultureComparison = {
  talent_top_wants: ['wants_growth', 'wants_autonomy', 'wants_mentorship'],
  hm_top_offers: ['wants_growth', 'wants_autonomy', 'wants_collaboration'],
  overlap: ['wants_growth', 'wants_autonomy'],
  talent_only: ['wants_mentorship'],
  hm_only: ['wants_collaboration'],
  labels: {
    wants_growth: 'Career growth',
    wants_autonomy: 'Autonomy',
    wants_mentorship: 'Mentorship',
    wants_collaboration: 'Collaborative team',
  },
}

const reasoning: PublicReasoning = {
  score_band: 'strong',
  strengths: [
    '6 years building production React + TypeScript apps — directly maps to the front-end stack the role uses daily.',
    'Led 2 product launches end-to-end at LumiRetail; matches the ownership and delivery rhythm the team expects.',
    'Active mentor to 3 juniors at current employer — fits the team’s "lift others" culture signal.',
    'Salary expectation (RM 9,000–11,500) sits comfortably inside the approved RM 8,000–12,000 band.',
  ],
  watchouts: [
    'Career goal answer leans towards "individual contributor depth"; HM’s promotion path is people-management heavy.',
    'Two roles under 12 months earlier in career — worth understanding what changed in how they choose roles since.',
  ],
  matched_traits: ['react', 'typescript', 'product_ownership', 'mentorship', 'shipped_at_scale'],
  missing_traits: ['people_management', 'budget_ownership'],
  behavioral_tags: {
    ownership: 0.86,
    communication_clarity: 0.78,
    problem_solving: 0.81,
    resilience: 0.72,
    results_orientation: 0.74,
    professional_attitude: 0.83,
    coachability: 0.69,
    emotional_maturity: 0.71,
    confidence: 0.62,
  },
  culture_comparison: culture,
}

function CompatRing({ pct }: { pct: number }) {
  const radius = 20
  const circ = 2 * Math.PI * radius
  const offset = circ - (pct / 100) * circ
  const tone = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-accent-600' : 'text-ink-400'
  return (
    <div className="relative shrink-0" aria-label={`Compatibility ${pct} percent`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={radius} stroke="currentColor" className="text-ink-100" strokeWidth="4" fill="none" />
        <circle
          cx="26" cy="26" r={radius}
          stroke="currentColor"
          className={tone}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-semibold ${tone}`}>
        {pct}
      </span>
    </div>
  )
}

function CultureCompare({ comparison }: { comparison: CultureComparison }) {
  return (
    <div className="mt-3 border border-ink-100 rounded-lg p-3 bg-white">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-2">Culture alignment</p>
      <div className="flex flex-wrap gap-1.5">
        {comparison.overlap.map((k) => (
          <span key={k} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
            ✓ {comparison.labels[k] ?? k.replace('wants_', '')}
          </span>
        ))}
        {comparison.talent_only.map((k) => (
          <span key={k} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
            ~ {comparison.labels[k] ?? k.replace('wants_', '')}
          </span>
        ))}
      </div>
      <p className="text-xs text-ink-400 mt-1.5">
        <span className="mr-3">✓ aligned with your team</span>
        <span>~ talent wants this — confirm in interview</span>
      </p>
    </div>
  )
}

function TalentSideCard() {
  const pct = 84
  return (
    <Card hoverable>
      <div className="p-6">
        <div className="flex justify-between items-start gap-3 mb-3">
          <div>
            <h3 className="font-display text-xl text-ink-900 mb-0.5">Senior Frontend Engineer</h3>
            <div className="text-xs text-ink-500 flex gap-2 flex-wrap">
              <span>Kuala Lumpur</span>
              <span>·</span>
              <span className="capitalize">hybrid</span>
            </div>
          </div>
          <CompatRing pct={pct} />
        </div>

        <div className="mb-3 text-sm text-ink-700">
          <span className="font-medium">RM 8,000 – 12,000</span>
          <span className="text-ink-400"> / month</span>
        </div>

        <p className="text-sm text-ink-600 line-clamp-3 mb-4">
          Build customer-facing surfaces for our omnichannel retail platform. Own a feature area end-to-end, partner with design + backend, and mentor two juniors as the team grows.
        </p>

        <div className="mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">Your pitch for this role</p>
          <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">
            "Six years shipping React/TypeScript at scale; led two product launches end-to-end at LumiRetail; actively mentoring three juniors. Looking for a place where ownership + mentorship are the norm, not the exception."
          </p>
        </div>

        <Badge tone="brand">New match</Badge>

        <MatchExplain reasoning={reasoning} />
      </div>
    </Card>
  )
}

function HMSideCard() {
  const pct = 84
  const tone: 'green' | 'amber' | 'gray' = pct >= 75 ? 'green' : pct >= 50 ? 'amber' : 'gray'
  const topTags: Array<[string, number]> = [
    ['react', 0.92],
    ['typescript', 0.88],
    ['product_ownership', 0.81],
    ['mentorship', 0.76],
  ]
  return (
    <Card hoverable>
      <div className="p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-14 h-14 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center text-base font-medium shrink-0">
              A
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-lg text-ink-900 mb-0.5 truncate">Aiman R.</h3>
              <p className="text-sm text-ink-500">for Senior Frontend Engineer</p>
            </div>
          </div>
          <Badge tone={tone}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="4" /></svg>
            {pct}% match
          </Badge>
        </div>

        <div className="bg-ink-50 rounded-lg p-3 mb-4 text-sm">
          <div className="text-xs text-ink-500 uppercase tracking-wide mb-0.5">Expects</div>
          <div className="text-ink-900 font-medium">
            RM 9,000 – 11,500
            <span className="text-ink-400 font-normal"> / month</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {topTags.map(([tag, score]) => (
            <span key={tag} className="text-xs bg-ink-100 text-ink-700 px-2 py-1 rounded-md">
              <span className="font-medium">{tag.replace(/_/g, ' ')}</span>
              <span className="text-ink-400 ml-1">{Math.round(score * 100)}</span>
            </span>
          ))}
        </div>

        <Badge tone="brand">New candidate — awaiting your review</Badge>

        <div className="mt-3 mb-3 border border-brand-100 rounded-lg p-3 bg-brand-50">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">Why hire for this role</p>
          <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">
            Aiman ships polished React surfaces and has carried two product launches at LumiRetail. Mentors three juniors today — fits our "lift others" culture. Comp expectation sits cleanly inside band.
          </p>
        </div>

        <MatchExplain reasoning={reasoning} />
        {reasoning.culture_comparison && <CultureCompare comparison={reasoning.culture_comparison} />}
        <ScreeningChecklist reasoning={reasoning} salaryMin={9000} salaryMax={11500} />
      </div>
    </Card>
  )
}

export default function MatchPreview() {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <PageHeader
          title="Match outcome — presentation preview"
          description="Side-by-side: how a Talent sees a job offer vs. how a Hiring Manager sees a candidate. Both cards consume the same PublicReasoning payload."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-3">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                Talent’s view — "is this job good for me?"
              </span>
            </div>
            <TalentSideCard />
          </div>

          <div>
            <div className="mb-3">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-2.5 py-1">
                Hiring Manager’s view — "is this talent good for my company?"
              </span>
            </div>
            <HMSideCard />
          </div>
        </div>
      </div>
    </div>
  )
}
