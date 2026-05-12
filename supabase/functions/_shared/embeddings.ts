// _shared/embeddings.ts
//
// 10-provider fallback chain for free embedding generation. Each provider is
// tried in turn; first one that returns valid vectors wins, and the result
// carries a `provider` tag so the matcher only compares vectors made by the
// same provider (cross-provider cosine similarity is meaningless).
//
// Provider order — most generous free tier first:
//   1.  Gemini text-embedding-004           (key: GEMINI_API_KEY)         — 768d, 1500 RPM
//   2.  Voyage AI voyage-3.5-lite           (key: VOYAGE_API_KEY)         — 1024d, 50M tok/mo
//   3.  Cohere embed-multilingual-v3        (key: COHERE_API_KEY)         — 1024d, free trial
//   4.  Mistral mistral-embed               (key: MISTRAL_API_KEY)        — 1024d, free tier
//   5.  Together AI m2-bert-80M             (key: TOGETHER_API_KEY)       — 768d, free credit
//   6.  Cloudflare Workers AI BGE-base      (keys: CLOUDFLARE_ACCOUNT_ID
//                                            + CLOUDFLARE_API_TOKEN)      — 768d, 10k neurons/day
//   7.  Jina AI jina-embeddings-v3          (key: JINA_API_KEY)           — 1024d, free tier
//   8.  Nomic AI nomic-embed-text-v1.5      (key: NOMIC_API_KEY)          — 768d, free tier
//   9.  HuggingFace BAAI/bge-base-en-v1.5   (key: HF_API_TOKEN)           — 768d, free rate-limited
//   10. OpenAI text-embedding-3-small       (key: OPENAI_API_KEY)         — 1536d, paid
//
// To unlock a provider, set its env var via:
//   supabase secrets set GEMINI_API_KEY=... --project-ref sfnrpbsdscikpmbhrzub
// Providers without keys are silently skipped. At least one must work for
// free_text atom matching to be active.

export interface EmbedResult {
  vectors: Array<number[] | null>
  provider: string
  dim: number
}

export interface SingleEmbedResult {
  embedding: number[]
  provider: string
  dim: number
}

const TIMEOUT_MS = 25_000

// ─── Provider impls ────────────────────────────────────────────────────────

