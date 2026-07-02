/**
 * Shared-domain home for the recruitment matcher (Phase 6 clean-arch).
 *
 * The authoritative scorer + reasoning implementation lives in the Deno edge
 * package (`supabase/functions/_shared/match-{scoring,reasoning}.ts`), where the
 * async match pipeline consumes it. Web-side code (currently only the
 * golden-vector test oracles) must NOT reach across the package boundary with
 * deep `../../../../` relative paths — it imports the matcher through THIS single
 * barrel instead. This is the one chokepoint to update if the matcher is ever
 * lifted into a first-class shared package consumable by both web and Deno.
 *
 * Pure re-export: no logic, byte-identical to the source. The scorer/reasoning
 * math is a §6 danger zone (owner-gated, byte-identical against the
 * match-core/match-scoring/match-reasoning test oracles) — this file must never
 * add, wrap, or alter behavior.
 */
export * from '../../../../../../supabase/functions/_shared/match-scoring'
export * from '../../../../../../supabase/functions/_shared/match-reasoning'
