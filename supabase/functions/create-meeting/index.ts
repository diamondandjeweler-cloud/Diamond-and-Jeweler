/**
 * create-meeting
 *
 * Generates a video-call link for a scheduled interview.
 * Provider: Daily.co (free tier prebuilt rooms). When DAILY_API_KEY is
 * absent, returns a Jitsi public-room URL as a no-config fallback.
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

interface Body { interview_id?: string }

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['hiring_manager', 'hr_admin', 'admin'] })
  if (auth instanceof Response) return auth

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* tolerate */ }
  if (!body.interview_id) return json({ error: 'Missing interview_id' }, 400)

  const db = adminClient()
  const { data: itv } = await db.from('interviews')
    .select('id, scheduled_at, meeting_url').eq('id', body.interview_id).maybeSingle()
  if (!itv) return json({ error: 'Interview not found' }, 404)
  if (itv.meeting_url) return json({ message: 'Already has meeting', meeting_url: itv.meeting_url })

  const dailyKey = Deno.env.get('DAILY_API_KEY')
  let meeting_url: string
  let provider: string
  let room_name = `bole-${body.interview_id.slice(0, 8)}-${Date.now().toString(36)}`

  if (dailyKey) {
    // Daily.co prebuilt — privacy=public + 24h expiry from scheduled time
    const expSec = Math.floor(new Date(itv.scheduled_at as string).getTime() / 1000) + 86400
    const r = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${dailyKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: room_name,
        privacy: 'public',
        properties: { exp: expSec, enable_chat: true, enable_screenshare: true },
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      return json({ error: 'Daily.co failed: ' + err }, 502)
    }
    const j = await r.json() as { url: string; name: string }
    meeting_url = j.url
    room_name = j.name
    provider = 'daily.co'
  } else {
    // Fallback: Jitsi public room (no auth, free, runs in the browser)
    meeting_url = `https://meet.jit.si/${room_name}`
    provider = 'jitsi'
  }

  await db.from('interviews').update({
    meeting_url, meeting_provider: provider, meeting_room_name: room_name,
  }).eq('id', body.interview_id)

  return json({ message: 'OK', meeting_url, provider })
})
