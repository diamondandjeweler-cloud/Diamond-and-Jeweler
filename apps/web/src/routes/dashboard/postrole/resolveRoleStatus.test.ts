import { describe, it, expect } from 'vitest'
import { resolveRoleStatus } from './resolveRoleStatus'

/*
 * Characterization test for the PostRole edit-mode status guardrail.
 *
 * The regression this guards against: re-pointing MyRoles / ModerationPanel "Edit"
 * at PostRole must NOT let a save silently reactivate a paused role. Only the
 * onboarding-draft activation (fromOnboarding && paused) may flip status to active
 * on update; every other update omits status so the existing value is preserved.
 */
describe('resolveRoleStatus()', () => {
  it('INSERT always activates a brand-new role', () => {
    expect(resolveRoleStatus({ mode: 'insert', fromOnboarding: false, current: null })).toEqual({ status: 'active' })
    expect(resolveRoleStatus({ mode: 'insert', fromOnboarding: true, current: 'paused' })).toEqual({ status: 'active' })
  })

  it('UPDATE of a paused role does NOT set status (status omitted → preserved)', () => {
    const patch = resolveRoleStatus({ mode: 'update', fromOnboarding: false, current: 'paused' })
    expect(patch).toEqual({})
    expect('status' in patch).toBe(false)
  })

  it('UPDATE of an active role does NOT set status (status omitted → preserved)', () => {
    expect(resolveRoleStatus({ mode: 'update', fromOnboarding: false, current: 'active' })).toEqual({})
  })

  it('UPDATE with fromOnboarding + paused DOES activate (onboarding draft review)', () => {
    expect(resolveRoleStatus({ mode: 'update', fromOnboarding: true, current: 'paused' })).toEqual({ status: 'active' })
  })

  it('UPDATE with fromOnboarding but NOT paused omits status (already-live onboarding role stays put)', () => {
    expect(resolveRoleStatus({ mode: 'update', fromOnboarding: true, current: 'active' })).toEqual({})
    expect(resolveRoleStatus({ mode: 'update', fromOnboarding: true, current: 'filled' })).toEqual({})
  })
})
