/**
 * Tabs — accessible tabbed navigation over @radix-ui/react-tabs, in the app's
 * two existing tab shapes: an 'underline' strip (Admin console `.tabstrip` /
 * `.tab`) and a 'pill' rail (Restaurant + Admin `.pillnav`). Compound API:
 *
 *   <Tabs value={tab} onValueChange={setTab} variant="underline">
 *     <Tabs.List aria-label="Sections">
 *       <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
 *       <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
 *     </Tabs.List>
 *     <Tabs.Panel value="overview">…</Tabs.Panel>
 *     <Tabs.Panel value="settings">…</Tabs.Panel>
 *   </Tabs>
 *
 * Works controlled (value / onValueChange) or uncontrolled (defaultValue).
 * Radix supplies the a11y contract: tablist/tab/tabpanel roles + aria wiring,
 * roving tabindex, Left/Right + Home/End keyboard navigation (skipping
 * disabled triggers) and automatic activation. Visible keyboard focus comes
 * from the global :focus-visible outline (index.css @layer base) — neither
 * duplicated nor suppressed here; the panel is focusable (tabIndex 0) so
 * keyboard users can Tab from the strip straight into its content. The List
 * scrolls horizontally on overflow, like the legacy .tabstrip. Styling lives
 * in Tabs.variants.ts (tailwind-variants + semantic tokens).
 */
import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../../lib/cn'
import { tabsVariants, type TabsVariantProps } from './Tabs.variants'

/** Derived from the variant map so the public type can't drift from the styles. */
export type TabsVariant = NonNullable<TabsVariantProps['variant']>

/** Lets List/Trigger/Panel inherit the root's visual variant without prop drilling. */
const TabsVariantContext = createContext<TabsVariant>('underline')

export interface TabsProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  /** Visual treatment applied to List + Triggers. Defaults to 'underline'. */
  variant?: TabsVariant
}
export type TabsListProps = ComponentPropsWithoutRef<typeof TabsPrimitive.List>
export type TabsTriggerProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
export type TabsPanelProps = ComponentPropsWithoutRef<typeof TabsPrimitive.Content>

const TabsRoot = forwardRef<HTMLDivElement, TabsProps>(
  ({ variant = 'underline', className, children, ...rest }, ref) => (
    <TabsPrimitive.Root ref={ref} className={className} {...rest}>
      <TabsVariantContext.Provider value={variant}>{children}</TabsVariantContext.Provider>
    </TabsPrimitive.Root>
  ),
)
TabsRoot.displayName = 'Tabs'

const TabsList = forwardRef<HTMLDivElement, TabsListProps>(({ className, ...rest }, ref) => {
  const { list } = tabsVariants({ variant: useContext(TabsVariantContext) })
  // Caller className last so it wins via twMerge.
  return <TabsPrimitive.List ref={ref} className={cn(list(), className)} {...rest} />
})
TabsList.displayName = 'Tabs.List'

const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className, ...rest }, ref) => {
  const { trigger } = tabsVariants({ variant: useContext(TabsVariantContext) })
  return <TabsPrimitive.Trigger ref={ref} className={cn(trigger(), className)} {...rest} />
})
TabsTrigger.displayName = 'Tabs.Trigger'

const TabsPanel = forwardRef<HTMLDivElement, TabsPanelProps>(({ className, ...rest }, ref) => {
  const { panel } = tabsVariants({ variant: useContext(TabsVariantContext) })
  return <TabsPrimitive.Content ref={ref} className={cn(panel(), className)} {...rest} />
})
TabsPanel.displayName = 'Tabs.Panel'

/** Compound export: <Tabs> + Tabs.List / Tabs.Trigger / Tabs.Panel. */
export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Panel: TabsPanel,
})
