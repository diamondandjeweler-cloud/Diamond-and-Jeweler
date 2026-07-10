/**
 * Checkbox — Radix-based form checkbox with optional wired label/description.
 *
 * The box is a Radix `<Checkbox.Root>` (a native <button role="checkbox">), so
 * Space toggles, Tab focuses and the global :focus-visible outline (index.css
 * @layer base) draws the keyboard ring. `label`/`description` are wired via
 * useId: the <label htmlFor> points at the button, so clicking the label
 * toggles the control natively, and the description feeds aria-describedby.
 * When rendering without a visible `label`, pass `aria-label` so the control
 * still has an accessible name.
 *
 * `indeterminate` maps onto Radix's `checked="indeterminate"` state (the
 * mixed "some selected" tri-state) and therefore drives the control — while
 * it is true the `checked` prop is ignored. `onCheckedChange` is normalized
 * to a plain boolean; a click while indeterminate reports `true`.
 *
 * Styling lives in Checkbox.variants.ts (tailwind-variants + semantic
 * tokens). The caller's className lands on the box element (the control
 * itself) in both the bare and labelled layouts, last so it wins via twMerge.
 */
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import * as RadixCheckbox from '@radix-ui/react-checkbox'
import { cn } from '../../lib/cn'
import {
  checkboxVariants,
  checkboxIndicatorVariants,
  checkboxLabelVariants,
  checkboxDescriptionVariants,
} from './Checkbox.variants'

type RadixRootProps = ComponentPropsWithoutRef<typeof RadixCheckbox.Root>

export interface CheckboxProps
  extends Omit<RadixRootProps, 'checked' | 'defaultChecked' | 'onCheckedChange' | 'asChild' | 'children'> {
  /** Controlled checked state (ignored while `indeterminate` is true). */
  checked?: boolean
  /** Uncontrolled initial state. */
  defaultChecked?: boolean
  /** Fires with the next state as a plain boolean (indeterminate → true). */
  onCheckedChange?: (checked: boolean) => void
  /** Visible label, wired to the control — clicking it toggles. */
  label?: ReactNode
  /** Muted helper text below the label, announced via aria-describedby. */
  description?: ReactNode
  /** Tri-state "some selected" dash; overrides `checked` while true. */
  indeterminate?: boolean
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      checked,
      defaultChecked,
      onCheckedChange,
      label,
      description,
      indeterminate,
      disabled,
      id: idProp,
      className,
      'aria-describedby': ariaDescribedBy,
      ...rest
    },
    ref,
  ) => {
    const autoId = useId()
    const id = idProp ?? autoId
    const descriptionId = description != null ? `${id}-description` : undefined
    // Preserve any caller-supplied describedby alongside the description's.
    const describedBy = [ariaDescribedBy, descriptionId].filter(Boolean).join(' ') || undefined
    const hasText = label != null || description != null

    const box = (
      <RadixCheckbox.Root
        ref={ref}
        id={id}
        checked={indeterminate ? 'indeterminate' : checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(next) => onCheckedChange?.(next === true)}
        disabled={disabled}
        aria-describedby={describedBy}
        // mt-0.5 is geometry, not theme: it optically centers the 16px box
        // against the label's 20px text-sm line box in the labelled layout.
        // Caller className last so it wins via twMerge.
        className={cn(checkboxVariants(), hasText && 'mt-0.5', className)}
        {...rest}
      >
        <RadixCheckbox.Indicator className={checkboxIndicatorVariants()}>
          {indeterminate ? <DashIcon /> : <CheckIcon />}
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
    )

    if (!hasText) return box

    return (
      <div className="flex items-start gap-2">
        {box}
        <div className="flex flex-col gap-0.5">
          {label != null && (
            <label htmlFor={id} className={checkboxLabelVariants({ disabled })}>
              {label}
            </label>
          )}
          {description != null && (
            <p id={descriptionId} className={checkboxDescriptionVariants({ disabled })}>
              {description}
            </p>
          )}
        </div>
      </div>
    )
  },
)
Checkbox.displayName = 'Checkbox'

/** Checked glyph. Decorative only (aria-hidden) — state is announced by the
 *  control's aria-checked. Strokes currentColor (white via the indicator). */
function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 6.5 5 9l4.5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Indeterminate dash. Decorative only (aria-hidden). */
function DashIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 6h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
