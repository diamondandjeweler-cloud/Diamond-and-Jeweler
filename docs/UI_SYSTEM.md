# DNJ UI System

The reusable component layer for `apps/web`. Built on **Tailwind 3.4 + tailwind-variants + Radix primitives**, themed through **semantic CSS-variable tokens**, catalogued in **Storybook**, and gated by **axe** (per-story + Playwright).

> One rule above all: **a component never writes a raw hex or a `dark:` utility for a neutral surface/border/text.** Colour decisions live in tokens; variant logic lives in `tv()`; structure lives in the component; content lives in the feature.

---

## 1. Import surface

Everything comes from the barrel:

```ts
import { Button, Card, Field, Alert, Async, Tabs, Avatar, DataList, Switch } from '../../ui'
```

- `src/ui/<Name>/` — one folder per primitive: `<Name>.tsx`, `<Name>.variants.ts`, `<Name>.stories.tsx`, `index.ts`.
- `src/ui/index.ts` — the barrel. `Button/Card/Badge/Alert/Stat` reach it through the `components/ui` re-export shim (so their many legacy `'../components/ui'` import sites keep working); the rest export directly.
- `Field/Input/Textarea/Select/PasswordInput/EmptyState/PageHeader/SectionTitle/LiveDot` still live in `components/ui`.

---

## 2. Design tokens

Defined once in [`src/ui/tokens.css`](../apps/web/src/ui/tokens.css) and mapped to utilities in `tailwind.config.js`. They flip **once** under the `.dark` class (set pre-paint in `index.html`), so a component is correct in both themes with zero `dark:`.

| Utility | Token | Light | Dark |
|---|---|---|---|
| `bg-canvas` | `--canvas` | `#f8f8f7` | `#18181b` |
| `bg-surface` | `--surface` | `#ffffff` | `#27272a` |
| `bg-surface-2` | `--surface-2` | `#f8f8f7` | `#3f3f46` |
| `border-border` | `--border` | `ink-200/70` | `zinc/70` |
| `border-border-strong` | `--border-strong` | `#bbbdb5` | `#52525b` |
| `text-fg` | `--fg` | `#141511` | `#e4e4e7` |
| `text-fg-strong` | `--fg-strong` | `#343630` | `#d1d5db` |
| `text-fg-muted` | `--fg-muted` | `#5d5f55` | `#a1a1aa` |
| `text-fg-subtle` | `--fg-subtle` | `#898c80` | `#71717a` |

**Tonal colours** (brand / accent-gold / emerald / amber / red / navy / midnight scales) are *not* tokens — they're intentional and identical in both themes unless a `dark:` override is explicitly justified (see §4).

---

## 3. Primitives

| Group | Components |
|---|---|
| Actions | `Button` (+`Spinner`), `DropdownMenu` |
| Containers | `Card`/`CardHeader`/`CardBody`, `Stat`, `PageHeader`, `SectionTitle` |
| Feedback | `Alert`, `Badge`, `Toast`, `LiveDot`, `Skeleton.{Text,Card,Row,Avatar,Stat}` |
| Forms | `Field`, `Input`, `Textarea`, `Select`, `PasswordInput`, `Switch`, `Checkbox`, `RadioGroup` |
| Navigation | `Tabs` (underline · pill) |
| Overlay | `Modal` (+`useConfirm`/`confirmDialog`), `Tooltip` |
| Data | `DataList` (responsive table↔card), `Pagination`, `Avatar` |
| Async | `Async` (loading → error → empty → data boundary) |

Interactive ones (`Tabs`, `Tooltip`, `Switch`, `Checkbox`, `RadioGroup`, `DropdownMenu`) wrap the matching `@radix-ui` primitive for correct keyboard + ARIA semantics, skinned with `tv()` + tokens.

---

## 4. The parity / harmonization rule

When migrating a legacy element to tokens:

