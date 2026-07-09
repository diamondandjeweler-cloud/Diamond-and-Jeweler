/**
 * BaZi-secrecy sanitiser for the Org Chart Consultant.
 *
 * Rewrites any internal life-chart terminology that may have leaked into a
 * client-facing string (report HTML, summary text, archetype notes) into
 * neutral, professional language. ALL strings persisted to
 * `org_consultations.report_html` MUST be passed through `sanitiseClientText`.
 */

const ORG_TERM_MAP: ReadonlyArray<readonly [pattern: RegExp, replacement: string]> = [
  [/bazi/gi,         'temperament pattern'],
  [/八字/g,           'temperament pattern'],
  [/life[\s-]?chart/gi, 'role-fit profile'],
  [/day[\s-]?master/gi, 'core trait'],
  [/feng[\s-]?shui/gi,  'workplace harmony'],
  [/bagua/gi,        'eight-area framework'],
  [/八卦/g,           'eight-area framework'],
  [/heavenly[\s-]?stem/gi, 'foundation trait'],
  [/earthly[\s-]?branch/gi, 'expression trait'],
]

export function sanitiseClientText(raw: string | null | undefined): string {
  if (!raw) return ''
  let out = String(raw)
  for (const [pattern, replacement] of ORG_TERM_MAP) {
    out = out.replace(pattern, replacement)
  }
  return out
}
