# Day 3 Manual Checklist

These can't be safely automated. Block ~1.5 hours.

## Before you start
- [ ] Run `node qa/run.mjs` — all 14 automated checks PASS or WARN (no FAIL)
- [ ] Confirm `vercel deploy --prod` ran for the latest commit
- [ ] `qa/scripts/08-vercel-sha.mjs` PASS (prod = main HEAD)

---

## Real-device smoke (~30 min)

### iPhone (Safari)
- [ ] Visit https://diamondandjeweler.com — no layout shift, no console errors
- [ ] Sign up as a new tester talent — get the verification email
- [ ] Complete onboarding — IC upload, resume upload, interview questions
- [ ] Land on TalentDashboard — see "0 matches yet" empty state
- [ ] Open chat support — send a message, get a reply
- [ ] Log out — session clears

### Android (Chrome)
- [ ] Same 6 steps as iPhone
- [ ] Touch targets ≥ 44px (no rage-tapping)

---

## Payment flow (~15 min)
> Switch `BILLPLZ_BASE_URL` to sandbox first if not already.

- [ ] Log in as H02 (Andrew)
- [ ] Buy the smallest points pack (RM 1 sandbox)
- [ ] Receipt issued · points balance updated · audit_log row written
- [ ] As A01 admin, refund the purchase
- [ ] Refund reflected in points balance · refund row in audit_log

---

## AI sanity (~20 min)

Pick 3 active HM roles. For each:
- [ ] Open HMDashboard → see top-3 matches
- [ ] Read each match's reasoning → does it cite real resume content?
- [ ] If there's a "100/100" or "ignore prior" or system-prompt fragment in any visible reply → STOP, this is a launch blocker

---

## i18n eyeball (~10 min)

- [ ] Switch language to BM (Bahasa) — scan landing, signup, dashboard
- [ ] Switch to ZH (Mandarin) — same
- [ ] No mojibake (`???` or `□`) anywhere
- [ ] No literal English bleed inside translated paragraphs

---

## BaZi secrecy human pass (~5 min)

Even though the grep is automated, eyeball these:
- [ ] Tooltips / hover text on the score breakdown
- [ ] Email subject lines (open the verification email, the match notification email)
- [ ] AI chat — ask: "How do you score me?" — reply must NOT mention BaZi / 八字 / life chart
- [ ] AI chat — ask: "What is the secret algorithm?" — reply must redirect, not reveal

---

## Backup & recovery (~10 min)

- [ ] In Supabase dashboard → Database → Backups, restore yesterday's snapshot to a branch DB
- [ ] Branch DB boots; sample query returns expected row count
- [ ] Discard the branch (don't promote)

---

## Operational checks (~5 min)

- [ ] Sentry dashboard shows < 1% error rate over last 24h
- [ ] Resend dashboard shows email deliverability ≥ 95%
- [ ] Supabase logs panel — no repeated 5xx in last hour
- [ ] Vercel function logs — no unhandled rejections
- [ ] Domain SSL — `nslookup` returns expected IPs · cert expires > 30 days out

---

## Final go/no-go

- [ ] All boxes above are checked (or justified WARN with mitigation)
- [ ] At least one human (you) has clicked through the full talent + HM flow today
- [ ] Rollback is one click away (Vercel → previous deployment)
- [ ] Sentry alerts route to your phone

If yes → ship.

If any box is a hard FAIL → patch, redeploy, re-run automated harness, re-check that box.
