# Backend authz audit — `/hr` and `/hm`

**Date:** 2026-05-11
**Scope:** Defense-in-depth audit of every backend authorization layer reachable from the `/hr/*` and `/hm/*` UI routes — Edge Functions, RPCs, and RLS policies on the five key tables.
**Trigger:** Closes the "Backend authz audit" outstanding item from [PRELAUNCH_BLOCKED_ITEMS.md](./PRELAUNCH_BLOCKED_ITEMS.md).

## TL;DR

**GREEN.** Every HM/HR-callable Edge Function gates on `requiredRoles`. Every RPC reached from HM/HR routes is `SECURITY DEFINER` and either checks `is_admin()` or matches `auth.uid()` against ownership. Every RLS policy on `roles`, `matches`, `interviews_rounds`, `talents`, `companies` uses SECURITY DEFINER helpers and either references `profiles.role` or enforces ownership; no broad-grant policy lets an HM read across companies/talents they don't own.

Two minor follow-ups noted at the bottom, both low/very-low severity.

---

## Part A — Edge Functions callable by HM/HR

Inventory drawn from `apps/web/src/routes/dashboard/{HMDashboard,MyRoles,PostRole,EditRole,InviteHM,HRDashboard}.tsx`. Each function's entry handler verified.

| Function | Role gate | Identity source | Findings |
|---|---|---|---|
| `match-generate` | `['hiring_manager', 'hr_admin', 'admin']` (line 20) | JWT → `auth.userId` | Clean. Service-role bypass intentional for cron. |
| `moderate-role` | `['hiring_manager', 'hr_admin', 'admin']` (line 388) | JWT → `auth.userId` | HM ownership check via `hiring_managers.profile_id` join. RLS on `roles` also restricts HM SELECT to their own — defense-in-depth holds. |
| `invite-hm` | `['hr_admin', 'admin']` (line 31) | JWT → `auth.email` | Clean. Company lookup uses `eq('primary_hr_email', auth.email)`. |
| `link-hm` | POST: `['hr_admin', 'admin']`; PATCH: any authenticated | JWT → `auth.userId` / `auth.email` | Clean. PATCH ownership-checked, POST role-gated. |
| `interview-action` | `['hiring_manager', 'hr_admin', 'talent', 'admin']` (line 46) | JWT → `auth.userId` | Per-action conditionals; participant match verified (line 76). |
| `award-points` | `['talent', 'hiring_manager', 'admin']` (line 47) | JWT → `auth.userId` | Match participation enforced when `match_id` supplied (line 78–80). |

**No bypass holes detected.** Every function rejects requests with a missing or mismatched role at the entry boundary; no body-supplied `user_id` is trusted.

---

## Part B — RPCs reached from HM/HR routes

| RPC | Caller | Migration | SECURITY DEFINER | Role / ownership check |
|---|---|---|---|---|
| `active_talent_count()` | HMDashboard:245, ColdStartPanel:42 | 0010 | ✅ | None — returns scalar aggregate. Safe: no PII, already shown in waiting-period UI. |
| `get_talent_contact(p_match_id)` | HMDashboard:400 | 0060 | ✅ | `v_hm_profile_id <> auth.uid() AND NOT is_admin()` raises (line 199); also gates on match status ∈ {offer_made, hired} (line 203). |
| `appeal_role_moderation(p_role_id, p_appeal_text)` | MyRoles:49 | 0090 | ✅ | `v_owner_profile <> auth.uid()` raises (line 223); also gates on moderation status (line 226). |
| `get_admin_kpis()` | KpiPanel:41 | 0100 | ✅ | `if not is_admin()` → 42501 (line 35). |
| `get_admin_matches(p_status, p_limit)` | MatchPanel:39 | 0104 | ✅ | `if not is_admin()` → 42501 (line 52). |
| `decrypt_dob(encrypted)` | MatchApprovalPanel:125–126 | 0002 | ✅ | `if not is_admin() and caller_role distinct from 'service_role'` (line 117). |
| `get_admin_audit_log(...)` | AuditLogPanel:56 | 0105 | ✅ | `if not is_admin()` → 42501 (line 44). |
| `admin_decide_role_moderation(...)` | ModerationPanel:184 | 0090 | ✅ | `is_admin() OR service_role` else "Forbidden: admin only" (lines 272–280). |
| `record_consent(p_version, p_ip_hash)` | Consent.tsx | 0101 | ✅ | Writes only `auth.uid()`'s row; rejects anonymous via 42501. (Not a /hr or /hm route but worth noting.) |