async function tryGemini(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('GEMINI_API_KEY'); if (!key) return null
  // gemini-embedding-001 is GA on the Generative Language API (released
  // 2025-08, GA 2025-10). Uses the single-content :embedContent endpoint
  // because batchEmbedContents only ships on Vertex AI. Output dim trimmed
  // to 768 via outputDimensionality — keeps vectors compact + comparable
  // with the other 768-d providers (Together, Cloudflare, Nomic, HF).
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const results = await Promise.all(texts.map(async (text) => {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/gemini-embedding-001',
              content: { parts: [{ text: text.slice(0, 2000) || ' ' }] },
              taskType: 'RETRIEVAL_DOCUMENT',
              outputDimensionality: 768,
            }),
            signal: ac.signal,
          },
        )
        if (!res.ok) {
          if (text === texts[0]) {
            console.error(`[embed:gemini] ${res.status}: ${(await res.text()).slice(0, 200)}`)
          }
          return null
        }
        const data = await res.json() as { embedding?: { values: number[] } }
        return Array.isArray(data.embedding?.values) ? data.embedding!.values : null
      } catch (e) {
        if (text === texts[0]) console.error('[embed:gemini] item threw:', e instanceof Error ? e.message : String(e))
        return null
      }
    }))
    return results.some((v) => v != null && v.length > 0)
      ? { vectors: results, provider: 'gemini', dim: 768 }
      : null
  } catch (e) {
    console.error('[embed:gemini] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryVoyage(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('VOYAGE_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        input: texts.map((s) => s.slice(0, 2000) || ' '),
        model: 'voyage-3.5-lite',
        input_type: 'document',
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:voyage] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { data?: Array<{ embedding: number[]; index: number }> }
    const out: Array<number[] | null> = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (Array.isArray(row.embedding)) out[row.index] = row.embedding
    }
    return out.some((v) => v != null) ? { vectors: out, provider: 'voyage', dim: 1024 } : null
  } catch (e) {
    console.error('[embed:voyage] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryCohere(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('COHERE_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.cohere.com/v2/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'embed-multilingual-v3.0',
        texts: texts.map((s) => s.slice(0, 2000) || ' '),
        input_type: 'search_document',
        embedding_types: ['float'],
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:cohere] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { embeddings?: { float?: number[][] } }
    const arr = data.embeddings?.float ?? []
    const vectors = texts.map((_, i) => Array.isArray(arr[i]) ? arr[i] : null)
    return vectors.some((v) => v != null) ? { vectors, provider: 'cohere', dim: 1024 } : null
  } catch (e) {
    console.error('[embed:cohere] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryMistral(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('MISTRAL_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: texts.map((s) => s.slice(0, 2000) || ' '),
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:mistral] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { data?: Array<{ embedding: number[]; index: number }> }
    const out: Array<number[] | null> = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (Array.isArray(row.embedding)) out[row.index] = row.embedding
    }
    return out.some((v) => v != null) ? { vectors: out, provider: 'mistral', dim: 1024 } : null
  } catch (e) {
    console.error('[embed:mistral] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryTogether(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('TOGETHER_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.together.xyz/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'togethercomputer/m2-bert-80M-32k-retrieval',
        input: texts.map((s) => s.slice(0, 2000) || ' '),
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:together] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { data?: Array<{ embedding: number[]; index: number }> }
    const out: Array<number[] | null> = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (Array.isArray(row.embedding)) out[row.index] = row.embedding
    }
    return out.some((v) => v != null) ? { vectors: out, provider: 'together', dim: 768 } : null
  } catch (e) {
    console.error('[embed:together] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryCloudflare(texts: string[]): Promise<EmbedResult | null> {
  const acct = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const tok  = Deno.env.get('CLOUDFLARE_API_TOKEN')
  if (!acct || !tok) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/baai/bge-base-en-v1.5`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ text: texts.map((s) => s.slice(0, 2000) || ' ') }),
        signal: ac.signal,
      },
    )
    if (!res.ok) {
      console.error(`[embed:cloudflare] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { result?: { data?: number[][] } }
    const arr = data.result?.data ?? []
    const vectors = texts.map((_, i) => Array.isArray(arr[i]) ? arr[i] : null)
    return vectors.some((v) => v != null) ? { vectors, provider: 'cloudflare', dim: 768 } : null
  } catch (e) {
    console.error('[embed:cloudflare] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryJina(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('JINA_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'jina-embeddings-v3',
        input: texts.map((s) => s.slice(0, 2000) || ' '),
        task: 'retrieval.passage',
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:jina] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { data?: Array<{ embedding: number[]; index: number }> }
    const out: Array<number[] | null> = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (Array.isArray(row.embedding)) out[row.index] = row.embedding
    }
    return out.some((v) => v != null) ? { vectors: out, provider: 'jina', dim: 1024 } : null
  } catch (e) {
    console.error('[embed:jina] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryNomic(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('NOMIC_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api-atlas.nomic.ai/v1/embedding/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        texts: texts.map((s) => s.slice(0, 2000) || ' '),
        model: 'nomic-embed-text-v1.5',
        task_type: 'search_document',
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:nomic] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { embeddings?: number[][] }
    const arr = data.embeddings ?? []
    const vectors = texts.map((_, i) => Array.isArray(arr[i]) ? arr[i] : null)
    return vectors.some((v) => v != null) ? { vectors, provider: 'nomic', dim: 768 } : null
  } catch (e) {
    console.error('[embed:nomic] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryHuggingFace(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('HF_API_TOKEN'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(
      'https://api-inference.huggingface.co/models/BAAI/bge-base-en-v1.5',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          inputs: texts.map((s) => s.slice(0, 2000) || ' '),
          options: { wait_for_model: true },
        }),
        signal: ac.signal,
      },
    )
    if (!res.ok) {
      console.error(`[embed:huggingface] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    // HF returns either number[][] (batch) or number[] (single)
    const data = await res.json() as number[][] | number[]
    const arr: number[][] = Array.isArray(data) && Array.isArray((data as number[][])[0])
      ? (data as number[][])
      : [data as number[]]
    const vectors = texts.map((_, i) => Array.isArray(arr[i]) ? arr[i] : null)
    return vectors.some((v) => v != null) ? { vectors, provider: 'huggingface', dim: 768 } : null
  } catch (e) {
    console.error('[embed:huggingface] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

async function tryOpenAI(texts: string[]): Promise<EmbedResult | null> {
  const key = Deno.env.get('OPENAI_API_KEY'); if (!key) return null
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts.map((s) => s.slice(0, 2000) || ' '),
        dimensions: 1536,
      }),
      signal: ac.signal,
    })
    if (!res.ok) {
      console.error(`[embed:openai] ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const data = await res.json() as { data?: Array<{ embedding: number[]; index: number }> }
    const out: Array<number[] | null> = texts.map(() => null)
    for (const row of data.data ?? []) {
      if (Array.isArray(row.embedding)) out[row.index] = row.embedding
    }
    return out.some((v) => v != null) ? { vectors: out, provider: 'openai', dim: 1536 } : null
  } catch (e) {
    console.error('[embed:openai] threw:', e instanceof Error ? e.message : String(e))
    return null
  } finally { clearTimeout(t) }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Try each configured provider in order; return first that produces vectors.
 * Returns { provider: 'none', dim: 0, vectors: all-null } if nothing works.
 */
export async function embedMany(texts: string[]): Promise<EmbedResult> {
  if (texts.length === 0) return { vectors: [], provider: 'none', dim: 0 }

  const chain = [
    tryGemini, tryVoyage, tryCohere, tryMistral, tryTogether,
    tryCloudflare, tryJina, tryNomic, tryHuggingFace, tryOpenAI,
  ]

  for (const fn of chain) {
    const result = await fn(texts)
    if (result && result.vectors.some((v) => v != null)) {
      console.log(`[embedMany] provider=${result.provider} dim=${result.dim} ok=${result.vectors.filter(v => v != null).length}/${texts.length}`)
      return result
    }
  }
  console.error('[embedMany] no provider returned vectors — set at least one *_API_KEY')
  return { vectors: texts.map(() => null), provider: 'none', dim: 0 }
}

/** Convenience wrapper for single-text embedding. */
export async function embedOne(text: string): Promise<SingleEmbedResult | null> {
  const res = await embedMany([text])
  const vec = res.vectors[0]
  if (!vec) return null
  return { embedding: vec, provider: res.provider, dim: res.dim }
}

/** Postgres pgvector literal: "[0.1,0.2,...]" */
export function toPgVectorLiteral(vec: number[]): string {
  return '[' + vec.map((n) => (Number.isFinite(n) ? n.toFixed(7) : '0')).join(',') + ']'
}
