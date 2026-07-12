import { describe, it, expect } from 'vitest'
import { escapeLikePattern } from './likePattern'

/**
 * data-access-2 (and the companies HR-email lookup, data-access-1): free-text
 * values are interpolated into PostgREST `.ilike(...)`, so LIKE metacharacters
 * MUST be escaped or they act as wildcards and match an arbitrary unrelated row
 * (e.g. 'Sales%' → any 'Sales…' benchmark; 'first_last@x.com' → 'firstXlast').
 */
describe('escapeLikePattern', () => {
  it('leaves plain strings untouched', () => {
    expect(escapeLikePattern('Sales Executive')).toBe('Sales Executive')
    expect(escapeLikePattern('hr@acme.com')).toBe('hr@acme.com')
  })

  it('escapes the percent wildcard', () => {
    expect(escapeLikePattern('Sales%')).toBe('Sales\\%')
  })

  it('escapes the underscore wildcard (valid in email local-parts)', () => {
    expect(escapeLikePattern('first_last@x.com')).toBe('first\\_last@x.com')
  })

  it('escapes the backslash first so it cannot double-escape a following metachar', () => {
    // input: `a\%b`  → backslash escaped to `\\`, then `%` escaped to `\%`
    expect(escapeLikePattern('a\\%b')).toBe('a\\\\\\%b')
  })

  it('escapes every metacharacter in a mixed string', () => {
    expect(escapeLikePattern('C_Level 100%')).toBe('C\\_Level 100\\%')
  })
})
