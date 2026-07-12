// Demo auth users the seeded e2e flow depends on.
//
// This is the single source of truth shared by:
//   - tests/e2e/global-setup.ts  (creates these via auth.admin.createUser)
//   - tests/e2e/match-flow.spec.ts (logs in as one of them)
//
// These accounts only ever exist in a LOCAL / throwaway CI Supabase — never
// production. The password is a fixed non-secret used for local automation, so
// keeping it in the repo is intentional (mirrors reference_dnj_testers).
//
// The `role` values feed public.handle_new_user() via raw_user_meta_data:
// only talent | hiring_manager | hr_admin are honoured; 'admin' is coerced to
// 'talent' at signup (migration 0155), then seed_demo.sql elevates it via an
// explicit UPDATE. That mirrors how admin is provisioned out-of-band in prod.

export const DEMO_PASSWORD = 'DemoSeed#2026'

export type DemoRole = 'admin' | 'hr_admin' | 'hiring_manager' | 'talent'

export interface DemoUser {
  email: string
  fullName: string
  /** Requested signup role (see note above re: admin coercion). */
  role: DemoRole
}

// Order matters: HR is referenced as created_by by the company, and the HM +
// talents are referenced by hiring_managers / talents rows. All four (plus
// admin) must have profiles before seed_demo.sql runs. createUser fires the
// on_auth_user_created trigger which materialises public.profiles, so any order
// that creates all five before the SQL loads is fine — seed_demo.sql itself
// bails with a NOTICE (not an error) if a profile is missing.
export const DEMO_USERS: DemoUser[] = [
  { email: 'admin@diamondandjeweler.com', fullName: 'Demo Admin',   role: 'admin' },
  { email: 'hr@techco.my',                fullName: 'Demo HR',      role: 'hr_admin' },
  { email: 'hm@techco.my',                fullName: 'Demo HM',      role: 'hiring_manager' },
  { email: 'talent.alice@gmail.my',       fullName: 'Alice Talent', role: 'talent' },
  { email: 'talent.bob@gmail.my',         fullName: 'Bob Talent',   role: 'talent' },
]

/** Look up a demo user + attach the shared password. Throws if unknown. */
export function demoUser(email: string): DemoUser & { password: string } {
  const u = DEMO_USERS.find((x) => x.email === email)
  if (!u) throw new Error(`Unknown demo user: ${email}`)
  return { ...u, password: DEMO_PASSWORD }
}
