import { useEffect } from 'react'

/** Apply the 'dark' class to <html> based on localStorage or OS preference.
 *  Call once at the App root so the class is applied before first paint. */
export function useDarkMode() {
  useEffect(() => {
    const stored = localStorage.getItem('dnj-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = stored ? stored === 'dark' : prefersDark
    document.documentElement.classList.toggle('dark', isDark)
  }, [])
}
