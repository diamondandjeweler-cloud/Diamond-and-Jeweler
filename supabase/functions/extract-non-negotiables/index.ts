/**
 * extract-non-negotiables
 *
 * Parses free-text non-negotiables ("must have degree with 2nd class upper",
 * "won't take less than RM 8k", "MNC only") from either a hiring manager
 * (per-role) or a talent (per-profile) into structured atoms that the
 * matching engine uses as hard/soft filters.
 *
 * Auth: hiring_manager, talent, or admin.
 * Input:  { side: 'hm' | 'talent', text: string, role_id?: uuid, talent_id?: uuid }
 *           - role_id required when side='hm' (atoms saved on the role)
 *           - talent_id optional when side='talent' (defaults to caller's talent profile)
 *           - If neither id is provided, atoms are returned without persisting
 *             (lets the form do a "preview" before save).
 * Output: { atoms: Atom[], persisted: boolean }
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'
import {
  buildExtractionPrompt, validateAtoms, deriveLegacyPatches, type Atom,
} from '../_shared/non-negotiables.ts'
import { embedMany, toPgVectorLiteral } from '../_shared/embeddings.ts'

interface Body {
  side?: 'hm' | 'talent'
  text?: string
  role_id?: string
  talent_id?: string
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['talent', 'hiring_manager', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = await req.json() } catch { /* empty */ }

  const side = body.side === 'hm' ? 'hm' : 'talent'
  const text = (body.text ?? '').trim()

  if (!text) {
    return new Response(JSON.stringify({ atoms: [], persisted: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Reject pathologically long input early.
  if (text.length > 4000) {
    return json({ error: 'Text too long; keep under 4000 characters.' }, 400)
  }

  const raw = await callExtractionAI(buildExtractionPrompt(text, side))
  if (raw instanceof Response) return raw

  const atoms = validateAtoms(raw)

  // Persist when an id is provided.
  let persisted = false
  const db = adminClient()
  if (side === 'hm' && body.role_id) {
    // Verify caller owns the role (or is admin).
    if (auth.role !== 'admin') {
      const { data: ok } = await db.from('roles')
        .select('id, hiring_manager_id, hiring_managers!inner(profile_id)')
        .eq('id', body.role_id)
        .eq('hiring_managers.profile_id', auth.userId)
        .maybeSingle()
      if (!ok) return json({ error: 'Forbidden' }, 403)
    }
    const { error } = await db.from('roles').update({
      non_negotiables_text: text,
      non_negotiables_atoms: atoms,
    }).eq('id', body.role_id)
    if (error) return json({ error: error.message }, 500)

    // Embed free_text atoms and upsert into nn_atom_embeddings.
    await persistEmbeddings(db, 'role', body.role_id, atoms)

    // Side-effect: also push min_qualification atom into hiring_managers.must_haves
    // for backwards compat with the existing display logic in match-core.
    const patches = deriveLegacyPatches(atoms, 'hm')
    if (patches.hmMustHaves) {
      const { data: roleRow } = await db.from('roles')
        .select('hiring_manager_id').eq('id', body.role_id).single()
      if (roleRow?.hiring_manager_id) {
        const { data: hmRow } = await db.from('hiring_managers')
          .select('must_haves').eq('id', roleRow.hiring_manager_id).single()
        const merged = { ...(hmRow?.must_haves ?? {}), ...patches.hmMustHaves }
        await db.from('hiring_managers').update({ must_haves: merged })
          .eq('id', roleRow.hiring_manager_id)
      }
    }
    persisted = true
  } else if (side === 'talent') {
    let talentId = body.talent_id ?? null
    if (!talentId) {
      const { data } = await db.from('talents').select('id')
        .eq('profile_id', auth.userId).maybeSingle()
      talentId = data?.id ?? null
    } else if (auth.role !== 'admin') {
      // Verify caller owns the talent row.
      const { data } = await db.from('talents').select('profile_id').eq('id', talentId).single()
      if (data?.profile_id !== auth.userId) return json({ error: 'Forbidden' }, 403)
    }
    if (talentId) {
      const { error } = await db.from('talents').update({
        priority_concerns_text: text,
        priority_concerns_atoms: atoms,
      }).eq('id', talentId)
      if (error) return json({ error: error.message }, 500)

      // Embed free_text atoms and upsert into nn_atom_embeddings.
      await persistEmbeddings(db, 'talent', talentId, atoms)

      // Side-effect: merge derived deal_breakers (salary_floor → min_salary_hard, etc.)
      const patches = deriveLegacyPatches(atoms, 'talent')
      if (patches.talentDealBreakers) {
        const { data: cur } = await db.from('talents').select('deal_breakers').eq('id', talentId).single()
        const merged = { ...(cur?.deal_breakers ?? {}), ...patches.talentDealBreakers }
        await db.from('talents').update({ deal_breakers: merged }).eq('id', talentId)
      }
      persisted = true
    }
  }

  return new Response(JSON.stringify({ atoms, persisted }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})

async function callExtractionAI(prompt: string): Promise<unknown[] | Response> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const groqKey = Deno.env.get('GROQ_API_KEY')

  if (anthropicKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 20_000)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: ac.signal,
      })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json() as { content: { type: string; text: string }[] }
        return parseJSONArray(data.content?.[0]?.text ?? '')
      }
    } catch { /* fall through */ } finally { clearTimeout(t) }
  }

  if (groqKey) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), 15_000)
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: ac.signal,
      })
      clearTimeout(t)
      if (res.ok) {
        const data = await res.json() as { choices: { message: { content: string } }[] }
        return parseJSONArray(data.choices?.[0]?.message?.content ?? '')
      }
    } catch { /* fall through */ } finally { clearTimeout(t) }
  }

  return new Response(JSON.stringify({ error: 'No AI provider configured' }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseJSONArray(raw: string): unknown[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    // Tolerate "{ atoms: [...] }" shape if the model wraps.
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { atoms?: unknown }).atoms)) {
      return (parsed as { atoms: unknown[] }).atoms
    }
    return []
  } catch { return [] }
}

