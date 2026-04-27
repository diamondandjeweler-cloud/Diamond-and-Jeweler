/**
 * notify
 *
 * Sends transactional email (Resend) + writes an in-app notification row.
 *
 * Authorization: admin / service-role only. End users are never allowed to
 * invoke this directly — we must not let the browser trigger arbitrary emails.
 *
 * Supported types:
 *   - match_ready           — talent has new matches
 *   - hm_invited            — hiring manager invited by HR
 *   - candidate_invited     — talent was invited by HM for interview
 *   - interview_scheduled   — HR scheduled an interview slot
 *   - match_expiring        — match expires in 24h (sent by cron; M4)
 *   - company_verified      — admin approved a company
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { Resend } from 'npm:resend@3.2.0'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

// Lazy: constructing `new Resend(undefined)` throws at module-load time,
// which would crash the function even for callers that don't send email.
// Create it on demand, only when we actually have a key.
let resendInstance: Resend | null = null
function getResend(): Resend | null {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return null
  if (!resendInstance) resendInstance = new Resend(key)
  return resendInstance
}
const FROM = Deno.env.get('RESEND_FROM') ?? 'noreply@resend.dev'
const SITE = Deno.env.get('SITE_URL') ?? 'https://diamondandjeweler.com'

type NotifyType =
  | 'match_ready' | 'hm_invited' | 'candidate_invited'
  | 'interview_scheduled' | 'match_expiring' | 'match_no_action_48h'
  | 'company_verified' | 'dsr_export_ready'

interface Payload {
  user_id: string
  type: NotifyType
  data?: Record<string, unknown>
}

serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await authenticate(req, { requiredRoles: ['admin'] })
  if (auth instanceof Response) return auth

  const payload = (await req.json().catch(() => ({}))) as Partial<Payload>
  if (!payload.user_id || !payload.type) {
    return json({ error: 'Missing user_id or type' }, 400)
  }

  const db = adminClient()
  const { data: target } = await db.from('profiles')
    .select('email, full_name, whatsapp_number, whatsapp_opt_in, locale')
    .eq('id', payload.user_id).maybeSingle()
  if (!target) return json({ error: 'Target user not found' }, 404)

  const { subject, body, html } = compose(payload.type, target.full_name, payload.data ?? {}, target.locale)

  await db.from('notifications').insert({
    user_id: payload.user_id,
    type: payload.type,
    channel: 'in_app',
    subject, body, data: payload.data ?? {},
  })

  let emailStatus: 'sent' | 'skipped' | 'error' = 'skipped'
  const resend = getResend()
  if (target.email && resend) {
    try {
      await resend.emails.send({ from: FROM, to: target.email, subject, text: body, html })
      emailStatus = 'sent'
      await db.from('notifications').insert({
        user_id: payload.user_id,
        type: payload.type,
        channel: 'email',
        subject, body, data: payload.data ?? {},
      })
    } catch (e) {
      console.error('Resend error', e)
      emailStatus = 'error'
    }
  }

  // WhatsApp via WATI (or Twilio) — opt-in, server-only key, no PII in logs.
  let whatsappStatus: 'sent' | 'skipped' | 'error' = 'skipped'
  const watiKey = Deno.env.get('WATI_API_KEY')
  const watiUrl = Deno.env.get('WATI_API_URL') // e.g. https://live-server.wati.io/api/v1
  if (target.whatsapp_opt_in && target.whatsapp_number && watiKey && watiUrl) {
    try {
      const phone = target.whatsapp_number.replace(/[^\d]/g, '')
      const r = await fetch(`${watiUrl}/sendSessionMessage/${phone}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${watiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageText: body }),
      })
      whatsappStatus = r.ok ? 'sent' : 'error'
      if (r.ok) {
        await db.from('notifications').insert({
          user_id: payload.user_id,
          type: payload.type,
          channel: 'whatsapp',
          subject, body, data: payload.data ?? {},
        })
      }
    } catch (e) {
      console.error('WATI error', e)
      whatsappStatus = 'error'
    }
  }

  return json({ ok: true, email: emailStatus, whatsapp: whatsappStatus })
})

type Locale = 'en' | 'ms' | 'zh'

function pickLocale(raw: string | null | undefined): Locale {
  return raw === 'ms' || raw === 'zh' ? raw : 'en'
}

const DATE_LOCALE: Record<Locale, string> = { en: 'en-MY', ms: 'ms-MY', zh: 'zh-Hans-MY' }
const TZ_LABEL: Record<Locale, string> = { en: 'MYT', ms: 'Waktu Malaysia', zh: '马来西亚时间' }

function compose(
  type: NotifyType,
  fullName: string,
  data: Record<string, unknown>,
  rawLocale: string | null | undefined,
): { subject: string; body: string; html: string } {
  const first = fullName.split(' ')[0]
  const safeFirst = escapeHtml(first)
  const locale = pickLocale(rawLocale)

  switch (type) {
    case 'match_ready': {
      const T = {
        en: { subject: 'You have new matches on BoLe', greet: 'Hi', line: "We've curated new opportunities for you. Log in to review:", linkText: 'Review your matches' },
        ms: { subject: 'Anda ada padanan baharu di BoLe', greet: 'Hai', line: 'Kami telah pilihkan peluang baharu untuk anda. Log masuk untuk semak:', linkText: 'Semak padanan anda' },
        zh: { subject: '您有新的 BoLe 匹配', greet: '嗨', line: '我们为您精选了新机会。请登入查看：', linkText: '查看您的匹配' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.line}\n${SITE}/home\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.line.replace(/[:：]\s*$/, '')} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'hm_invited': {
      const T = {
        en: { subject: 'You have been invited as a Hiring Manager on BoLe', greet: 'Hi', body: 'Your HR team has invited you to BoLe. Check your inbox for the magic link and complete your leadership profile.', html: 'Your HR team has invited you to BoLe. The magic-link email from Supabase is on its way — click it to finish onboarding.' },
        ms: { subject: 'Anda dijemput sebagai Pengurus Pengambilan di BoLe', greet: 'Hai', body: 'Pasukan HR anda telah menjemput anda ke BoLe. Sila semak peti masuk e-mel anda untuk pautan log masuk dan lengkapkan profil anda.', html: 'Pasukan HR anda telah menjemput anda ke BoLe. E-mel pautan log masuk dari Supabase dalam perjalanan — klik untuk selesaikan pendaftaran.' },
        zh: { subject: '您已受邀成为 BoLe 招聘经理', greet: '嗨', body: 'HR 团队邀请您加入 BoLe。请查收邮箱中的登入链接，并完成您的负责人资料。', html: 'HR 团队邀请您加入 BoLe。Supabase 登入链接邮件即将送达 — 点击即可完成注册。' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.html}</p>`,
      }
    }
    case 'candidate_invited': {
      const T = {
        en: { subject: 'A hiring manager wants to interview you', greet: 'Hi', body: 'A hiring manager is interested in interviewing you. Your HR contact will reach out with a time.', linkText: 'See details', detailsLabel: 'Details' },
        ms: { subject: 'Seorang pengurus pengambilan ingin temu duga anda', greet: 'Hai', body: 'Seorang pengurus pengambilan berminat untuk temu duga anda. Wakil HR akan menghubungi anda dengan masa yang ditetapkan.', linkText: 'Lihat butiran', detailsLabel: 'Butiran' },
        zh: { subject: '有招聘经理想面试您', greet: '嗨', body: '有一位招聘经理对您感兴趣。HR 将与您联系并安排时间。', linkText: '查看详情', detailsLabel: '详情' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n${T.detailsLabel}: ${SITE}/home\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.body} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'interview_scheduled': {
      const raw = typeof data.scheduled_at === 'string' ? data.scheduled_at : null
      const at = raw
        ? new Date(raw).toLocaleString(DATE_LOCALE[locale], { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'long', timeStyle: 'short' })
        : (locale === 'ms' ? 'Akan ditentukan' : locale === 'zh' ? '待定' : 'TBC')
      const safeAt = escapeHtml(at)
      const tz = TZ_LABEL[locale]
      const T = {
        en: { subject: 'Your interview has been scheduled', greet: 'Hi', body: (a: string) => `Your interview is scheduled for ${a} (${tz}).`, html: (a: string) => `Your interview is scheduled for <strong>${a}</strong> (${tz}).`, detailsLabel: 'Details' },
        ms: { subject: 'Temu duga anda telah dijadualkan', greet: 'Hai', body: (a: string) => `Temu duga anda dijadualkan pada ${a} (${tz}).`, html: (a: string) => `Temu duga anda dijadualkan pada <strong>${a}</strong> (${tz}).`, detailsLabel: 'Butiran' },
        zh: { subject: '您的面试已安排', greet: '嗨', body: (a: string) => `您的面试时间为 ${a} (${tz})。`, html: (a: string) => `您的面试时间为 <strong>${a}</strong> (${tz})。`, detailsLabel: '详情' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body(at)}\n\n${T.detailsLabel}: ${SITE}/home\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.html(safeAt)}</p>`,
      }
    }
    case 'match_expiring': {
      const T = {
        en: { subject: 'A BoLe match is about to expire', greet: 'Hi', body: 'One of your pending matches expires in 24 hours. Log in to act on it:', linkText: 'Act now' },
        ms: { subject: 'Padanan BoLe anda hampir tamat tempoh', greet: 'Hai', body: 'Salah satu padanan anda akan tamat tempoh dalam 24 jam. Log masuk untuk bertindak:', linkText: 'Bertindak sekarang' },
        zh: { subject: '您的 BoLe 匹配即将到期', greet: '嗨', body: '您有一份匹配将于 24 小时内到期。请登入处理：', linkText: '立即处理' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n${SITE}/home\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.body.replace(/[:：]\s*$/, '')} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'match_no_action_48h': {
      const isHM = typeof data.audience === 'string' && data.audience === 'hiring_manager'
      const T = {
        en: {
          subject: 'Still thinking it over? Your BoLe match is waiting',
          greet: 'Hi',
          prompt: isHM
            ? 'A candidate has accepted your offer and is waiting on your invite.'
            : 'You opened an offer 48 hours ago. Accept or decline so matching can keep moving for you.',
          linkText: 'Take a look',
        },
        ms: {
          subject: 'Masih menimbang? Padanan BoLe anda menanti',
          greet: 'Hai',
          prompt: isHM
            ? 'Seorang calon telah menerima tawaran anda dan menanti jemputan daripada anda.'
            : 'Anda telah membuka tawaran 48 jam lalu. Terima atau tolak supaya proses padanan boleh diteruskan.',
          linkText: 'Lihat sekarang',
        },
        zh: {
          subject: '还在考虑吗? 您的 BoLe 匹配仍在等待',
          greet: '嗨',
          prompt: isHM
            ? '有候选人已接受您的 offer，正在等候您发出邀请。'
            : '您 48 小时前打开了一份 offer。请接受或拒绝，以便系统继续为您匹配。',
          linkText: '前往查看',
        },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.prompt}\n\n${SITE}/home\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${escapeHtml(T.prompt)}</p><p><a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'company_verified': {
      const T = {
        en: { subject: 'Your company is verified', greet: 'Hi', body: 'Your company has been verified. You can now invite hiring managers and post roles.', linkLabel: 'Go to your dashboard' },
        ms: { subject: 'Syarikat anda telah disahkan', greet: 'Hai', body: 'Syarikat anda telah disahkan. Anda kini boleh menjemput pengurus pengambilan dan iklankan jawatan.', linkLabel: 'Pergi ke papan pemuka' },
        zh: { subject: '您的公司已通过审核', greet: '嗨', body: '您的公司已通过审核。您现在可以邀请招聘经理并发布职位。', linkLabel: '前往后台' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n${T.linkLabel}: ${SITE}/hr\n\n– BoLe`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.body} <a href="${SITE}/hr">${T.linkLabel}</a>.</p>`,
      }
    }
    case 'dsr_export_ready': {
      const url = typeof data.download_url === 'string' ? data.download_url : SITE
      const ttl = typeof data.ttl_hours === 'number' ? data.ttl_hours : 24
      const reqType = typeof data.request_type === 'string' ? data.request_type : 'data'
      const safeUrl = escapeHtml(url)
      const T = {
        en: {
          subject: `Your ${reqType} data export is ready`,
          greet: 'Hi',
          line1: `Your BoLe data export is ready. Download it within ${ttl} hours:`,
          line1Html: `Your BoLe data export is ready. <a href="${safeUrl}">Download</a> within <strong>${ttl} hours</strong>.`,
          warn: 'If you did not request this, contact privacy@diamondandjeweler.com immediately.',
        },
        ms: {
          subject: `Eksport data ${reqType} anda telah sedia`,
          greet: 'Hai',
          line1: `Eksport data BoLe anda telah sedia. Sila muat turun dalam ${ttl} jam:`,
          line1Html: `Eksport data BoLe anda telah sedia. <a href="${safeUrl}">Muat turun</a> dalam <strong>${ttl} jam</strong>.`,
          warn: 'Jika anda tidak meminta ini, sila hubungi privacy@diamondandjeweler.com dengan segera.',
        },
        zh: {
          subject: `您的 ${reqType} 数据导出已就绪`,
          greet: '嗨',
          line1: `您的 BoLe 数据导出已就绪。请在 ${ttl} 小时内下载：`,
          line1Html: `您的 BoLe 数据导出已就绪。请在 <strong>${ttl} 小时</strong> 内 <a href="${safeUrl}">下载</a>。`,
          warn: '若非您本人申请，请立即联系 privacy@diamondandjeweler.com。',
        },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.line1}\n\n${url}\n\n${T.warn}\n\n– BoLe`,
        html:
          `<p>${T.greet} ${safeFirst},</p>` +
          `<p>${T.line1Html}</p>` +
          `<p style="color:#666;font-size:12px;">${T.warn}</p>`,
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
  )[c] ?? c)
}
