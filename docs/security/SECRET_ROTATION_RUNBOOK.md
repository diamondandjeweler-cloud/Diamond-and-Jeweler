# Secret Rotation Runbook

_Last reviewed: 2026-06-26. Owner: Platform/Eng lead._

This is the proactive procedure for rotating BoLe's secrets. Rotate **all** secrets once before public launch, then on the cadence below or immediately on any suspected exposure. Secrets live in **Supabase Vault** (cron), **Supabase Edge Function secrets** (`supabase secrets set`), and **Vercel env** (frontend `VITE_*`). Never in committed code — `.env.local` is git-ignored and must stay untracked.

## 0. Pre-launch one-time rotation
Before the first public deploy, rotate every secret below from its provider dashboard so no value that ever sat in a local `.env.local` or chat/log is live. Tick each in §2.

## 1. Rotation cadence
| Secret class | Cadence | Trigger-now also if |
|---|---|---|
| Supabase service-role key | 90 days | laptop loss, contractor offboard, suspected leak |
| Payment gateway (Billplz, ToyyibPay) | 90 days | any webhook anomaly / chargeback fraud |
| Email (Resend API key + webhook secret) | 180 days | bounce/abuse spike |
| LLM / AI provider keys | 180 days | unexpected billing, provider breach notice |
| Cloudflare API token, WATI, VAPID, Daily | 180 days | provider breach notice |
| Anything pasted into a ticket, log, or chat | Immediately | — |

## 2. Inventory (rotate in this order: low-blast-radius first)
Source of truth = `supabase/functions/*` `Deno.env.get(...)` + `supabase/migrations/0005_cron.sql` Vault + `.env.example`. Regenerate this list before each rotation with: `grep -rhoE "Deno\.env\.get\(['\"][A-Z0-9_]+['\"]\)" supabase/functions/ | grep -oE "[A-Z0-9_]+" | sort -u`.

> **Numbered-key pattern:** some providers are configured with multiple round-robin keys suffixed `_2`, `_3`, … (currently Groq — see below). When rotating such a provider, rotate **every** numbered variant in the same window, and re-run the grep above to catch any new ones added since this doc was reviewed.

**Frontend (Vercel env — public, low risk):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_SENTRY_DSN`, `VITE_VAPID_PUBLIC_KEY`, `VITE_TURNSTILE_SITE_KEY` (public site key — pair its server-side secret rotation with Cloudflare if/when one is configured).

**Edge Function secrets (`supabase secrets set`):**
- Core: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, `ALLOWED_ORIGIN`, `EDGE_ENV`
- Email: `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `EINVOICE_FROM_EMAIL`
- Payments: `BILLPLZ_API_KEY`, `BILLPLZ_BASE_URL`, `BILLPLZ_COLLECTION_ID`, `TOYYIBPAY_SECRET`, `TOYYIBPAY_BASE_URL`, `TOYYIBPAY_CATEGORY_CODE`
- Messaging/push: `WATI_API_KEY`, `WATI_API_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `DAILY_API_KEY`
- Infra: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- AI providers: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `COHERE_API_KEY`, `GROQ_API_KEY`, `GROQ_API_KEY_2`, `GROQ_API_KEY_3`, `GROQ_API_KEY_4`, `GROQ_API_KEY_5`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `TOGETHER_API_KEY`, `VOYAGE_API_KEY`, `JINA_API_KEY`, `NOMIC_API_KEY`, `HF_API_TOKEN`, `BAZI_REMOTE_URL`, `BAZI_REMOTE_TOKEN`

**Supabase Vault (cron — `supabase/migrations/0005_cron.sql`):** `service_role_key`, `supabase_url`.

> Regenerate the edge/AI lists with the grep above before each rotation — the inventory drifts as functions are added.

## 3. Procedure per secret
1. **Issue new** value in the provider dashboard (keep old valid — most providers allow two live keys).
2. **Update store(s):**
   - Edge: `supabase secrets set NAME=newvalue` (see `docs/deploy.md` §"Set secrets").
   - Vercel: Project → Settings → Environment Variables → edit → redeploy.
   - Vault (`service_role_key` rotation only): in SQL editor
     ```sql
     select vault.update_secret(id, 'NEW-SERVICE-ROLE-KEY')
     from vault.secrets where name = 'service_role_key';
     ```
     then re-verify per `docs/deploy.md` §2a:
     ```sql
     select count(*) from vault.decrypted_secrets
     where name in ('supabase_url', 'service_role_key');  -- expect 2
     ```
3. **Verify live:** trigger the dependent path (send a test email / run a sandbox payment / fire one cron via the §2a checklist) and confirm 200s.
4. **Revoke old** value in the provider dashboard.
5. **Log** date + secret name + operator in the change log / incident ticket.

## 4. Special cases
- **`SUPABASE_SERVICE_ROLE_KEY`** appears in BOTH Edge secrets AND Vault (`0005_cron.sql`). Rotate in BOTH places in the same window or cron silently fails (it is a no-op without the Vault value — see `docs/deploy.md` §2a, and the `cron_deadman_check` alert added in `0154`).
- **JWT secret:** do NOT rotate during business hours — it invalidates every active session. Use a pre-announced maintenance window.
- **Payment gateway secrets:** rotate during low-traffic window; an in-flight checkout signed with the old key can fail verification.
- **Groq (`GROQ_API_KEY` + `GROQ_API_KEY_2..5`):** round-robin keys read together. Rotate all five in the same window; missing one leaves a live key un-rotated.

## 5. On suspected exposure
Switch to incident mode: contain → rotate the affected secret(s) per §3 → notify per your breach-response process, then complete the relevant rows in §2 here.
