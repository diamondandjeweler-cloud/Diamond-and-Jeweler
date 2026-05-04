import { useEffect } from 'react'

const SUFFIX = ' · DNJ'
const DEFAULT = 'DNJ — Three matches, zero noise'

/**
 * Set document.title for the lifetime of the calling component.
 * On unmount, restores the default site title so subsequent routes
 * that don't call this hook don't carry over a stale title.
 *
 * Pass a short page-level phrase like "Your profile" — the hook
 * appends " · DNJ" automatically.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return
    const prev = document.title
    document.title = title + SUFFIX
    return () => { document.title = prev || DEFAULT }
  }, [title])
}
