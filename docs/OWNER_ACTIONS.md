# Owner Actions — things only you can safely do

_These are blocked on secrets, external services, or product decisions — I won't handle master credentials even under full autonomy. Ordered by impact. Last updated 2026-06-27._

---

## 🔴 P0 — Revive the match pipeline (5 minutes)

**Your entire async backbone has been dead since ~2026-05-30** (no new matches in 27 days). The service-role key was rotated but the Vault copy wasn't updated, so every cron→edge call returns 403. See [docs/ROAD_TO_A_PLUS.md](./ROAD_TO_A_PLUS.md).

1. Supabase Dashboard → **Project Settings → API** → copy the **`service_role`** secret key.
2. SQL Editor, run:
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'service_role_key'),
     '<paste the current service_role key>'
   );
   ```
3. Verify within ~1 minute (any one of):
   - `select * from public.cron_heartbeat;` → now has fresh rows.
   - `curl -s -o /dev/null -w "%{http_code}" https://diamondandjeweler.com/api/health` → **200** (was 503).
   - `select status_code, count(*) from net._http_response where created > now() - interval '5 min' group by 1;` → 200s, not 403s.

Once this is done, the matcher perf work I shipped (memoization + config batching) takes effect, and matches start generating again.

---

## 🟠 P1 — Point an external monitor at the new health endpoint (5 minutes)

So the next outage pages you instead of going unnoticed for a month. `/api/health` now returns **503** when the pipeline is dead, **200** when alive (shipped 2026-06-27).

- Sign up for any free uptime monitor (UptimeRobot, cron-job.org, Better Uptime).
- Monitor URL: **`https://diamondandjeweler.com/api/health`**, interval 5 min, alert after 2–3 consecutive failures (a `503` body shows `"healthy": false`).
- Right now it correctly reads 503 — it will go green the moment P0 above is fixed.

---

## 🟡 P2 — Product / config decisions (no rush, but they gate Security A+)

| Item | What's needed | Why |
|---|---|---|
| **Billplz webhook secret** | Set the signature secret in the Billplz dashboard so `payment-webhook` can verify live callbacks. | Until set, real Billplz callbacks can't be signature-verified (the code is fail-closed, so it's safe — just not functional for live payments). |
| **Admin MFA** | Decide: require a real TOTP factor for admins even on Google/OAuth login? (You skipped this earlier.) Today OAuth = blanket AAL2. | Caps Security below A+ until decided. If yes, I wire it + you enroll TOTP on the admin accounts. |
| **ToyyibPay** | I'm building the server-side callback verification (per your decision). No action needed unless you'd rather disable the consult path. | — |

---

## Notes
- I will not retrieve or write the `service_role` key, Billplz secrets, or any API token — handling master credentials is a hard line regardless of authorization. Everything above that involves a secret is yours to apply; everything else I'm doing autonomously.
- Status of the broader A+ effort: [docs/ROAD_TO_A_PLUS.md](./ROAD_TO_A_PLUS.md).