/**
 * Embed every free_text atom in `atoms` and replace the row's entries in
 * nn_atom_embeddings. Best-effort: failures don't break the parent write.
 *
 * Schema: (owner_type, owner_id) is the row's natural key. atom_index is the
 * original position of the free_text atom in the saved atoms array — used by
 * the matcher to correlate "concerns_satisfied" hits back to specific atoms.
 *
 * Strategy: delete old rows for this owner, generate embeddings for new
 * free_text atoms in one batch API call, insert. Idempotent.
 */
async function persistEmbeddings(
  db: ReturnType<typeof adminClient>,
  ownerType: 'role' | 'talent',
  ownerId: string,
  atoms: Atom[],
): Promise<void> {
  try {
    // Clear any previous embeddings for this owner.
    await db.from('nn_atom_embeddings')
      .delete()
      .eq('owner_type', ownerType)
      .eq('owner_id', ownerId)

    const free: Array<{ atomIndex: number; text: string }> = []
    atoms.forEach((a, i) => {
      if (a.type === 'free_text' && typeof a.value === 'string' && a.value.trim()) {
        free.push({ atomIndex: i, text: a.value.trim() })
      }
    })
    console.log(`[persistEmbeddings] owner=${ownerType}:${ownerId} free_atoms=${free.length}`)
    if (free.length === 0) return

    const result = await embedMany(free.map((f) => f.text))
    const okVectors = result.vectors.filter((v) => v != null).length
    console.log(`[persistEmbeddings] provider=${result.provider} dim=${result.dim} ok=${okVectors}/${free.length}`)

    const rows: Array<Record<string, unknown>> = []
    free.forEach((f, i) => {
      const v = result.vectors[i]
      if (v) {
        rows.push({
          owner_type: ownerType,
          owner_id:   ownerId,
          atom_index: f.atomIndex,
          text:       f.text,
          embedding:  toPgVectorLiteral(v),
          provider:   result.provider,
          dim:        result.dim,
        })
      }
    })
    if (rows.length === 0) { console.log('[persistEmbeddings] no rows to insert'); return }

    const { error } = await db.from('nn_atom_embeddings').insert(rows)
    if (error) console.error('[persistEmbeddings] insert failed:', error.message)
    else console.log(`[persistEmbeddings] inserted ${rows.length} rows (${result.provider})`)
  } catch (e) {
    console.error('[persistEmbeddings] threw:', e instanceof Error ? e.message : String(e))
  }
}

// Avoid unused import warning when Atom not referenced in body (kept for export consistency).
export type { Atom }
