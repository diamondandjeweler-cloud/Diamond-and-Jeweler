# DNJ Launch QA Harness

One-command pre-launch verification for diamondandjeweler.com.

## What it checks

| # | Check | Type |
|---|---|---|
| 01 | BaZi secrecy — no forbidden strings in shipped bundle / emails | grep |
| 02 | RLS sweep — every role × every PII table | SQL |
| 03 | IDOR probes — 5 cross-tenant endpoints | API |
| 04 | JWT tamper — forged / expired / wrong-role tokens rejected | API |
| 05 | AI determinism — match-generate same input ⇒ same output | API |
| 06 | Bias swap — 5 name pairs, score variance < 5% | API |
| 07 | Prompt injection — resume + chat payloads ignored | API |
| 08 | Vercel SHA — prod build matches main HEAD | HTTP |
| 09 | Dependency vulns — npm audit (high/critical) | CLI |
| 10 | Secret scan — gitleaks on repo | CLI |
| 11 | Tester accounts hidden — `@dnj-test.my` invisible in public search | API |
| 12 | DSR tenant isolation — export contains only owner's data | API |
| 13 | DOB leak scan — no decrypted DOBs in bundle / API responses | grep+API |
| 14 | Storage path-RLS — talent A can't fetch talent B's resume | API |

Plus 5 Playwright launch specs at `apps/web/tests/e2e/launch/`:
- `xss-injection.spec.ts`
- `auth-flows.spec.ts`
- `fake-hm-detection.spec.ts`
- `i18n-bleed.spec.ts`
- `idor-ui.spec.ts`

## Setup (one-time)

```bash
cd "C:\Users\DC\Desktop\Diamond and Jeweler"
cp qa/.env.qa.example qa/.env.qa
# Edit qa/.env.qa — fill in service-role key, Supabase PAT, Vercel token
```

## Run

```bash
# All checks (~6-10 min):
node qa/run.mjs

# Single check:
node qa/scripts/01-bazi-secrecy.mjs

# Playwright launch specs:
cd apps/web && npx playwright test tests/e2e/launch/
```

## Output

```
DNJ Launch QA — prod (https://diamondandjeweler.com)
─────────────────────────────────────────────────────
[01] BaZi secrecy           PASS   1247 files scanned, 0 hits
[02] RLS sweep              PASS   18 tables × 4 roles, all policies match
[03] IDOR probes            PASS   5/5 returned 403/404
[04] JWT tamper             PASS   4/4 rejected
[05] AI determinism         PASS   variance 0.0%
[06] Bias swap              WARN   pair3 variance 6.2% (>5%)
[07] Prompt injection       PASS   4/4 payloads ignored
[08] Vercel SHA             PASS   prod=82bbb96 = main HEAD
...
─────────────────────────────────────────────────────
12 PASS · 1 FAIL · 1 WARN · 6m 14s
```

## Exit codes

- `0` — all PASS / WARN
- `1` — any FAIL
- `2` — harness error (missing env, network failure)

## Manual checks (Day 3)

See `qa/manual-checklist.md`.
