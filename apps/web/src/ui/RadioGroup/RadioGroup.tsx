/**
 * RadioGroup — single-choice field built on Radix Radio Group
 * (@radix-ui/react-radio-group), styled via RadioGroup.variants.ts
 * (tailwind-variants + semantic tokens).
 *
 * Compound API:
 *   <RadioGroup value={plan} onValueChange={setPlan} label="Plan">
 *     <RadioGroup.Item value="basic" label="Basic" description="Free forever" />
 *     <RadioGroup.Item value="pro" label="Pro" />
 *   </RadioGroup>
 *
 * Keyboard + roving focus come from Radix: Tab enters the group (landing on
 * the checked item, or the first enabled one), Arrow keys move AND select,
 * Space selects the focused item. The optional `label` prop names the group
 * via aria-labelledby; pass `aria-label` instead when the design has no
 * visible label. An item's `description` is wired to its radio button via
 * aria-describedby, so it is announced without polluting the accessible name.
 */
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '../../lib/cn'
import { radioGroupVariants, radioGroupItemVariants } from './RadioGroup.variants'

export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /** Optional visible group label, announced via aria-labelledby. */
  label?: ReactNode
}

const RadioGroupRoot = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ label, className, children, ...rest }, ref) => {
    const labelId = useId()
    const slots = radioGroupVariants()
    return (
      <RadioGroupPrimitive.Root
        ref={ref}
        aria-labelledby={label ? labelId : undefined}
        // Caller props after ours so an explicit aria-label/-labelledby wins.
        {...rest}
        // Caller className last so it wins via twMerge.
        className={cn(slots.root(), className)}
      >
        {label && (
          <span id={labelId} className={slots.label()}>
            {label}
          </span>
        )}
        {children}
      </RadioGroupPrimitive.Root>
    )
  },
)
RadioGroupRoot.displayName = 'RadioGroup'

export interface RadioGroupItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  /** Visible option label (a real <label>, clickable). */
  label: ReactNode
  /** Optional supporting copy, announced via aria-describedby. */
  description?: ReactNode
}

/** One option row: circle control + label (+ optional description).
 *  `className` lands on the row wrapper; `ref` reaches the radio button. */
export const RadioGroupItem = forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ label, description, className, id, ...rest }, ref) => {
    const autoId = useId()
    const itemId = id ?? autoId
    const descriptionId = `${itemId}-description`
    const slots = radioGroupItemVariants()
    return (
      <div className={cn(slots.root(), className)}>
        <RadioGroupPrimitive.Item
          ref={ref}
          id={itemId}
          aria-describedby={description ? descriptionId : undefined}
          {...rest}
          className={slots.control()}
        >
          <RadioGroupPrimitive.Indicator className={slots.indicator()}>
            <span className={slots.dot()} />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
        <label htmlFor={itemId} className={slots.label()}>
          {label}
        </label>
        {description && (
          <p id={descriptionId} className={slots.description()}>
            {description}
          </p>
        )}
      </div>
    )
  },
)
RadioGroupItem.displayName = 'RadioGroup.Item'

/** Compound export: `RadioGroup` is the Radix Root with `.Item` attached. */
export const RadioGroup = Object.assign(RadioGroupRoot, { Item: RadioGroupItem })
