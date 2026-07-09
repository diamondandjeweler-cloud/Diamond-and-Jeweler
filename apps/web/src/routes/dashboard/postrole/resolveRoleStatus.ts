/**
 * Decide the `status` field patch for a role save in PostRole's submit handler.
 *
 * PostRole previously hard-coded `status: 'active'` in the SHARED payload used by
 * both the INSERT and the UPDATE branch. That was safe only because edit-mode had
 * a single caller — the onboarding "Review & activate" link — which always saves a
 * paused, from_onboarding draft (activating it is the whole point).
 *
 * Once the PRIMARY "Edit" entry points (MyRoles' Edit button + the admin
 * ModerationPanel link) route here, that hard-code becomes a bug: saving an edit
 * of an already-active or a manually-PAUSED role would silently force it active.
 * This helper lifts the status decision out so it can differ by mode:
 *
 *  - insert → always `active` (a brand-new role goes live). Identical to before.
 *  - update → activate ONLY when re-opening an onboarding draft. This mirrors
 *    EditRole's exact activate rule (`fromOnboarding && status === 'paused'`).
 *    Otherwise OMIT `status` entirely so the DB preserves the row's current value
 *    (a paused role stays paused; an active role stays active).
 *
 * Returns an object to SPREAD into the payload: `{ status: 'active' }` or `{}`.
 * For the current onboarding caller (update + fromOnboarding + paused) it returns
 * `{ status: 'active' }`, i.e. a no-op relative to the old hard-coded behavior.
 */
export function resolveRoleStatus(args: {
  mode: 'insert' | 'update'
  fromOnboarding: boolean
  current: string | null | undefined
}): { status: 'active' } | Record<string, never> {
  if (args.mode === 'insert') return { status: 'active' }
  if (args.fromOnboarding && args.current === 'paused') return { status: 'active' }
  return {}
}
