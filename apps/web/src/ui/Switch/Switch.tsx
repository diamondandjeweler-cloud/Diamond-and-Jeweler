/**
 * Switch — on/off toggle built on @radix-ui/react-switch, with optional
 * built-in label + description wired up for assistive tech.
 *
 * Accessibility: Radix renders a real <button role="switch"> with full
 * keyboard support (Space/Enter toggle, Tab focus) and `aria-checked`. When
 * `label` / `description` are provided, they are announced via
 * `aria-labelledby` / `aria-describedby` (ids minted with useId); the label is
 * also a real <label htmlFor> so clicking it toggles the switch. When
 * rendering WITHOUT a visible `label`, pass `aria-label` so the control still
 * has an accessible name. The visible focus ring comes from the global
 * `:focus-visible` outline in index.css @layer base.
 *
 * Styling lives in Switch.variants.ts (tailwind-variants + semantic tokens);
 * md size only. Controlled (`checked` + `onCheckedChange`) and uncontrolled
 * (`defaultChecked`) usage both pass straight through to Radix, as do form
 * props (`name`, `value`, `required`).
 */
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/cn'
import { switchVariants, switchThumbVariants } from './Switch.variants'

export interface SwitchProps
  // `asChild` is omitted: the Root composes its own Thumb child, so swapping
  // the underlying element would silently drop the thumb.
  extends Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'asChild'> {
  /** Visible label, announced as the switch's accessible name. */
  label?: ReactNode
  /** Secondary helper text, announced via aria-describedby. */
  description?: ReactNode
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ label, description, className, disabled, id, ...rest }, ref) => {
    const autoId = useId()
    const switchId = id ?? `${autoId}-switch`
    const labelId = label ? `${autoId}-label` : undefined
    const descriptionId = description ? `${autoId}-description` : undefined

    const control = (
      <SwitchPrimitive.Root
        ref={ref}
        id={switchId}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        // Caller className last so it wins via twMerge (styles the track).
        className={cn(switchVariants(), className)}
        // Rest spread last so callers can still override e.g. aria-labelledby.
        {...rest}
      >
        <SwitchPrimitive.Thumb className={switchThumbVariants()} />
      </SwitchPrimitive.Root>
    )

    if (!label && !description) return control

    return (
      <div className="flex items-start gap-3">
        {control}
        {/* Text stack dims alongside the disabled track (the wrapper isn't a
            form control, so `disabled:` utilities can't reach it). */}
        <div className={cn('flex flex-col gap-0.5', disabled && 'opacity-50')}>
          {label && (
            // Real <label htmlFor> so pointer users can click the text to
            // toggle; aria-labelledby above names the switch for AT.
            <label
              id={labelId}
              htmlFor={switchId}
              className={cn('text-sm font-medium leading-5 text-fg', !disabled && 'cursor-pointer')}
            >
              {label}
            </label>
          )}
          {description && (
            <span id={descriptionId} className="text-sm text-fg-muted">
              {description}
            </span>
          )}
        </div>
      </div>
    )
  },
)
Switch.displayName = 'Switch'
