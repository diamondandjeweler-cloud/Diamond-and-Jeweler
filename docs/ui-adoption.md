# UI primitive adoption tracker

_Tracks how far the app has migrated onto the Phase-6 UI primitive library (`apps/web/src/ui/*`,
documented in [UI_SYSTEM.md](./UI_SYSTEM.md)). Snapshot at tip `c9c5fef` (2026-07-12). Counts are grep
signals over `apps/web/src` excluding `*.test.tsx` — approximate, meant for prioritization, not billing._

> The primitives are **built and Storybook-catalogued**; the remaining work is **adoption** — replacing
> the legacy hand-rolled elements at call sites. Legacy `components/ui.tsx` is imported by **93 files**;
> that barrel is the migration surface.

> **2026-07-12 (A15) — `components/ui.tsx` is now a thin `@deprecated` shim.** Every primitive it used to
> _define_ (`Field`/`Input`/`Textarea`/`Select`/`PasswordInput`/`EmptyState`/`PageHeader`/`SectionTitle`/`LiveDot`)
> has moved to its own folder under `src/ui/<Name>/` (verbatim move — same names, props, and className strings,
> so DOM output is byte-identical; pinned by `src/ui/forms.test.tsx`). `components/ui.tsx` now only re-exports
> from `src/ui/*`, and the canonical `src/ui` barrel no longer depends on it. The **93 existing importers keep
> working unchanged** — they were deliberately **not** rewritten (a blind 93-file codemod is the risky part).
> An eslint `no-restricted-imports` **warning** now flags any NEW `components/ui` import and points to `src/ui`;
> the warning also lights up the 93 grandfathered sites, which is the tracked burn-down signal below.

---

## 1. Primitive library — adoption status

`src/ui/*` (Radix-skinned where interactive) + the legacy `components/ui.tsx` forms. "Adopters" =
non-test feature files under `src/routes` / `src/components` importing the primitive.

| Primitive | Built? | Feature adopters | Legacy pattern it replaces |
|---|:---:|:---:|---|
| `Button` (+`Spinner`) | ✅ | widespread (via barrel) | raw `<button>` |
| `Card` / `CardHeader` / `CardBody` | ✅ | widespread | `<div className="rounded border …">` |
| `Field` / `Input` / `Textarea` / `Select` / `PasswordInput` | ✅ (`src/ui/Field/`) | widespread | raw labelled inputs |
| `Alert` | ✅ | via barrel | inline colored `<div>` banners |
| `Badge` | ✅ | via barrel | pill `<span>` |
| `Stat` | ✅ | via barrel | KPI `<div>` blocks |
| `Skeleton.{Text,Card,Row,Avatar,Stat}` | ✅ | via barrel | ad-hoc pulse `<div>` |
| `EmptyState` / `PageHeader` / `SectionTitle` / `LiveDot` | ✅ (`src/ui/{EmptyState,PageHeader,SectionTitle,LiveDot}/`) | widespread | hand-rolled headers/empties |
| `Modal` (+`useConfirm`/`confirmDialog`) | ✅ | partial | `window.confirm` / bespoke dialogs |
| `Async` (loading→error→empty→data) | ✅ | partial | manual `if (loading) … if (error) …` ladders |
| `Tooltip` | ✅ | **6** | `title=""` attributes |
| `Switch` | ✅ | **4** | toggle `<button aria-pressed>` |
| `DataList` (responsive table↔card) | ✅ | **5** | raw `<table>` (**22 files still raw**) |
| `Avatar` | ✅ | **2** | `<img>` + initials fallback |
| `Tabs` (underline · pill) | ✅ | **0** | manual `useState('tab')` switching (**~19 files**) |
| `Checkbox` | ✅ | **0** | raw `<input type=checkbox>` / `aria-pressed` multi-select |
| `DropdownMenu` | ✅ | **0** | bespoke open/close menu state |
| `Pagination` | ✅ | **0** | hand-rolled prev/next + `aria-current` |
| **`RadioGroup`** | ✅ | **0** | single-select `<button aria-pressed>` groups (see §2) |

Interactive primitives (`Tabs`, `Tooltip`, `Switch`, `Checkbox`, `RadioGroup`, `DropdownMenu`) wrap the
matching `@radix-ui` primitive for correct keyboard + ARIA, skinned with `tv()` + tokens.

---

## 2. RadioGroup — adoption status: **BUILT, 0 ADOPTERS**

The primitive is fully built and tested but **not yet wired into any feature**:

- **Built:** `src/ui/RadioGroup/RadioGroup.tsx`, `RadioGroup.variants.ts`, `RadioGroup.stories.tsx`, `index.ts`; exported from the barrel (`src/ui/index.ts`); keyboard/ARIA covered in `src/ui/primitives.test.tsx`. Radix-backed → arrow-key roving focus + `role="radiogroup"`/`role="radio"` for free.
- **Adopters:** none in `src/routes` or `src/components`.

This is the exact gap `docs/accessibility.md` flags: single-select groups are currently `<button>`
elements (keyboard-focusable but **missing arrow-key navigation and radio semantics**). Migrating them to
`RadioGroup` closes that a11y gap.

