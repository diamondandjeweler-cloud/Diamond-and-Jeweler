/**
 * DropdownMenu — actions menu attached to a caller-supplied trigger, built on
 * Radix (@radix-ui/react-dropdown-menu) so focus management, arrow-key
 * navigation (with wrap-around), Home/End, typeahead, Esc-to-close and
 * focus-return-to-trigger all come for free. Styling lives in
 * DropdownMenu.variants.ts (tailwind-variants + semantic tokens).
 *
 * Compound API:
 *
 *   <DropdownMenu trigger={<Button variant="secondary">Options</Button>}>
 *     <DropdownMenu.Label>Listing</DropdownMenu.Label>
 *     <DropdownMenu.Item icon={<EditIcon />} onSelect={handleEdit}>Edit</DropdownMenu.Item>
 *     <DropdownMenu.Separator />
 *     <DropdownMenu.Item danger onSelect={handleDelete}>Delete</DropdownMenu.Item>
 *   </DropdownMenu>
 *
 * The trigger renders via Radix `asChild`, so it must be a single element
 * that forwards its ref and spreads props (the house Button qualifies) —
 * Radix wires aria-haspopup / aria-expanded / aria-controls onto it
 * automatically. Icon-only triggers still need their own accessible name
 * (e.g. aria-label="Candidate actions").
 */
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react'
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '../../lib/cn'
import {
  dropdownMenuContentVariants,
  dropdownMenuItemVariants,
  dropdownMenuItemIconVariants,
  dropdownMenuLabelVariants,
  dropdownMenuSeparatorVariants,
} from './DropdownMenu.variants'

export interface DropdownMenuProps {
  /** Element that opens the menu. Rendered `asChild`, so it must be a single
   *  element that accepts a ref and spreads props (e.g. the house Button). */
  trigger: ReactNode
  /** Menu contents: DropdownMenu.Item / .Separator / .Label. */
  children: ReactNode
  /** Horizontal alignment of the panel against the trigger. @default 'start' */
  align?: 'start' | 'center' | 'end'
  /** Side of the trigger the panel opens from (flips on collision). @default 'bottom' */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Gap in px between trigger and panel. @default 6 */
  sideOffset?: number
  /** Extra classes for the panel (merged last via cn, so caller classes win). */
  className?: string
  /** Controlled open state — pair with onOpenChange. */
  open?: boolean
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Radix modal behaviour — blocks outside interaction while open. @default true */
  modal?: boolean
}

/** Root — ref lands on the floating panel (Radix Content) element. */
const DropdownMenuRoot = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Content>,
  DropdownMenuProps
>(
  (
    {
      trigger,
      children,
      align = 'start',
      side = 'bottom',
      sideOffset = 6,
      className,
      open,
      defaultOpen,
      onOpenChange,
      modal = true,
    },
    ref,
  ) => (
    <RadixDropdownMenu.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      modal={modal}
    >
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          ref={ref}
          align={align}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={8}
          loop
          // Caller className last so it wins via twMerge.
          className={cn(dropdownMenuContentVariants(), className)}
        >
          {children}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  ),
)
DropdownMenuRoot.displayName = 'DropdownMenu'

export interface DropdownMenuItemProps
  extends Omit<ComponentPropsWithoutRef<typeof RadixDropdownMenu.Item>, 'asChild'> {
  /** Decorative leading glyph — rendered inside an aria-hidden slot. */
  icon?: ReactNode
  /** Destructive styling: red text + red highlight tint. */
  danger?: boolean
}

/** Menu item. `onSelect`, `disabled` and `textValue` pass through to Radix. */
export const DropdownMenuItem = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Item>,
  DropdownMenuItemProps
>(({ icon, danger = false, className, children, ...rest }, ref) => (
  <RadixDropdownMenu.Item
    ref={ref}
    className={cn(dropdownMenuItemVariants({ danger }), className)}
    {...rest}
  >
    {icon && (
      <span className={dropdownMenuItemIconVariants({ danger })} aria-hidden>
        {icon}
      </span>
    )}
    {children}
  </RadixDropdownMenu.Item>
))
DropdownMenuItem.displayName = 'DropdownMenu.Item'

export type DropdownMenuLabelProps = ComponentPropsWithoutRef<typeof RadixDropdownMenu.Label>

/** Non-interactive section heading — skipped by keyboard navigation. */
export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Label>,
  DropdownMenuLabelProps
>(({ className, ...rest }, ref) => (
  <RadixDropdownMenu.Label
    ref={ref}
    className={cn(dropdownMenuLabelVariants(), className)}
    {...rest}
  />
))
DropdownMenuLabel.displayName = 'DropdownMenu.Label'

export type DropdownMenuSeparatorProps = ComponentPropsWithoutRef<
  typeof RadixDropdownMenu.Separator
>

/** Hairline divider between item groups (role="separator" via Radix). */
export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof RadixDropdownMenu.Separator>,
  DropdownMenuSeparatorProps
>(({ className, ...rest }, ref) => (
  <RadixDropdownMenu.Separator
    ref={ref}
    className={cn(dropdownMenuSeparatorVariants(), className)}
    {...rest}
  />
))
DropdownMenuSeparator.displayName = 'DropdownMenu.Separator'

/** Compound export: <DropdownMenu> + .Item / .Separator / .Label statics. */
export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
})
