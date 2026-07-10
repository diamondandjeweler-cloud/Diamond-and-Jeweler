/**
 * Canonical UI module — one stable import surface for the primitive library:
 *
 *   import { Button, Card, Field, Alert, Async, Tabs, Avatar, DataList } from '../../ui'
 *
 * Button/Card/Badge/Alert/Stat live in src/ui/<Name>/ and reach here through the
 * components/ui re-export shim (so their many existing '../components/ui' import
 * sites keep working). Field/Input/EmptyState/PageHeader/SectionTitle/LiveDot
 * still live in components/ui. The primitives below are new in Phase 2.
 */
export * from '../components/ui'
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
