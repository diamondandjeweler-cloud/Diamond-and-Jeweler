/**
 * @deprecated Import UI primitives from the `src/ui` barrel instead:
 *
 *   // old
 *   import { Button, Field, PageHeader } from '../../components/ui'
 *   // new
 *   import { Button, Field, PageHeader } from '../../ui'
 *
 * This module is now a thin compatibility SHIM. Every primitive it used to
 * define has moved to its own folder under `src/ui/<Name>/`; this file only
 * re-exports them so the ~93 existing `../components/ui` import sites keep
 * working UNCHANGED (zero behaviour change — same names, props, DOM output).
 *
 * An eslint `no-restricted-imports` rule (WARNING) flags NEW imports from this
 * path. Do not add call sites here; point new code at `src/ui`. Migrating the
 * existing importers is tracked in `docs/ui-adoption.md`.
 */
export { Button, Spinner } from '../ui/Button'
export type { ButtonProps } from '../ui/Button'
export { Card, CardBody, CardHeader } from '../ui/Card'
export { Badge } from '../ui/Badge'
export type { BadgeTone } from '../ui/Badge'
export { Alert } from '../ui/Alert'
export { Stat } from '../ui/Stat'
export { Field, Input, Textarea, Select, PasswordInput } from '../ui/Field'
export { EmptyState } from '../ui/EmptyState'
export { PageHeader } from '../ui/PageHeader'
export { SectionTitle } from '../ui/SectionTitle'
export { LiveDot } from '../ui/LiveDot'
