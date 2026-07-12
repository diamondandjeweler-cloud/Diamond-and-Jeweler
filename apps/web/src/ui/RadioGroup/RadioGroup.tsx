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
 *
 * Two visual variants share this keyboard + ARIA machinery:
 *   - `default` — circle control + external label (the compound API above).
 *   - `segmented` — the whole pill IS the radio button, brand-filled when
 *     selected, no circle. A drop-in for hand-rolled single-select `<button>`
 *     pill groups (e.g. talent onboarding gender / race / commute). Set
 *     `variant="segmented"` on the group; it reaches every item via context.
 */
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { cn } from '../../lib/cn'
import {
  radioGroupVariants,
  radioGroupItemVariants,
  radioGroupSegmentedItemVariants,
  type RadioGroupSegmentedSize,
} from './RadioGroup.variants'

type RadioGroupVariant = 'default' | 'segmented'

/** Threads the group's visual variant to every RadioGroup.Item. */
const RadioGroupVariantContext = createContext<RadioGroupVariant>('default')

export interface RadioGroupProps extends ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> {
  /** Optional visible group label, announced via aria-labelledby. */
  label?: ReactNode
  /** Visual variant; reaches every item via context. Default `default`. */
  variant?: RadioGroupVariant
}

const RadioGroupRoot = forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ label, variant = 'default', className, children, ...rest }, ref) => {
    const labelId = useId()
    const slots = radioGroupVariants()
    return (
      <RadioGroupVariantContext.Provider value={variant}>
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
      </RadioGroupVariantContext.Provider>
    )
  },
)
RadioGroupRoot.displayName = 'RadioGroup'

export interface RadioGroupItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>, 'children'> {
  /** Visible option label. `default`: an external <label>. `segmented`: the pill's own content. */
  label: ReactNode
  /** Optional supporting copy, announced via aria-describedby (`default` variant only). */
  description?: ReactNode
  /** Segmented pill shape (`md` pill · `tile` square). Ignored by the `default` variant. */
  size?: RadioGroupSegmentedSize
}

/** One option. `default`: circle control + label (+ optional description).
 *  `segmented`: a whole-pill radio button whose content is `label` (no circle,
 *  no external label). `className` lands on the row wrapper (default) / pill
 *  (segmented); `ref` reaches the radio button in both. */
export const RadioGroupItem = forwardRef<HTMLButtonElement, RadioGroupItemProps>(
  ({ label, description, size = 'md', className, id, ...rest }, ref) => {
    const variant = useContext(RadioGroupVariantContext)
    const autoId = useId()
    const itemId = id ?? autoId

    if (variant === 'segmented') {
      // The pill button IS the radio control (whole-pill click target); the
      // label is its content, so no separate circle and no external <label>.
      // `description` is intentionally not rendered here.
      return (
        <RadioGroupPrimitive.Item
          ref={ref}
          id={itemId}
          {...rest}
          className={cn(radioGroupSegmentedItemVariants({ size }), className)}
        >
          {label}
        </RadioGroupPrimitive.Item>
      )
    }

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
