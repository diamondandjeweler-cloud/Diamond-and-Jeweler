/**
 * Restaurant data access layer.
 *
 * All Supabase calls for the restaurant feature go through this module so the
 * future migration to its own Supabase project is a one-file swap.
 * Uses `.schema('restaurant')` which is supported by @supabase/supabase-js v2
 * as long as the schema is exposed in PostgREST's db_schema config (it is).
 *
 * P5: the god-DAL was split by sub-domain into ./data/*. This module is now a
 * barrel that re-exports every function verbatim-relocated there, so existing
 * `import { X } from '.../store'` call sites keep resolving unchanged.
 */
export * from './data/branches'
export * from './data/tables'
export * from './data/reservations'
export * from './data/menu'
export * from './data/inventory'
export * from './data/purchasing'
export * from './data/employees'
export * from './data/orders'
export * from './data/tickets'
export * from './data/payments'
export * from './data/promotions'
export * from './data/membership'
export * from './data/audit'
export * from './data/courses'
export * from './data/transfers'
export * from './data/dashboard'
export * from './data/org'
export * from './data/payroll'
export * from './data/shifts'
export * from './data/notifications'
