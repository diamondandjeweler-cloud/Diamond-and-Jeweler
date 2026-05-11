# Flipping Billplz to sandbox

The `admin-refund`, `unlock-extra-match`, `buy-points`, and `payment-webhook`
Edge Functions read Billplz credentials from Supabase function secrets. To
exercise pay-for-contact / point-purchase / refund flows without real money,
point them at the Billplz sandbox.

## Current safety guard (since 0106 + this commit)

`buy-points/index.ts` and `unlock-extra-match/index.ts` now refuse to create
a real Billplz bill when **both** of these are true:

1. The authenticated user's email ends with `@dnj-test.my` (seeded tester).
2. `BILLPLZ_BASE_URL` points at `billplz.com` (production).

In that combination the functions force **mock mode** — they insert the
pending purchase row, return a `MOCK-…` bill ID + `/payment/mock?…` URL, and
no Billplz API call is ever made. Real-user emails are unaffected.

This is a belt-and-braces guard, not a substitute for the secret flip below.
Real human testers who don't use `@dnj-test.my` accounts will still hit
production Billplz until the secrets are flipped.

## Sandbox values

```
BILLPLZ_BASE_URL=https://www.billplz-sandbox.com
BILLPLZ_API_KEY=<sandbox API key from billplz-sandbox.com → Account → Settings → API Key>
BILLPLZ_COLLECTION_ID=<sandbox collection ID>
BILLPLZ_X_SIGNATURE_KEY=<sandbox X-Signature key — the per-collection signing secret>
```

## Apply (NOT auto-run — review before executing)

```bash
# Production project
supabase secrets set \
  BILLPLZ_BASE_URL=https://www.billplz-sandbox.com \
  BILLPLZ_API_KEY=<SANDBOX_KEY> \
  BILLPLZ_COLLECTION_ID=<SANDBOX_COLLECTION> \
  BILLPLZ_X_SIGNATURE_KEY=<SANDBOX_SIGNATURE_KEY>

# Then redeploy the four functions so they pick up the new secrets:
supabase functions deploy buy-points unlock-extra-match admin-refund payment-webhook
```

## Verify

```bash
# 1) Trigger a points buy as any logged-in non-test user
curl -X POST https://<your-project>.supabase.co/functions/v1/buy-points \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"package_id":"starter"}'
# → paymentUrl should be https://www.billplz-sandbox.com/bills/<id>

# 2) Trigger as a @dnj-test.my tester — should NEVER hit Billplz at all
curl -X POST https://<your-project>.supabase.co/functions/v1/buy-points \
  -H "Authorization: Bearer $TESTER_JWT" -H "Content-Type: application/json" \
  -d '{"package_id":"starter"}'
# → paymentUrl should be /payment/mock?... (mock mode forced)
```

## Revert to production

```bash
supabase secrets set \
  BILLPLZ_BASE_URL=https://www.billplz.com \
  BILLPLZ_API_KEY=<PRODUCTION_KEY> \
  BILLPLZ_COLLECTION_ID=<PRODUCTION_COLLECTION> \
  BILLPLZ_X_SIGNATURE_KEY=<PRODUCTION_SIGNATURE_KEY>

supabase functions deploy buy-points unlock-extra-match admin-refund payment-webhook
```

## Why the X-Signature key matters

`payment-webhook` validates incoming Billplz callbacks with the
`BILLPLZ_X_SIGNATURE_KEY`. The key is **per-collection**, so flipping
`BILLPLZ_COLLECTION_ID` without flipping the signature key will cause
webhook verification to fail and pending purchases will stay in `pending`
state forever (the webhook returns 401 to Billplz, which retries a few
times then gives up).

Always flip all four secrets together.
