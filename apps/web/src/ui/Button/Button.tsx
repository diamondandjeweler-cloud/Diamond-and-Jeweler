/**
 * Button — the app's action primitive, with an inline loading spinner and an
 * `asChild` polymorphic path (Radix Slot) for link-shaped buttons.
 *
 * Drop-in replacement for the Button/Spinner in components/ui.tsx: same
 * exported names, props, defaults ('primary' / 'md'), ref forwarding,
 * displayName and aria behaviour (aria-busy while loading, disabled while
 * loading). Styling moved from the `.btn-*` @layer classes in index.css into
 * Button.variants.ts (tailwind-variants + semantic tokens).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '../../lib/cn'
import { buttonVariants, type ButtonVariantProps } from './Button.variants'

/** Derived from the variant map so the public types can't drift from the styles. */
export type ButtonVariant = NonNullable<ButtonVariantProps['variant']>
export type ButtonSize = NonNullable<ButtonVariantProps['size']>

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
  /** Render as the single child element (e.g. a react-router <Link>) while
   *  keeping button styling. The child supplies its own content. */
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, leftIcon, rightIcon, asChild, children, className, disabled, ...rest }, ref) => {
    // Caller className last so it wins via twMerge.
    const cls = cn(buttonVariants({ variant, size }), className)
    // Polymorphic path: merge styling onto the caller's single child (e.g. a
    // <Link>). The child owns its content, so icons/spinner are only composed
    // in the native-button path below.
    if (asChild) {
      return (
        <Slot ref={ref as Ref<HTMLElement>} className={cls} aria-busy={loading ? true : undefined} {...rest}>
          {children}
        </Slot>
      )
    }
    return (
      <button
        ref={ref}
        className={cls}
        disabled={disabled || loading}
        aria-busy={loading ? true : undefined}
        {...rest}
      >
        {loading ? <Spinner size={size} /> : leftIcon}
        {children}
        {rightIcon}
      </button>
    )
  },
)
Button.displayName = 'Button'

/** Inline loading spinner, sized to match each button size. Decorative only
 *  (aria-hidden) — the busy state is announced via the button's aria-busy. */
export function Spinner({ size = 'md' }: { size?: ButtonSize }) {
  const px = size === 'sm' ? 12 : size === 'lg' ? 18 : 14
  return (
    <svg className="animate-spin" width={px} height={px} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
