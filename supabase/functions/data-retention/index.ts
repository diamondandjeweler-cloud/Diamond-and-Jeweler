/**
 * data-retention
 *
 * PDPA-aligned housekeeping. Runs daily via pg_cron at 02:00 MYT.
 *
 *   1. Purge IC document files (storage + ic_path) 30 days after ic_verified=true.
 *   2. Apply DSR 'deletion' requests: null out PII columns 30 days after the
 *      admin marks the request 'completed'. The account is also soft-banned.
 *
 * Authorization: admin / service-role only.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const db = adminClient()
  const results = { ic_files_purged: 0, dsr_deletions_applied: 0, errors: [] as string[] }

  // ---------- 1. IC retention ----------
  const { data: cfg } = await db.from('system_config').select('value')
    .eq('key', 'ic_retention_days_after_verify').maybeSingle()
  const retentionDays = typeof cfg?.value === 'number' ? cfg.value : 30
  const cutoffIso = new Date(Date.now() - retentionDays * 86400000).toISOString()

  const { data: toPurge, error: purgeErr } = await db.from('talents')
    .select('id, ic_path, updated_at')
    .eq('ic_verified', true)
    .is('ic_purged_at', null)
    .not('ic_path', 'is', null)
    .lt('updated_at', cutoffIso)
  if (purgeErr) results.errors.push(`ic select: ${purgeErr.message}`)

  for (const t of toPurge ?? []) {
    if (!t.ic_path) continue
    const { error: rmErr } = await db.storage.from('ic-documents').remove([t.ic_path])
    if (rmErr) { results.errors.push(`ic remove ${t.ic_path}: ${rmErr.message}`); continue }
    const { error: upErr } = await db.from('talents').update({
      ic_path: null, ic_purged_at: new Date().toISOString(),
    }).eq('id', t.id)
    if (upErr) { results.errors.push(`ic clear ${t.id}: ${upErr.message}`); continue }
    results.ic_files_purged++
  }

  // ---------- 2. DSR deletion processing ----------
  const { data: dsrs, error: dsrErr } = await db.from('data_requests')
    .select('id, user_id, resolved_at')
    .eq('request_type', 'deletion')
    .eq('status', 'completed')
    .not('resolved_at', 'is', null)
  if (dsrErr) results.errors.push(`dsr select: ${dsrErr.message}`)

  for (const d of dsrs ?? []) {
    if (!d.resolved_at) continue
    const ageMs = Date.now() - new Date(d.resolved_at).getTime()
    if (ageMs < retentionDays * 86400000) continue

    // Remove talent PII + files.
    const { data: talent } = await db.from('talents')
      .select('id, ic_path, resume_path, photo_path').eq('profile_id', d.user_id).maybeSingle()
    if (talent) {
      if (talent.ic_path) await db.storage.from('ic-documents').remove([talent.ic_path]).catch(() => {})
      if (talent.resume_path) await db.storage.from('resumes').remove([talent.resume_path]).catch(() => {})
      if (talent.photo_path) await db.storage.from('talent-photos').remove([talent.photo_path]).catch(() => {})

      await db.from('talents').update({
        date_of_birth_encrypted: null,
        ic_path: null,
        resume_path: null,
        photo_path: null,
        parsed_resume: null,
        interview_answers: null,
        preference_ratings: null,
        derived_tags: null,
        is_open_to_offers: false,
      }).eq('id', talent.id)
    }

    // Remove HM/company PII + business license files.
    const { data: hm } = await db.from('hiring_managers')
      .select('id, date_of_birth_encrypted, leadership_answers, leadership_tags').eq('profile_id', d.user_id).maybeSingle()
    if (hm) {
      await db.from('hiring_managers').update({
        date_of_birth_encrypted: null,
        leadership_answers: null,
        leadership_tags: null,
      }).eq('profile_id', d.user_id)
    }

    // Purge business license files for companies owned by this user.
    const { data: companies } = await db.from('companies')
      .select('id, business_license_path').eq('owner_id', d.user_id)
    for (const co of companies ?? []) {
      if (co.business_license_path) {
        await db.storage.from('business-licenses').remove([co.business_license_path]).catch(() => {})
        await db.from('companies').update({ business_license_path: null }).eq('id', co.id)
      }
    }

    // Soft-ban the profile. Full row deletion would cascade to company/HM roles
    // which breaks audit trails; banning + PII-nulling is the PDPA-compliant middle path.
    await db.from('profiles').update({
      is_banned: true,
      phone: null,
      consents: {},
    }).eq('id', d.user_id)

    results.dsr_deletions_applied++
  }

  return json(results)
})
