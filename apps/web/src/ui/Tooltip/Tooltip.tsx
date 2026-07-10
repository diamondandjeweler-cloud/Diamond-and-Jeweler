/**
 * Tooltip — a supplementary hint that floats next to its trigger on hover or
 * keyboard focus. Composed from Radix Tooltip (Provider → Root → Trigger
 * asChild → Portal → Content + Arrow), so the a11y contract comes for free:
 * opens on focus as well as hover, dismisses on Escape/blur, and the trigger
 * is linked to the panel via aria-describedby while open. The trigger keeps
 * its own semantics and the global :focus-visible outline (index.css
 * @layer base) — nothing here suppresses or duplicates it.
 *
 * Content is SUPPLEMENTARY ONLY — never put essential controls or
 * information the user can't get elsewhere inside it: the panel is ephemeral
 * and can't be reached by pointer or tab.
 *
 * Disabled triggers don't emit pointer events, so a bare `<Button disabled>`
 * never shows its tip — wrap it in a focusable proxy instead:
 * `<Tooltip content="…"><span tabIndex={0} className="inline-block"><Button disabled … /></span></Tooltip>`
 * (see the DisabledTrigger story).
 *
 * Each instance carries its own Provider so the primitive is self-contained;
 * `ref` forwards to the floating Content element.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '../../lib/cn'
import { tooltipVariants, tooltipArrowVariants } from './Tooltip.variants'

type RadixContentProps = ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>

/** Derived from Radix so the public types can't drift from the primitive. */
export type TooltipSide = NonNullable<RadixContentProps['side']>
export type TooltipAlign = NonNullable<RadixContentProps['align']>

export interface TooltipProps {
  /** Hint text (or light inline markup). Supplementary only — never essential
   *  controls; the panel is ephemeral and unreachable by pointer or tab.
   *  Nullish / empty content renders the trigger alone, with no tooltip. */
  content: ReactNode
  /** The trigger — a single focusable element. Radix Trigger `asChild` merges
   *  onto it, so it must forward its ref and spread props (Button does). */
  children: ReactElement
  /** Preferred side; flips automatically on viewport collision. @default 'top' */
  side?: TooltipSide
  /** Alignment along the chosen side. @default 'center' */
  align?: TooltipAlign
  /** Gap between trigger and panel, in px. @default 6 */
  sideOffset?: number
  /** Hover delay before opening, in ms (opening on keyboard focus is
   *  immediate, per Radix). @default 300 */
  delayDuration?: number
  /** Extra classes for the content panel — merged last, wins via twMerge. */
  className?: string
  /** Controlled open state (e.g. to pin the panel open in docs or tests). */
  open?: boolean
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      content,
      children,
      side = 'top',
      align = 'center',
      sideOffset = 6,
      delayDuration = 300,
      className,
      open,
      defaultOpen,
      onOpenChange,
    },
    ref,
  ) => {
    // No hint to show — render the trigger untouched instead of mounting the
    // whole Radix tree around an empty panel.
    if (content == null || content === '') return children

    return (
      <TooltipPrimitive.Provider delayDuration={delayDuration}>
        <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
          <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              ref={ref}
              side={side}
              align={align}
              sideOffset={sideOffset}
              collisionPadding={8}
              // Caller className last so it wins via twMerge.
              className={cn(tooltipVariants(), className)}
            >
              {content}
              {/* Decorative pointer — the panel is already linked to the
                  trigger via aria-describedby, so the arrow is hidden. */}
              <TooltipPrimitive.Arrow aria-hidden width={10} height={5} className={tooltipArrowVariants()} />
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    )
  },
)
Tooltip.displayName = 'Tooltip'
