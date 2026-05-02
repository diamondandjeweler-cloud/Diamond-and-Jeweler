import { useState } from 'react'
import type { PublicReasoning } from '../types/db'

interface Props {
  reasoning: PublicReasoning | null | undefined
  salaryMin: number | null
  salaryMax: number | null
}

function fmt(n: number | null) {
  if (n == null) return '—'
  return n.toLocaleString('en-MY')
}

function buildItems(
  reasoning: PublicReasoning,
  salaryMin: number | null,
  salaryMax: number | null,
): string[] {
  const items: string[] = []
  const w = reasoning.watchouts.join(' ').toLowerCase()
  const s = reasoning.strengths.join(' ').toLowerCase()
  void s

  // Always: salary confirmation
  if (salaryMin != null || salaryMax != null) {
    items.push(`Confirm salary expectation (RM ${fmt(salaryMin)}–${fmt(salaryMax)}/month) is within your approved budget before the first call.`)
  }

  // Work authorization
  if (w.includes('work authorization') || w.includes('work auth') || w.includes('visa')) {
    items.push('Verify work authorization and visa/pass type — confirm candidate is eligible to work in this role.')
  }

  // Non-compete / bond
  if (w.includes('non-compete') || w.includes('bond') || w.includes('ip restriction')) {
    items.push('Ask about non-compete clause or service bond with current/previous employer — clarify industry scope and duration.')
  }

  // Short tenure
  if (w.includes('short tenure') || w.includes('under 12 months') || w.includes('short stints')) {
    items.push('Probe each role under 12 months — ask for the specific reason they left and what changed in how they work afterward.')
  }

  // Career goal / growth mismatch
  if (w.includes('career goal') || w.includes('growth expectations') || w.includes('promotion path')) {
    items.push('Discuss career growth expectations openly — explain the realistic promotion path for this role.')
  }

  // Long-term intention
  if (w.includes('long-term commitment') || w.includes('skill-building move')) {
    items.push('Confirm long-term commitment — candidate indicated they may be looking to move on in 2–3 years. Clarify expectations on both sides.')
  }

  // Salary gap
  if (w.includes('significant salary gap') || w.includes('considerably more')) {
    items.push('Bridge the salary gap conversation early — candidate expects more than the offer range. Clarify total comp (bonuses, increments) in first call.')
  }

  // Experience mismatch
  if (w.includes('experience gap') || w.includes('over or underqualified')) {
    items.push('Validate experience scope — probe whether candidate can genuinely meet role demands or will be unchallenged.')
  }

  // Culture (AI-inferred)
  if (w.includes('ai onboarding') || w.includes('ai-inferred') || w.includes('culture signals are self-reported')) {
    items.push('Verify cultural fit in person — culture signals came from AI onboarding, not a structured survey. Ask 1–2 culture-specific questions.')
  }

  // Must-haves from HM
  if (w.includes("non-negotiables in interview") || w.includes("verify hm's")) {
    const match = reasoning.watchouts.find((x) => x.toLowerCase().includes("non-negotiables"))
    if (match) items.push(match.replace(/^Verify HM'?s? non-negotiables in interview:\s*/i, 'Confirm non-negotiable requirements: '))
  }

  // Golden Rule — already surfaced in MatchExplain but worth a checklist note
  if (w.includes('platform signals') && w.includes('evaluation dimensions')) {
    items.push('Run a structured second-round interview — platform flagged multiple uncertain dimensions for this candidate.')
  }

  return items.slice(0, 7)
}

export default function ScreeningChecklist({ reasoning, salaryMin, salaryMax }: Props) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState<Record<number, boolean>>({})
  const [copied, setCopied] = useState(false)

  if (!reasoning) return null
  const items = buildItems(reasoning, salaryMin, salaryMax)
  if (items.length === 0) return null

  const doneCount = Object.values(checked).filter(Boolean).length

  function toggle(i: number) {
    setChecked((c) => ({ ...c, [i]: !c[i] }))
  }

  function copyToClipboard() {
    const text = `Pre-screening checklist\n\n` + items.map((item, i) => `${i + 1}. ${item}`).join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mt-3 border border-ink-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-ink-50 hover:bg-ink-100 text-left transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-700 uppercase tracking-wide">
          <span>📋</span>
          Pre-screening checklist
          {doneCount > 0 && (
            <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
              {doneCount}/{items.length}
            </span>
          )}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={`transition-transform text-ink-400 ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="p-3 space-y-2">
          <p className="text-xs text-ink-500 mb-3">Auto-generated from platform signals. Tick off as you go.</p>
          {items.map((item, i) => (
            <label key={i} className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={checked[i] ?? false}
                onChange={() => toggle(i)}
                className="mt-0.5 rounded border-ink-300 accent-emerald-600 shrink-0"
              />
              <span className={`text-xs leading-snug ${checked[i] ? 'line-through text-ink-400' : 'text-ink-700'}`}>
                {item}
              </span>
            </label>
          ))}
          <div className="pt-2 border-t border-ink-100 flex justify-end">
            <button
              onClick={copyToClipboard}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              {copied ? '✓ Copied!' : 'Copy checklist'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
