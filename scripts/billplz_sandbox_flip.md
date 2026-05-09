# Flipping Billplz to sandbox

The `admin-refund` and `unlock-extra-match` Edge Functions read `BILLPLZ_BASE_URL`
from Supabase function secrets. To exercise pay-for-contact and refund flows
without real money, point them at the Billplz sandbox.

## Sandbox values

```
BILLPLZ_BASE_URL=https://www.billplz-sandbox.com
BILLPLZ_API_KEY=<sandbox API key from billplz-sandbox.com → Account → Settings → API Key>
BILLPLZ_COLLECTION_ID=<sandbox collection ID>
```

## Apply (NOT auto-run — review before executing)

```bash
# Production project
supabase secrets set \
  BILLPLZ_BASE_URL=https://www.billplz-sandbox.com \
  BILLPLZ_API_KEY=<SANDBOX_KEY> \
  BILLPLZ_COLLECTION_ID=<SANDBOX_COLLECTION>
```

## Verify

```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/unlock-extra-match \
  -H "Authorization: Bearer $TALENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"match_type":"talent_extra"}'
# → expect a payment_url that points at billplz-sandbox.com
```

## Revert to production

```bash
supabase secrets set \
  BILLPLZ_BASE_URL=https://www.billplz.com \
  BILLPLZ_API_KEY=<PRODUCTION_KEY> \
  BILLPLZ_COLLECTION_ID=<PRODUCTION_COLLECTION>
```

## Rollback note

`payment-webhook` validates incoming Billplz callbacks with the `BILLPLZ_X_SIGNATURE_KEY` —
that key is per-collection, so flipping `BILLPLZ_COLLECTION_ID` requires also flipping the
signature key, otherwise webhook verification will fail and pending purchases will stay
in `pending` state.
