/**
 * Pure helpers + shared types for the Talent onboarding wizard.
 *
 * These were relocated verbatim from TalentOnboarding.tsx as part of a
 * behavior-preserving decomposition. No logic changed.
 */

export type Phase =
  | 'basics' | 'chat' | 'dob' | 'dealbreakers' | 'extras'
  | 'docs' | 'review' | 'submit' | 'done' | 'resume'

export interface ApiMessage { role: 'user' | 'assistant'; content: string }

/**
 * Whether the candidate's race/religion/language combination implies they
 * follow the lunar calendar. Relocated verbatim from TalentOnboarding.
 */
export function computeUsesLunarCalendar(r: string, rel: string, langs: string[]): boolean {
  if (r !== 'chinese') return false
  if (!['buddhism', 'taoism', 'chinese_folk'].includes(rel)) return false
  return langs.some((l) => ['mandarin', 'cantonese', 'hokkien', 'hakka', 'teochew'].includes(l))
}
