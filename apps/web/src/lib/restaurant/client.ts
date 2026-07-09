/**
 * Restaurant schema access handle.
 *
 * The global `supabase` client is now typed with <Database> (public schema
 * only). The restaurant.* schema is NOT in `types/db.generated.ts`, so a typed
 * `supabase.schema('restaurant')` rejects every restaurant table and RPC name
 * and cascades ~500 tsc errors across restaurant call sites.
 *
 * We isolate all restaurant schema access behind this ONE deliberately-untyped
 * handle so the typed global client stops leaking into restaurant call sites.
 * The handle is derived by viewing the global client as an *untyped*
 * SupabaseClient (Database = any) before calling `.schema('restaurant')`, which
 * reproduces the exact permissive behaviour restaurant call sites had before the
 * <Database> generic was added: `restaurantDb.from(anyTable).select(...).eq(...)`
 * and `restaurantDb.rpc(...)` accept arbitrary table/RPC names, and `.select()`
 * still resolves to an array-typed result so `.map`/`.reduce`/`.filter`
 * callbacks keep their contextual typing (a bare `any` handle would regress
 * those to implicit-any errors).
 *
 * Generating and wiring real types for restaurant.* is tracked under P5.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export const restaurantDb = (supabase as unknown as SupabaseClient).schema('restaurant')
