# ADR — Admin MFA policy (ACCEPTED, 2026-06-30)

**Status:** Accepted · **Owner decision** · revisit if the threat model changes.

## Decision
Admin MFA stays as currently implemented. This is a deliberate, reviewed choice —
not an oversight. Re-audits keep flagging it; this record is the answer.

- **OAuth (Google) admins skip the TOTP challenge.** Google sign-in is treated as
  strong auth (the account's own 2FA is the second factor). See
  `apps/web/src/components/AdminGate.tsx:74-82`.
- **Password admins must enrol + pass a TOTP challenge** before reaching `/admin`.
- **A `@dnj-test.my` bypass exists for automated smoke tests only.** It is gated by
  `import.meta.env.DEV && VITE_BYPASS_ADMIN_MFA === 'true'`
  (`AdminGate.tsx:11-19`), so it **cannot** activate in a production bundle even if
  the env var is set in prod — `import.meta.env.DEV` is compiled to `false` there.

## Why this is acceptable
`AdminGate` is a **client-side UX gate**, not the security boundary. Every
privileged action is enforced **server-side** by `is_admin()` + RLS + the
`SECURITY DEFINER` admin RPCs, which do **not** consult the client's AAL. So the
worst case of the OAuth-skip is a UX-routing difference, not unauthorised data
access: a caller who never passes the client gate still cannot execute an admin
RPC without an admin JWT, and forging that requires compromising the Supabase auth
secret, not bypassing this component.

The residual risk is narrow: an admin whose **Google account has no 2FA** is
effectively single-factor at the client gate. That is mitigated operationally
(require Google Workspace 2FA for admin accounts) rather than in code.

## When to revisit (→ flip to mandatory TOTP for all admins)
- Admin accounts move off Google Workspace / lose enforced 2FA.
- A compliance regime (SOC 2 / ISO 27001) requires app-level MFA for all admins.
- An incident shows the server-side `is_admin()` boundary is insufficient on its own.

Implementation to flip: make the `aal === 'aal2'` requirement unconditional in
`AdminGate` (remove the OAuth early-return at :74-82), add an automated test of the
enrol → challenge path, and consider an edge-side AAL assertion on admin RPCs.
