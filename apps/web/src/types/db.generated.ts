/**
 * Loose DB types. Intended to be replaced by `supabase gen types typescript`
 * once the CLI can run here (Device Guard currently blocks the binary).
 *
 * While this placeholder is in place, the supabase client is instantiated
 * without a generic so `.from(...)` calls don't narrow to `never`.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json =
  | string | number | boolean | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = any
