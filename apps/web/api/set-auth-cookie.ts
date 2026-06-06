// Sets / clears the sb-jwt cookie with HttpOnly; Secure so JS cannot read it.
// Called from useSession.ts after auth state changes — fire-and-forget from
// the client. The middleware reads this cookie server-side to gate /admin.

export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = new Set([
  'https://diamondandjeweler.com',
  'https://www.diamondandjeweler.com',
])

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Origin check — defence-in-depth against CSRF. Same-origin browser requests
  // don't send an Origin header; cross-origin requests always do.
  const origin = req.headers.get('origin')
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let token: string | null = null
  try {
    const body = (await req.json()) as { token?: string | null }
    token = body.token ?? null
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const isSecure = req.url.startsWith('https://')
  const secureFlag = isSecure ? '; Secure' : ''

  const cookie = token
    ? `sb-jwt=${encodeURIComponent(token)}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=3600`
    : `sb-jwt=; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=0`

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  })
}
