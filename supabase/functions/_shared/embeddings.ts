// _shared/embeddings.ts
//
// Wraps OpenAI's text-embedding-3-small (1536-d) for the free_text atom
// vector store. Falls back to no-op when OPENAI_API_KEY is unset so the
// rest of the extractor still works in offline / staging contexts.

const EMBED_MODEL = 'text-embedding-3-small'
const EMBED_DIMS  = 1536

export interface EmbedResult {
  embedding: number[]
  model: string
}

/**
 * Embed a single short string. Returns null when no provider is configured
 * or when the request fails. Callers should treat null as "skip embedding"
 * rather than throw — atoms still work without vectors, just less precise.
 */
export async function embedOne(text: string): Promise<EmbedResult | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return null
  const trimmed = text.trim().slice(0, 2000)
  if (!trimmed) return null

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 15_000)
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: trimmed, dimensions: EMBED_DIMS }),
      signal: ac.signal,
    })
    clearTimeout(t)
    if (!res.ok) return null
    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    const vec = data?.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) return null
    return { embedding: vec, model: EMBED_MODEL }
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/**
 * Batch-embed several short strings. OpenAI supports up to 2048 inputs per
 * call so we send them all in one request. Returns aligned array (same
 * length as input; null entries for items that couldn't be embedded).
 */
export async function embedMany(texts: string[]): Promise<Array<number[] | null>> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey || texts.length === 0) return texts.map(() => null)
  const cleaned = texts.map((t) => (t ?? '').trim().slice(0, 2000))
  // Single-batch OpenAI call — embeddings API tolerates empty strings but we
  // map them back to null on the return side.
  const inputs = cleaned.map((t) => t || ' ')

  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 30_000)
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs, dimensions: EMBED_DIMS }),
      signal: ac.signal,
    })
    clearTimeout(t)
    if (!res.ok) return texts.map(() => null)
    const data = await res.json() as { data: Array<{ embedding: number[]; index: number }> }
    const out: Array<number[] | null> = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (Array.isArray(row.embedding) && row.embedding.length === EMBED_DIMS && cleaned[row.index]) {
        out[row.index] = row.embedding
      }
    }
    return out
  } catch {
    return texts.map(() => null)
  } finally {
    clearTimeout(t)
  }
}

/** Postgres pgvector literal: "[0.1,0.2,...]" */
export function toPgVectorLiteral(vec: number[]): string {
  return '[' + vec.map((n) => (Number.isFinite(n) ? n.toFixed(7) : '0')).join(',') + ']'
}

export const EMBEDDING_DIMS = EMBED_DIMS
export const EMBEDDING_MODEL = EMBED_MODEL
