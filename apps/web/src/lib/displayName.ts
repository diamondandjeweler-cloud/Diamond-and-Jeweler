// Display-name resolver for greetings and addressing the user.
//
// Falls back through, in order:
//   1. profile.display_name if explicitly set during onboarding
//   2. given-name extracted from full_name with a Chinese-surname-aware parse
//   3. the email local-part (last resort)
//
// The leading-token heuristic is wrong for Malaysian Chinese users whose
// family name comes first ("Tan Wei Ming" → "Wei Ming", not "Tan"). Honoring
// the family-name allowlist removes that bug class without requiring a DB
// rewrite of existing names.

interface NameSource {
  display_name?: string | null
  full_name?: string | null
  email?: string | null
}

// Common Chinese family names romanized in Hokkien/Cantonese/Mandarin spellings
// used in Malaysia. When a name token matches this set as the *first* token,
// the second token is treated as the given name. Order doesn't matter; lookup
// is O(1) via Set.
const CHINESE_FAMILY_NAMES = new Set<string>([
  'tan', 'lim', 'lee', 'wong', 'chan', 'chen', 'cheong', 'cheah', 'chia',
  'chin', 'choo', 'chong', 'chow', 'chua', 'foo', 'fong', 'goh', 'gan',
  'ho', 'hoe', 'hong', 'hooi', 'hor', 'koh', 'khoo', 'koay', 'khor',
  'kuan', 'lai', 'lau', 'leong', 'liew', 'liow', 'lo', 'loh', 'low',
  'mok', 'ng', 'ong', 'ooi', 'pang', 'phang', 'pua', 'quek', 'sim',
  'sin', 'siow', 'soh', 'soo', 'tay', 'teh', 'teo', 'teoh', 'thong',
  'tiong', 'toh', 'wee', 'woon', 'yap', 'yeap', 'yee', 'yeo', 'yeoh',
  'yew', 'yong', 'zhang', 'huang', 'liu', 'wang', 'li', 'zhao', 'sun',
  'zhou', 'wu', 'xu', 'zhu', 'hu', 'guo', 'he', 'gao', 'luo', 'zheng',
  'liang', 'xie', 'song', 'tang', 'feng', 'deng', 'cao', 'peng', 'zeng',
])

function startCase(s: string): string {
  return s
    .split(/[-\s']+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export function parseGivenName(fullName: string): string {
  const trimmed = fullName.trim()
  if (!trimmed) return ''

  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 1) return startCase(tokens[0])

  const firstLower = tokens[0].toLowerCase()
  if (CHINESE_FAMILY_NAMES.has(firstLower) && tokens.length >= 2) {
    // "Tan Wei Ming" → "Wei Ming"; "Lee Kwang Hoe" → "Kwang Hoe".
    // Multi-syllable Chinese given names are conventionally returned in full.
    return startCase(tokens.slice(1).join(' '))
  }

  // Bin/Binti/A/L/A/P particles: skip past Malay/Indian honorific connectors
  // and use the leading personal name. e.g. "Hafiz Bin Yusof" → "Hafiz".
  return startCase(tokens[0])
}

export function getDisplayName(profile: NameSource | null | undefined): string {
  if (!profile) return ''
  const explicit = profile.display_name?.trim()
  if (explicit) return explicit

  const fromFull = profile.full_name ? parseGivenName(profile.full_name) : ''
  if (fromFull) return fromFull

  const local = profile.email?.split('@')[0]
  return local ? startCase(local.replace(/[._-]+/g, ' ')) : ''
}
