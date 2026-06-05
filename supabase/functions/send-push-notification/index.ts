import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_EMAIL       = Deno.env.get('VAPID_EMAIL')       ?? 'mailto:support@diamondandjeweler.com'

// web-push via npm (esm.sh handles the npm→ESM conversion)
// @deno-types="https://esm.sh/v135/web-push@3.6.7/src/index.d.ts"
import webpush from 'https://esm.sh/web-push@3.6.7'

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

interface PushPayload {
  subscription: {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  payload: {
    title: string
    body: string
    url: string
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  try {
    const { subscription, payload } = (await req.json()) as PushPayload

    await webpush.sendNotification(subscription, JSON.stringify(payload))

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
