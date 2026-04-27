/**
 * MyInvois (LHDN Malaysia) helper
 * - Resolves sandbox vs production base URL
 * - Loads per-branch credentials from Vault (via supabase-js secret name lookup)
 * - Wraps the submission HTTP call with classifier (transient vs permanent error)
 *
 * NOTE: signing of the JSON document with an LHDN-issued .p12 certificate is
 * stubbed below. When real credentials are available, fill in `signPayload`
 * with the actual XAdES detached-signature flow per LHDN MyInvois SDK.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export type Environment = 'sandbox' | 'production'

export interface MyInvoisConfig {
  branch_id: string
  tin: string | null
  environment: Environment
  client_id_secret_name: string | null
  client_secret_secret_name: string | null
  cert_secret_name: string | null
  cert_password_secret_name: string | null
  is_active: boolean
}

export interface MyInvoisCreds {
  client_id: string
  client_secret: string
  cert_b64?: string
  cert_password?: string
}

export interface SubmitResult {
  ok: boolean
  uin?: string
  qr?: string
  response?: unknown
  error?: string
  retriable: boolean
}

const SANDBOX_BASE = 'https://preprod-api.myinvois.hasil.gov.my'
const PRODUCTION_BASE = 'https://api.myinvois.hasil.gov.my'

export function resolveBaseUrl(env: Environment): string {
  return env === 'production' ? PRODUCTION_BASE : SANDBOX_BASE
}

/** Look a secret up in Vault. Returns null if missing. */
export async function readVaultSecret(
  admin: SupabaseClient,
  name: string | null,
): Promise<string | null> {
  if (!name) return null
  // vault.decrypted_secrets is exposed as a view; admin client (service-role) can read it.
  const { data, error } = await admin
    .schema('vault' as 'public')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('name', name)
    .maybeSingle()
  if (error) return null
  return (data as { decrypted_secret: string } | null)?.decrypted_secret ?? null
}

export async function loadCreds(
  admin: SupabaseClient,
  cfg: MyInvoisConfig,
): Promise<MyInvoisCreds | null> {
  const client_id = await readVaultSecret(admin, cfg.client_id_secret_name)
  const client_secret = await readVaultSecret(admin, cfg.client_secret_secret_name)
  if (!client_id || !client_secret) return null
  return {
    client_id,
    client_secret,
    cert_b64: (await readVaultSecret(admin, cfg.cert_secret_name)) ?? undefined,
    cert_password: (await readVaultSecret(admin, cfg.cert_password_secret_name)) ?? undefined,
  }
}

/**
 * Acquire an OAuth2 access token from MyInvois.
 * The real endpoint and grant type follow LHDN spec (client_credentials).
 */
export async function getAccessToken(
  baseUrl: string,
  creds: MyInvoisCreds,
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        scope: 'InvoicingAPI',
      }),
    })
    if (!res.ok) return null
    const j = await res.json() as { access_token?: string }
    return j.access_token ?? null
  } catch {
    return null
  }
}

/**
 * Sign the canonical document. Currently a no-op pass-through; integrate
 * LHDN-provided signing when a real .p12 cert is available.
 */
export function signPayload(payload: unknown, _creds: MyInvoisCreds): unknown {
  return {
    document: payload,
    signature: {
      // TODO: real XAdES detached signature from .p12
      stub: true,
      generated_at: new Date().toISOString(),
    },
  }
}

/** Classify HTTP/network failures. Transient = retry; permanent = escalate. */
export function isRetriable(status: number, err?: string): boolean {
  if (err && /timeout|network|fetch/i.test(err)) return true
  if (status === 0 || status === 408 || status === 429) return true
  if (status >= 500 && status < 600) return true
  return false
}

/** Submit a signed document to MyInvois. */
export async function submitDocument(
  baseUrl: string,
  token: string,
  signed: unknown,
): Promise<SubmitResult> {
  try {
    const res = await fetch(`${baseUrl}/api/v1.0/documentsubmissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(signed),
    })
    const text = await res.text()
    let json: Record<string, unknown> | null = null
    try { json = text ? JSON.parse(text) : null } catch { /* ignore */ }

    if (!res.ok) {
      return {
        ok: false,
        response: json ?? text,
        error: `HTTP ${res.status}: ${json?.['error'] ?? text.slice(0, 200)}`,
        retriable: isRetriable(res.status),
      }
    }
    const j = (json ?? {}) as Record<string, unknown>
    const uin = (j.uuid ?? j.uin ?? j.UIN) as string | undefined
    const qr  = (j.longId ?? j.qr_code ?? j.qr) as string | undefined
    if (!uin) {
      return {
        ok: false,
        response: j,
        error: 'Validated response missing UIN',
        retriable: false,
      }
    }
    return { ok: true, uin, qr, response: j, retriable: false }
  } catch (e) {
    return {
      ok: false,
      error: (e as Error).message,
      retriable: isRetriable(0, (e as Error).message),
    }
  }
}
