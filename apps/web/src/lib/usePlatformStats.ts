/**
 * usePlatformStats — fetches live aggregate stats from /api/stats.
 * Falls back to null (shows static labels) if the fetch fails or is slow.
 * SWR-style: cached in sessionStorage for 5 minutes.
 */
import { useState, useEffect } from 'react'

interface PlatformStats {
  talents: number
  companies: number
}

const CACHE_KEY = 'dnj-platform-stats'
const CACHE_TTL = 5 * 60 * 1000 // 5 min

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}k+`
  if (n > 0) return `${n}+`
  return ''
}

export function usePlatformStats() {
  const [stats, setStats] = useState<PlatformStats | null>(null)

  useEffect(() => {
    // Try sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY)
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: PlatformStats; ts: number }
        if (Date.now() - ts < CACHE_TTL) {
          setStats(data)
          return
        }
      }
    } catch { /* ignore */ }

    // Fetch live
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000) // 4s timeout

    fetch('/api/stats', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: PlatformStats) => {
        setStats(d)
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: d, ts: Date.now() }))
        } catch { /* ignore */ }
      })
      .catch(() => { /* fail silently — static labels show */ })
      .finally(() => clearTimeout(timer))

    return () => ctrl.abort()
  }, [])

  return {
    stats,
    talentLabel: stats?.talents ? formatCount(stats.talents) : null,
    companyLabel: stats?.companies ? formatCount(stats.companies) : null,
  }
}