1. **Neutrals → tokens.** `bg-white dark:bg-gray-800` → `bg-surface`. The token's dark value equals the hex the app already used, so it's a visual no-op.
2. **>1 scale-step drift or an AA break → keep byte-parity**, not the nearest token. Use scale colours + an explicit `dark:` (e.g. `Button` ghost keeps `text-ink-700 dark:text-fg-muted`; `Badge` gray keeps its legacy light-ring-in-dark quirk).
3. **≤1 step is accepted harmonization** — document it in the variants file's doc comment.
4. **Tonal / inverted-surface treatments** that no token pair can express (Alert tonal backgrounds, elevated card shadows, the pill-tab fill flip) keep a *justified* `dark:` utility, commented inline.

Never substitute the nearest token when it changes the look — parity beats purity.

---

## 5. Accessibility contract

- **axe is a hard gate**: `tests/e2e/a11y.spec.ts` blocks on any critical/serious violation on public pages; `@storybook/addon-a11y` runs axe per story.
- **Contrast**: accent-gold text on light must be `700`+ (`text-accent-700/800`); every text/bg pair must clear 4.5:1 (3:1 for ≥18px / bold).
- **Keyboard**: Tabs = arrows, Menu = arrows + Escape + focus-return, Tooltip = focus-triggered, Switch/Checkbox = Space, RadioGroup = arrows, Pagination = `aria-current="page"`.
- **Focus**: a global `:focus-visible` outline lives in `index.css @layer base` — don't suppress or duplicate it.
- Decorative SVGs get `aria-hidden`; an image role always has a non-empty accessible name (see `Avatar`'s blank-name guard).

---

## 6. Adding a primitive — checklist

1. `src/ui/<Name>/<Name>.variants.ts` — `tv()` recipe exported as `<name>Variants` + `VariantProps` types. Import `{ tv }` from `tailwind-variants`, `{ cn }` from `../../lib/cn`. **Relative imports only — no `@` alias, never import the `src/ui` barrel (cycle).**
2. `<Name>.tsx` — `forwardRef` + `displayName` where it wraps a DOM node; doc comment at top; caller `className` wins the merge (`cn(...variants, className)`).
3. `<Name>.stories.tsx` — CSF3, `tags: ['autodocs']`, no explicit `title`; cover every variant + state (loading/empty/disabled) + one in-context example.
4. `index.ts` — re-export component + types + the `tv()` recipe. Add the folder to `src/ui/index.ts`.
5. Colours: tokens or brand/ink/accent scales. **Zero raw hex.** `dark:` only per §4, justified inline.
6. A11y per §5. If interactive, add a keyboard/ARIA test to `src/ui/primitives.test.tsx`.

---

## 7. Usage examples

```tsx
// Action + async list, states handled once
<Async data={rows} error={err} isLoading={loading} onRetry={mutate}>
  {(rows) => (
    <DataList
      columns={[{ key: 'name', header: 'Name' }, { key: 'role', header: 'Role' }]}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={(r) => open(r)}
      empty={<EmptyState title="No candidates yet" />}
      loading={<Skeleton.Row avatar />}
    />
  )}
</Async>

// Polymorphic button (react-router link with button styling)
<Button asChild variant="primary"><Link to="/pricing">See pricing</Link></Button>

// Tabs (local state)
<Tabs value={tab} onValueChange={setTab} variant="underline">
  <Tabs.List aria-label="Sections">
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Panel value="overview">…</Tabs.Panel>
  <Tabs.Panel value="settings">…</Tabs.Panel>
</Tabs>

// Confirm before a destructive/money action (replaces window.confirm)
if (!(await confirmDialog({ title: 'Refund?', tone: 'danger' }))) return
```

---

## 8. Gate (every change)

`tsc --noEmit` · `vitest run` · `vite build` · `storybook build` · `eslint` (0 errors) · `playwright test` (axe 7/7, no new failures vs `main`). The lefthook pre-commit hook re-runs lint + typecheck.
