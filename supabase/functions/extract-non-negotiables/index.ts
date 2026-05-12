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

// Avoid unused import warning when Atom not referenced in body (kept for export consistency).
export type { Atom }
