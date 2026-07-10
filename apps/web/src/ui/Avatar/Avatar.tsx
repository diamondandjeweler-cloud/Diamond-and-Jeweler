/**
 * Avatar — circular identity primitive. Renders the person's photo when `src`
 * is provided and loads; otherwise falls back to their initials on a
 * deterministic tint derived from the name (same name → same tint, every
 * render, every session).
 *
 * Accessibility: the accessible name lives ONCE on the root (role="img" +
 * aria-label={name}); the inner <img> is a purely visual layer (alt="" +
 * aria-hidden) and the initials are aria-hidden too, so screen readers
 * announce the person's full name exactly once. Non-interactive — no keyboard
 * surface or focus handling needed (wrap in a <button>/<a> at the call site
 * for interactive avatars; the global :focus-visible outline covers those).
 */
import { forwardRef, useState, type HTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import {
  avatarVariants,
  avatarTintVariants,
  type AvatarVariantProps,
  type AvatarTintVariantProps,
} from './Avatar.variants'

/** Derived from the variant maps so the public types can't drift from the styles. */
export type AvatarSize = NonNullable<AvatarVariantProps['size']>
export type AvatarTint = NonNullable<AvatarTintVariantProps['tint']>

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Full name — the accessible label, the initials source and the tint seed. */
  name: string
  /** Photo URL. If it fails to load, the initials fallback renders instead. */
  src?: string
  size?: AvatarSize
}

/** Tint cycle the name hash indexes into (order is part of the contract —
 *  reordering would reshuffle every user's color). */
const TINTS: AvatarTint[] = ['brand', 'green', 'amber', 'red', 'accent', 'gray']

/** First letters of the first + last word, uppercased.
 *  "Mary Jane Watson" → "MW" · "Cher" → "C" · "" → "". */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const first = words[0].charAt(0)
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : ''
  return (first + last).toUpperCase()
}

/** Deterministic 31-multiplier string hash → stable tint for a name. Hashes the
 *  normalized name so trivial whitespace differences ("A  B" vs "A B") resolve to
 *  the same tint, matching getInitials (which also collapses whitespace). */
function getTint(name: string): AvatarTint {
  const n = name.trim().replace(/\s+/g, ' ')
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) | 0
  return TINTS[Math.abs(h) % TINTS.length]
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  ({ name, src, size = 'md', className, ...rest }, ref) => {
    // Remember which src failed (rather than a boolean) so a *changed* src
    // gets a fresh load attempt without an effect to reset error state.
    const [failedSrc, setFailedSrc] = useState<string | null>(null)
    const showImage = Boolean(src) && src !== failedSrc
    const label = name.trim()

    return (
      <span
        ref={ref}
        // An img role with an empty accessible name is a serious axe violation,
        // so a nameless avatar is decorative (aria-hidden), not role="img".
        {...(label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true })}
        // The tint stays applied under the photo too: it doubles as the
        // loading placeholder while the image streams in. Caller className
        // last so it wins via twMerge.
        className={cn(avatarVariants({ size }), avatarTintVariants({ tint: getTint(name) }), className)}
        {...rest}
      >
        {showImage ? (
          <img
            src={src}
            alt=""
            aria-hidden
            className="h-full w-full object-cover"
            onError={() => setFailedSrc(src ?? null)}
          />
        ) : (
          <span aria-hidden className="leading-none">
            {getInitials(name)}
          </span>
        )}
      </span>
    )
  },
)
Avatar.displayName = 'Avatar'
