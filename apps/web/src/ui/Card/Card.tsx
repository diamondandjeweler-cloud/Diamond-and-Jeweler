/**
 * Card primitives — drop-in replacements for Card / CardBody / CardHeader in
 * components/ui.tsx, restyled via tailwind-variants + semantic tokens
 * (bg-surface / border-border / text-fg) so one definition renders correctly
 * in both light and dark. Same exported names, props, defaults and markup as
 * the legacy components (plain function components, no refs/aria — as before).
 */
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { cardVariants, cardBodyVariants, cardHeaderVariants } from './Card.variants'

export interface CardProps {
  children: ReactNode
  className?: string
  hoverable?: boolean
  elevated?: boolean
  as?: 'div' | 'article' | 'section'
}

export function Card({ children, className, hoverable, elevated, as: Tag = 'div' }: CardProps) {
  // Caller className last so it wins any utility conflict (cn = clsx + twMerge).
  return <Tag className={cn(cardVariants({ hoverable, elevated }), className)}>{children}</Tag>
}

export interface CardBodyProps {
  children: ReactNode
  className?: string
}

export function CardBody({ children, className }: CardBodyProps) {
  return <div className={cn(cardBodyVariants(), className)}>{children}</div>
}

export interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  eyebrow?: ReactNode
}

export function CardHeader({ title, subtitle, right, eyebrow }: CardHeaderProps) {
  const slots = cardHeaderVariants()
  return (
    <div className={slots.root()}>
      <div className={slots.body()}>
        {eyebrow && <div className={slots.eyebrow()}>{eyebrow}</div>}
        <h2 className={slots.title()}>{title}</h2>
        {subtitle && <p className={slots.subtitle()}>{subtitle}</p>}
      </div>
      {right && <div className={slots.right()}>{right}</div>}
    </div>
  )
}
