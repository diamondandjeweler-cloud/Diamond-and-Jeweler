/** 20 workplace aspects rated 1–5 by talents. */
export const PREFERENCE_ASPECTS: string[] = [
  'Work–life balance',
  'Competitive salary & benefits',
  'Career growth / clear path',
  'Respectful & inclusive culture',
  'Job stability / security',
  'Meaningful work / purpose',
  'Location / commute',
  'Flexible work arrangements',
  'Company reputation / brand',
  'Learning & development opportunities',
  'Team dynamics / colleagues',
  'Manager quality / leadership style',
  'Work intensity / reasonable hours',
  'Diversity & inclusion',
  'Innovation & technology',
  'Benefits (health, leave, perks)',
  'Recognition & feedback culture',
  'Transparency & fairness',
  'Company mission alignment',
  'Opportunity to make an impact',
]

/** Map preference aspect index → talent_expectation tag for derived_tags scoring. */
export const PREFERENCE_TO_TAG: Record<string, string> = {
  'Work–life balance': 'wants_wlb',
  'Competitive salary & benefits': 'wants_fair_pay',
  'Career growth / clear path': 'wants_growth',
  'Job stability / security': 'wants_stability',
  'Flexible work arrangements': 'wants_flexibility',
  'Manager quality / leadership style': 'wants_supportive_boss',
  'Recognition & feedback culture': 'wants_recognition',
  'Company mission alignment': 'wants_mission',
  'Team dynamics / colleagues': 'wants_team_culture',
  'Work intensity / reasonable hours': 'wants_wlb',
}
