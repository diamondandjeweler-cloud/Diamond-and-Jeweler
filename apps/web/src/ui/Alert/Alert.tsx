/**
 * Alert — tonal inline notice (brand info / amber warning / red error /
 * green success) with an optional title and a per-tone default icon.
 *
 * Drop-in replacement for the Alert in components/ui.tsx: same props, same
 * defaults, same rendered DOM and `role="alert"`. The tone maps moved into
 * Alert.variants.ts (tv()); an optional `className` was added (merged last,
 * so caller classes win).
 */
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { alertVariants, type AlertTone } from './Alert.variants'

export interface AlertProps {
  tone?: AlertTone
  title?: ReactNode
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function Alert({ tone = 'brand', title, children, icon, className }: AlertProps) {
  const slots = alertVariants({ tone })
  return (
    <div className={cn(slots.root(), className)} role="alert">
      <div className={slots.icon()}>{icon ?? <AlertIcon tone={tone} />}</div>
      <div className={slots.body()}>
        {title && <div className={slots.title()}>{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  )
}
Alert.displayName = 'Alert'

function AlertIcon({ tone }: { tone: 'brand' | 'amber' | 'red' | 'green' }) {
  if (tone === 'red') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 8v5M12 16v.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  }
  if (tone === 'amber') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 10v4M12 17v.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  }
  if (tone === 'green') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M8 12.5l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 8v.01M12 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
}
