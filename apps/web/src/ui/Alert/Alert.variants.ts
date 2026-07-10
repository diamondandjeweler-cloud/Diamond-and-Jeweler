/**
 * Alert variants — tv() recipe for the tonal inline notice.
 *
 * Class values are lifted verbatim from the tone maps in components/ui.tsx so
 * rendered appearance is unchanged in both themes.
 *
 * NOTE on `dark:`: the tones are brand/amber/red/emerald COLOR SCALES, not
 * neutral surfaces, so the semantic tokens (bg-surface / text-fg /
 * border-border) cannot express them. Per the migration rules, tonal (and only
 * tonal) dark styling keeps its `dark:` utilities here — parity beats purity.
 */
import { tv, type VariantProps } from 'tailwind-variants'

export const alertVariants = tv({
  slots: {
    root: 'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
    icon: 'shrink-0 mt-0.5',
    body: 'min-w-0 flex-1',
    title: 'font-semibold mb-0.5',
  },
  variants: {
    tone: {
      brand: {
        root: 'bg-brand-50 border-brand-200/70 text-brand-900 dark:bg-brand-950/40 dark:border-brand-800/50 dark:text-brand-100',
        icon: 'text-brand-600 dark:text-brand-300',
      },
      amber: {
        root: 'bg-amber-50 border-amber-200/70 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800/50 dark:text-amber-100',
        icon: 'text-amber-600 dark:text-amber-300',
      },
      red: {
        root: 'bg-red-50 border-red-200/70 text-red-900 dark:bg-red-950/40 dark:border-red-800/50 dark:text-red-100',
        icon: 'text-red-600 dark:text-red-300',
      },
      green: {
        root: 'bg-emerald-50 border-emerald-200/70 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800/50 dark:text-emerald-100',
        icon: 'text-emerald-600 dark:text-emerald-300',
      },
    },
  },
  defaultVariants: {
    tone: 'brand',
  },
})

export type AlertVariants = VariantProps<typeof alertVariants>
/** The tone union without `undefined` — handy for props that resolve a default. */
export type AlertTone = NonNullable<AlertVariants['tone']>
