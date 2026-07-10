/**
 * Canonical UI module — one stable import surface for primitives + patterns:
 *
 *   import { Button, Card, Field, Alert, Async } from '../../ui'
 *
 * Phase 0 is a re-export shim over the existing single-file primitives
 * (../components/ui) plus the cross-cutting patterns. Later phases split each
 * primitive into its own src/ui/<Name>/ file behind THIS barrel, so consumers
 * never touch their import when that internal move happens.
 */
export * from '../components/ui'
export * from '../components/Modal'
export { Async } from '../components/patterns/Async'
export type { AsyncProps } from '../components/patterns/Async'
