/**
 * Canonical UI module — one stable import surface for the primitive library:
 *
 *   import { Button, Card, Field, Alert, Async, Tabs, Avatar, DataList } from '../../ui'
 *
 * Every primitive's implementation lives in src/ui/<Name>/ (tv() + semantic
 * tokens, or a verbatim move for the presentational forms/headers). The legacy
 * components/ui module is now a thin DEPRECATED re-export shim pointing back
 * here, kept only so its ~93 existing '../components/ui' import sites keep
 * working unchanged — new code must import from this barrel.
 */

/* ── Migrated primitives (source of truth: src/ui/<Name>/) ── */
export { Button, Spinner } from './Button'
export type { ButtonProps } from './Button'
export { Card, CardBody, CardHeader } from './Card'
export { Badge } from './Badge'
export type { BadgeTone } from './Badge'
export { Alert } from './Alert'
export { Stat } from './Stat'
export { Field, Input, Textarea, Select, PasswordInput } from './Field'
export { EmptyState } from './EmptyState'
export { PageHeader } from './PageHeader'
export { SectionTitle } from './SectionTitle'
export { LiveDot } from './LiveDot'

/* ── Composite patterns ── */
export * from '../components/Modal'
export { Async } from '../components/patterns/Async'
export type { AsyncProps } from '../components/patterns/Async'

/* ── Phase 2 primitives (Radix-skinned where interactive; tv() + tokens) ── */
export * from './Tabs'
export * from './Tooltip'
export * from './Avatar'
export * from './Switch'
export * from './Checkbox'
export * from './RadioGroup'
export * from './DropdownMenu'
export * from './DataList'
export * from './Pagination'
export * from './Skeleton'
