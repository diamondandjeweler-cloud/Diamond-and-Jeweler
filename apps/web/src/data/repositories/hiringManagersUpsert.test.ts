import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Mock } from 'vitest'

/**
 * data-access-3: upsertHmCompanyLink must NOT clobber an existing custom
 * job_title. The old blanket `.upsert({ job_title:'Hiring Manager' })` overwrote
 * a title the HM set earlier (e.g. 'VP of Engineering') on every re-registration.
 * The corrected behaviour: when the HM row already exists, UPDATE only company_id
 * (job_title preserved); otherwise INSERT with the default title.
 */

const h = vi.hoisted(() => {
  const state: { existing: { id: string } | null } = { existing: null }
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder.select = vi.fn(self)
  builder.eq = vi.fn(self)
  builder.update = vi.fn(self)
  builder.insert = vi.fn(self)
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: state.existing, error: null }))
  // Make the builder awaitable → resolves to { error: null } for update/insert.
  builder.then = (res: (v: { error: null }) => void) => res({ error: null })
  return { state, builder }
})

vi.mock('../../lib/supabase', () => ({ supabase: { from: () => h.builder } }))

import { upsertHmCompanyLink } from './hiringManagers'

beforeEach(() => {
  h.state.existing = null
  ;(h.builder.update as Mock).mockClear()
  ;(h.builder.insert as Mock).mockClear()
  ;(h.builder.maybeSingle as Mock).mockClear()
})

describe('upsertHmCompanyLink (data-access-3)', () => {
  it('existing HM row: updates ONLY company_id — never rewrites job_title', async () => {
    h.state.existing = { id: 'hm-1' }

    const { error } = await upsertHmCompanyLink('p1', 'co-9')

    expect(error).toBeNull()
    expect(h.builder.insert as Mock).not.toHaveBeenCalled()
    expect(h.builder.update as Mock).toHaveBeenCalledTimes(1)
    const payload = (h.builder.update as Mock).mock.calls[0][0]
    expect(payload).toEqual({ company_id: 'co-9' })
    expect(payload).not.toHaveProperty('job_title')
  })

  it('no HM row yet: inserts with the default job_title', async () => {
    h.state.existing = null

    const { error } = await upsertHmCompanyLink('p2', 'co-2')

    expect(error).toBeNull()
    expect(h.builder.update as Mock).not.toHaveBeenCalled()
    expect(h.builder.insert as Mock).toHaveBeenCalledTimes(1)
    expect((h.builder.insert as Mock).mock.calls[0][0]).toEqual({
      profile_id: 'p2', company_id: 'co-2', job_title: 'Hiring Manager',
    })
  })
})
