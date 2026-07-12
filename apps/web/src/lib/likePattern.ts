/**
 * Escape LIKE/ILIKE metacharacters so a caller-supplied string is matched
 * LITERALLY rather than as a wildcard pattern.
 *
 * PostgREST `.ilike('col', value)` passes `value` straight into a SQL ILIKE, so
 * an unescaped `%` or `_` in user input becomes a wildcard: `'Sales%'` matches
 * every `Sales…` row, and an email local-part underscore (`first_last@x.com`)
 * matches `firstXlast@x.com`. Both silently return an arbitrary unrelated row.
 *
 * We escape the backslash FIRST (so it can't double-escape a following
 * metacharacter) then `%` and `_`. PostgreSQL's default ESCAPE character for
 * LIKE/ILIKE is `\`, which is what these escapes rely on.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