### RadioGroup adoption candidates (raw single-select button groups)

| Call site | What it is | Current markup |
|---|---|---|
| `src/routes/InterviewFeedback.tsx:166–175` | 1–5 "how did it go?" rating | 5 `<button>`s in a `role="group"`, `onClick={() => setRating(n)}` — no roving focus |
| `src/routes/onboarding/hm/DemographicsStep.tsx:51–54` | race single-select | `<button aria-pressed={…}>` per option (toggle semantics, not radio) |
| `src/routes/onboarding/hm/DemographicsStep.tsx:105–113` | "location matters?" yes/no | pair of `<button aria-pressed>` |
| onboarding talent interview / leadership questions | Likert single-selects | `<button>` groups (per `accessibility.md` known-gaps §2) |

> Note the two different legacy encodings: a `role="group"` of plain buttons (InterviewFeedback) and
> `aria-pressed` toggle-buttons (DemographicsStep). `aria-pressed` is *toggle-button* semantics and is
> semantically wrong for a mutually-exclusive choice — RadioGroup fixes both. Multi-select `aria-pressed`
> groups (e.g. `DemographicsStep` languages) map to `Checkbox` / the existing `role-form/ChipToggleGroup`, **not** RadioGroup.

---

## 3. Candidate inventory (highest-signal legacy patterns)

Grep signals over non-test `src`:

| Legacy pattern | Files | Migrate to | Notes |
|---|:---:|---|---|
| raw `<table>` | **22** | `DataList` | Many are `src/routes/restaurant/*` admin tables + `admin/AuditLogPanel`, `admin/KpiPanel`, `PointsWallet`, `Referrals`, `DataRequests`. Blog-post tables (`blog/*`) are static content — likely leave as-is. |
| manual tab state (`setTab`/`activeTab`) | **~19** | `Tabs` | Some are false positives (variables that merely contain "tab"); triage per file before migrating. |
| raw `<select>` | **21** | `Select` / `DropdownMenu` | `Select` lives in `src/ui/Field/`; these are candidates to route through it for consistent labelling/disabled states. |
| `<button aria-pressed>` groups | **2** | `RadioGroup` (single) / `Checkbox` (multi) | `onboarding/hm/DemographicsStep.tsx`, `components/LanguageSwitcher.tsx`. |
| `window.confirm` on a destructive/money action | 1 (`admin/SystemConfigPanel.tsx`) | `confirmDialog` / `useConfirm` | UI_SYSTEM §7 shows the pattern. |

---

## 4. Migration rule + gate

Adopt **incrementally, behaviour-preserving** (AGENTS.md §7.3): a component with no test gets a
characterization test pinning current behaviour *before* it's migrated. Per swap:

1. Replace the legacy element with the primitive; keep the same visible behaviour (see UI_SYSTEM §4 parity rule — parity beats purity).
2. Add/extend a11y coverage for interactive primitives (`primitives.test.tsx`, per-story axe).
3. Gate (UI_SYSTEM §8): `tsc --noEmit` · `vitest run` · `vite build` · `storybook build` · `eslint` (0 errors) · `playwright` axe (no new failures vs `main`).

**Do not** batch-migrate blindly — the `manualChunks` white-screen (`docs/postmortems/2026-07-10-vendor-chunk-white-screen.md`) came from eager shell components pulling Radix-backed primitives onto the boot path; verify chunk assignment when adopting an interactive primitive into an eagerly-imported file.

---

## 5. `components/ui.tsx` shim retirement — tracked future work

**Status (2026-07-12):** the shim is behaviour-neutral and the eslint warning caps new debt, so the
remaining step is a **mechanical, low-risk find-and-replace** of the import specifier only — no JSX or
prop changes. Deliberately deferred out of A15 to avoid a blind 93-file codemod in one commit.

- **Scope:** ~93 files importing from `…/components/ui`. Each import is `import { … } from '<rel>/components/ui'`
  → change the specifier to the `src/ui` barrel (`'<rel>/ui'`); the imported names and usage are unchanged
  because the barrel re-exports the identical implementations.
- **How to burn down safely (per batch of ~10–15 files):**
  1. `rg -l "components/ui'" apps/web/src` to list remaining sites; rewrite the specifier only.
  2. Run the web gate (`tsc --noEmit` · `eslint src` · `vitest run` · `vite build`) — the eslint
     warning count for `no-restricted-imports` (components/ui) must drop by the number of files touched.
  3. **Watch chunk assignment** for eagerly-imported files (see §4 white-screen note): importing the full
     `src/ui` barrel can pull Radix-backed primitives onto an eager path. Prefer the specific subfolder
     (`'<rel>/ui/Field'`, `'<rel>/ui/Button'`, …) for files on the boot path.
- **Definition of done:** zero `components/ui` importers remain → delete `src/components/ui.tsx` and drop the
  `no-restricted-imports` `components/ui` pattern from `eslint.config.js`.
- **Do NOT** widen this into a component swap. This item is import-path-only; adopting *new* primitives at
  these call sites (e.g. `RadioGroup`, `DataList`) is separate work tracked in §1–§3.
