/**
 * dsr-export
 *
 * Compiles a user's personal data into a JSON bundle, stores it in the
 * private `dsr-exports` bucket, and emails the user a signed-URL download.
 *
 * Trigger: admin marks an `access` or `portability` DSR `completed` via the
 * admin panel (DsrPanel calls this function).
 *
 * Authorization: admin / service-role only. The request body must reference
 * a `data_requests` row the caller is allowed to act on.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import { logAudit, extractIp } from '../_shared/audit.ts'

interface Body { request_id?: string }

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 h

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const body = (await req.json().catch(() => ({}))) as Body
  if (!body.request_id) return json({ error: 'Missing request_id' }, 400)

  const db = adminClient()

  const { data: request, error: reqErr } = await db
    .from('data_requests')
    .select('id, user_id, request_type, status')
    .eq('id', body.request_id)
    .maybeSingle()
  if (reqErr) return json({ error: reqErr.message }, 500)
  if (!request) return json({ error: 'Request not found' }, 404)
  if (!['access', 'portability'].includes(request.request_type)) {
    return json({ error: `Cannot export ${request.request_type} requests` }, 400)
  }

  // Gather every row owned by the user. Decrypt DOBs via the SQL helper
  // (service_role is allowed past decrypt_dob's gate).
  const userId = request.user_id

  const [
    profileRes, talentRes, hmRes, matchesRes, notifsRes,
    userTagsRes, consentRes, dsrsRes, waitlistRes, interviewsRes,
  ] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId).maybeSingle(),
    db.from('talents').select('*').eq('profile_id', userId).maybeSingle(),
    db.from('hiring_managers').select('*').eq('profile_id', userId).maybeSingle(),
    db.from('matches').select('*').or(
      // talent-side matches
      `talent_id.in.(${await resolveIds(db, 'talents', userId)}),role_id.in.(${await resolveRoleIds(db, userId)})`,
    ),
    db.from('notifications').select('*').eq('user_id', userId),
    db.from('user_tags').select('*').eq('user_id', userId),
    db.from('profiles').select('consents').eq('id', userId).maybeSingle(),
    db.from('data_requests').select('*').eq('user_id', userId),
    db.from('waitlist').select('*')
      .ilike('email', profileRes_email_placeholder(userId) ?? '—'),
    db.from('interviews').select('*').limit(0), // filled below after we know match IDs
  ])

  // Workaround for email-based waitlist join above; recompute cleanly:
  const email = (profileRes.data as { email?: string } | null)?.email
  const waitlist = email
    ? (await db.from('waitlist').select('*').ilike('email', email)).data ?? []
    : []

  // Interviews joined via match IDs.
  const matchIds = ((matchesRes.data ?? []) as Array<{ id: string }>).map((m) => m.id)
  const interviews = matchIds.length
    ? (await db.from('interviews').select('*').in('match_id', matchIds)).data ?? []
    : []

  // Decrypt DOBs where present.
  const decrypt = async (bytea: string | null | undefined): Promise<string | null> => {
    if (!bytea) return null
    const { data, error } = await db.rpc('decrypt_dob', { encrypted: bytea })
    if (error) return null
    return data as string | null
  }

  const talent = talentRes.data as Record<string, unknown> | null
  const hm = hmRes.data as Record<string, unknown> | null

  const exportBundle = {
    export_generated_at: new Date().toISOString(),
    subject_user_id: userId,
    request: {
      id: request.id,
      type: request.request_type,
      status: request.status,
    },
    profile: profileRes.data ?? null,
    talent: talent
      ? {
          ...talent,
          date_of_birth: await decrypt(talent.date_of_birth_encrypted as string | null),
          date_of_birth_encrypted: undefined,
        }
      : null,
    hiring_manager: hm
      ? {
          ...hm,
          date_of_birth: await decrypt(hm.date_of_birth_encrypted as string | null),
          date_of_birth_encrypted: undefined,
        }
      : null,
    matches: matchesRes.data ?? [],
    interviews,
    notifications: notifsRes.data ?? [],
    user_tags: userTagsRes.data ?? [],
    consents: (consentRes.data as { consents?: unknown } | null)?.consents ?? {},
    data_requests: dsrsRes.data ?? [],
    waitlist_entries: waitlist,
    _meta: {
      schema_version: '2026-04-21',
      note: 'All personal data held by DNJ for this user. Produced in response to a PDPA ' +
            `${request.request_type} request. Signed URLs to this file expire after 1 hour.`,
    },
  }

  const filePath = `${userId}/${request.id}.json`
  const bytes = new TextEncoder().encode(JSON.stringify(exportBundle, null, 2))

  const { error: upErr } = await db.storage
    .from('dsr-exports')
    .upload(filePath, bytes, {
      contentType: 'application/json',
      upsert: true,
      cacheControl: '0',
    })
  if (upErr) return json({ error: `upload: ${upErr.message}` }, 500)

  const { data: signed, error: signErr } = await db.storage
    .from('dsr-exports')
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)
  if (signErr) return json({ error: `sign: ${signErr.message}` }, 500)

  // Fire notification with download URL.
  const notifyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify`
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  fetch(notifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${svcKey}` },
    body: JSON.stringify({
      user_id: userId,
      type: 'dsr_export_ready',
      data: {
        request_type: request.request_type,
        download_url: signed.signedUrl,
        ttl_hours: SIGNED_URL_TTL_SECONDS / 3600,
      },
    }),
  }).catch(() => { /* best effort */ })

  // Audit: DSR export completed + file ready for download
  await logAudit({
    actorId:      auth.userId ?? null,
    actorRole:    'admin',
    subjectId:    userId,
    action:       'dsr_completed',
    resourceType: 'dsr',
    resourceId:   request.id,
    ip:           extractIp(req),
    metadata:     { request_type: request.request_type, size_bytes: bytes.byteLength },
  })

  return json({ ok: true, file_path: filePath, size_bytes: bytes.byteLength })
})

/** Returns a comma-joined list of talent IDs owned by the user, or 'NULL' if none. */
async function resolveIds(
  db: ReturnType<typeof adminClient>,
  table: 'talents',
  userId: string,
): Promise<string> {
  const { data } = await db.from(table).select('id').eq('profile_id', userId)
  const ids = (data ?? []).map((r: { id: string }) => r.id)
  return ids.length ? ids.join(',') : '00000000-0000-0000-0000-000000000000'
}

/** Returns role IDs the user owns as a hiring manager. */
async function resolveRoleIds(
  db: ReturnType<typeof adminClient>,
  userId: string,
): Promise<string> {
  const { data: hm } = await db.from('hiring_managers').select('id').eq('profile_id', userId).maybeSingle()
  if (!hm) return '00000000-0000-0000-0000-000000000000'
  const { data: roles } = await db.from('roles').select('id').eq('hiring_manager_id', hm.id)
  const ids = (roles ?? []).map((r: { id: string }) => r.id)
  return ids.length ? ids.join(',') : '00000000-0000-0000-0000-000000000000'
}

/** Helper stub to keep the `.or(...)` call above shape-stable when email unknown. */
function profileRes_email_placeholder(_userId: string): string | null {
  return null
}