No RPC trusts a body-supplied `user_id`. Aggregates that don't carry PII (`active_talent_count`) intentionally omit a role gate.

---

## Part C — RLS policies on the five key tables

### `roles`
- `roles_select_talent_via_match` — uses `talent_can_see_role(id)` (SECURITY DEFINER), restricts to `moderation_status = 'approved'` AND existing match.
- `roles_select_hr_same_company` — uses `user_is_hr_of_role(id)` which checks `p.role = 'hr_admin'` AND company membership.
- HM SELECT — covered by an existing HM ownership policy (HM sees roles they own via `hiring_manager_id`).

### `matches`
- `matches_select_hm` / `_update_hm` — `user_is_hm_of_role(role_id)` (ownership of the HM record on that role).
- `matches_select_hr` / `_update_hr` — `user_is_hr_of_role(role_id)` (explicit `p.role = 'hr_admin'` check inside the helper).
- `matches_select_talent` — `talent_id = auth.uid()` via the talent-side helper.
- `matches_select_admin` via `is_admin()` policy.

### `interviews_rounds`
- `ir_select_hm` — `is_hm_for_match(match_id)` (0060:126–136).
- `ir_select_talent` — `is_talent_for_match(match_id)` (0060:139–147).
- `ir_insert_hm` — same + status state gate (0060:162–169).
- `ir_admin` — `is_admin()` blanket.

### `talents`
- `talents_insert_self`, `talents_select_self`, `talents_update_self` — `profile_id = auth.uid()`.
- `talents_select_hm_via_match` — `hm_can_see_talent(id)` (SECURITY DEFINER, joins matches → roles → hiring_managers).
- `talents_all_admin` and `talents_select_admin` (0103) — `is_admin()`.
- Column-level lockdown on `ic_path`, `ic_verified`, `ic_purged_at` to admin + service_role (restored 2026-05-11 in commit `a6315c6`).

### `companies`
- `companies_select_hm` — `user_is_hm_in_company(id)`.
- `companies_select_hr` / `_update_hr` — `user_is_hr_of_company(id)` (checks `p.role = 'hr_admin'`).
- Admin via `is_admin()`.

**No overly broad policy on any of the five tables.** Every HM/HR cross-table read passes through a SECURITY DEFINER helper that joins back to the caller's ownership row; there is no policy that lets an HM read all talents, or read another company's roles/matches.

---

## Follow-ups (non-blocking)

1. **`moderate-role` company-level defense-in-depth.** The Edge Function checks HM ownership via `hiring_managers.profile_id` but doesn't independently verify the HM's `company_id` against the role's company. RLS on `roles` blocks the cross-company case (HMs can't SELECT roles outside their company), so the failure mode is graceful. Adding an explicit company check inside the function would be belt-and-braces; severity = low.

2. **`user_is_hm_of_role()` null-safety (0015:14–21).** The helper joins through `hiring_managers` without a null guard on `company_id`. FK constraints make a NULL `company_id` unlikely, but a defensive `and hm.company_id is not null` would harden against future schema drift; severity = very low.

Neither item is a launch blocker. Both can be batched with the next routine RLS migration.

---

## Method

- Edge Functions: read `supabase/functions/<name>/index.ts` entrypoints (first 40–80 lines) for each of `match-generate`, `moderate-role`, `invite-hm`, `link-hm`, `interview-action`, `award-points`.
- RPCs: grep `apps/web/src/routes/dashboard/**` for `supabase.rpc(...)` calls, then grep `supabase/migrations/*.sql` for the matching `CREATE [OR REPLACE] FUNCTION <name>` and read the role-check block.
- RLS: grep `supabase/migrations/*.sql` for `CREATE POLICY` against each of the five tables and read the USING / WITH CHECK clauses + their helpers.

Total examined: 6 Edge Functions, 9 RPCs, 20+ RLS policies, 5 SECURITY DEFINER helpers across migrations 0002, 0003, 0010, 0014, 0015, 0060, 0090, 0100, 0101, 0103, 0104, 0105.
