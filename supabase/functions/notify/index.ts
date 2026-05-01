/**
 * notify
 *
 * Sends transactional email (Resend) + writes an in-app notification row.
 *
 * Authorization: admin / service-role only. End users are never allowed to
 * invoke this directly — we must not let the browser trigger arbitrary emails.
 *
 * Supported types:
 *   - match_ready                  — talent has new matches
 *   - hm_invited                   — hiring manager invited by HR
 *   - candidate_invited            — talent was invited by HM for interview
 *   - interview_scheduled          — HR scheduled an interview slot
 *   - match_expiring               — match expires in 24h (sent by cron; M4)
 *   - match_no_action_48h          — nudge for idle match
 *   - company_verified             — admin approved a company
 *   - dsr_export_ready             — GDPR data export ready
 *   - interview_round_scheduled    — new Jitsi round booked (multi-round)
 *   - interview_cancelled          — match cancelled by either party
 *   - offer_made_notify            — HM made an offer, notify talent
 *   - offer_accepted               — talent accepted, notify HM
 *   - offer_declined               — talent declined, notify HM
 */
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { Resend } from 'npm:resend@3.2.0'
import { handleOptions } from '../_shared/cors.ts'
import { authenticate, json } from '../_shared/auth.ts'
import { adminClient } from '../_shared/supabase.ts'

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
  | 'interview_round_scheduled' | 'interview_cancelled'
  | 'offer_made_notify' | 'offer_accepted' | 'offer_declined'

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

  // Marketing-category notifications require consents.market = true.
  const MARKETING_TYPES: NotifyType[] = ['match_expiring', 'match_no_action_48h']
  const isMarketing = (MARKETING_TYPES as string[]).includes(payload.type)

  const db = adminClient()
  const { data: target } = await db.from('profiles')
    .select('email, full_name, whatsapp_number, whatsapp_opt_in, locale, consents, email_bounced')
    .eq('id', payload.user_id).maybeSingle()
  if (!target) return json({ error: 'Target user not found' }, 404)

  if (isMarketing) {
    const consents = (target.consents ?? {}) as Record<string, unknown>
    if (!consents.market) return json({ ok: true, email: 'skipped_no_marketing_consent', whatsapp: 'skipped' })
  }

  if (target.email_bounced) {
    return json({ ok: true, email: 'skipped_bounced', whatsapp: 'skipped' })
  }

  const { subject, body, html } = compose(payload.type, target.full_name, payload.data ?? {}, target.locale)

  // Append unsubscribe footer to HTML emails.
  const unsubUrl = `${SITE}/data-requests?type=optout&uid=${encodeURIComponent(payload.user_id)}`
  const htmlWithUnsub = `${html}
<p style="margin-top:24px;font-size:11px;color:#9ca3af;">
  You received this because you have an account on DNJ.
  <a href="${unsubUrl}" style="color:#6b7280;">Unsubscribe from non-essential emails</a>.
</p>`

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
      await resend.emails.send({ from: FROM, to: target.email, subject, text: body, html: htmlWithUnsub })
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

  let whatsappStatus: 'sent' | 'skipped' | 'error' = 'skipped'
  const watiKey = Deno.env.get('WATI_API_KEY')
  const watiUrl = Deno.env.get('WATI_API_URL')
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

function fmtDate(raw: string | null | undefined, locale: Locale): string {
  if (!raw) return locale === 'ms' ? 'Akan ditentukan' : locale === 'zh' ? '待定' : 'TBC'
  return new Date(raw).toLocaleString(DATE_LOCALE[locale], {
    timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'long', timeStyle: 'short',
  })
}

function compose(
  type: NotifyType,
  fullName: string,
  data: Record<string, unknown>,
  rawLocale: string | null | undefined,
): { subject: string; body: string; html: string } {
  const first = fullName.split(' ')[0]
  const safeFirst = escapeHtml(first)
  const locale = pickLocale(rawLocale)
  const tz = TZ_LABEL[locale]

  switch (type) {
    case 'match_ready': {
      const T = {
        en: { subject: 'You have new matches on DNJ', greet: 'Hi', line: "We've curated new opportunities for you. Log in to review:", linkText: 'Review your matches' },
        ms: { subject: 'Anda ada padanan baharu di DNJ', greet: 'Hai', line: 'Kami telah pilihkan peluang baharu untuk anda. Log masuk untuk semak:', linkText: 'Semak padanan anda' },
        zh: { subject: '您有新的 DNJ 匹配', greet: '嗨', line: '我们为您精选了新机会。请登入查看：', linkText: '查看您的匹配' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.line}\n${SITE}/home\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.line.replace(/[:：]\s*$/, '')} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'hm_invited': {
      const T = {
        en: { subject: 'You have been invited as a Hiring Manager on DNJ', greet: 'Hi', body: 'Your HR team has invited you to DNJ. Check your inbox for the magic link and complete your leadership profile.', html: 'Your HR team has invited you to DNJ. The magic-link email from Supabase is on its way — click it to finish onboarding.' },
        ms: { subject: 'Anda dijemput sebagai Pengurus Pengambilan di DNJ', greet: 'Hai', body: 'Pasukan HR anda telah menjemput anda ke DNJ. Sila semak peti masuk e-mel anda untuk pautan log masuk dan lengkapkan profil anda.', html: 'Pasukan HR anda telah menjemput anda ke DNJ. E-mel pautan log masuk dari Supabase dalam perjalanan — klik untuk selesaikan pendaftaran.' },
        zh: { subject: '您已受邀成为 DNJ 招聘经理', greet: '嗨', body: 'HR 团队邀请您加入 DNJ。请查收邮箱中的登入链接，并完成您的负责人资料。', html: 'HR 团队邀请您加入 DNJ。Supabase 登入链接邮件即将送达 — 点击即可完成注册。' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n– DNJ`,
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
        body: `${T.greet} ${first},\n\n${T.body}\n\n${T.detailsLabel}: ${SITE}/home\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.body} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'interview_scheduled': {
      const at = fmtDate(data.scheduled_at as string | undefined, locale)
      const safeAt = escapeHtml(at)
      const T = {
        en: { subject: 'Your interview has been scheduled', greet: 'Hi', body: (a: string) => `Your interview is scheduled for ${a} (${tz}).`, html: (a: string) => `Your interview is scheduled for <strong>${a}</strong> (${tz}).`, detailsLabel: 'Details' },
        ms: { subject: 'Temu duga anda telah dijadualkan', greet: 'Hai', body: (a: string) => `Temu duga anda dijadualkan pada ${a} (${tz}).`, html: (a: string) => `Temu duga anda dijadualkan pada <strong>${a}</strong> (${tz}).`, detailsLabel: 'Butiran' },
        zh: { subject: '您的面试已安排', greet: '嗨', body: (a: string) => `您的面试时间为 ${a} (${tz})。`, html: (a: string) => `您的面试时间为 <strong>${a}</strong> (${tz})。`, detailsLabel: '详情' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body(at)}\n\n${T.detailsLabel}: ${SITE}/home\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.html(safeAt)}</p>`,
      }
    }
    case 'interview_round_scheduled': {
      const at = fmtDate(data.scheduled_at as string | undefined, locale)
      const safeAt = escapeHtml(at)
      const round = typeof data.round_number === 'number' ? data.round_number : 1
      const url = typeof data.interview_url === 'string' ? data.interview_url : `${SITE}/home`
      const safeUrl = escapeHtml(url)
      const T = {
        en: {
          subject: `Interview Round ${round} scheduled`,
          greet: 'Hi',
          body: (a: string) => `Round ${round} of your interview is scheduled for ${a} (${tz}). Join via video call:`,
          html: (a: string) => `Round <strong>${round}</strong> is scheduled for <strong>${a}</strong> (${tz}).<br>Join: <a href="${safeUrl}">${safeUrl}</a>`,
        },
        ms: {
          subject: `Pusingan Temu Duga ${round} dijadualkan`,
          greet: 'Hai',
          body: (a: string) => `Pusingan ${round} temu duga anda dijadualkan pada ${a} (${tz}). Sertai melalui panggilan video:`,
          html: (a: string) => `Pusingan <strong>${round}</strong> dijadualkan pada <strong>${a}</strong> (${tz}).<br>Sertai: <a href="${safeUrl}">${safeUrl}</a>`,
        },
        zh: {
          subject: `第 ${round} 轮面试已安排`,
          greet: '嗨',
          body: (a: string) => `第 ${round} 轮面试时间为 ${a} (${tz})。请通过视频通话加入：`,
          html: (a: string) => `第 <strong>${round}</strong> 轮面试时间为 <strong>${a}</strong> (${tz})。<br>加入: <a href="${safeUrl}">${safeUrl}</a>`,
        },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body(at)}\n${url}\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.html(safeAt)}</p>`,
      }
    }
    case 'interview_cancelled': {
      const T = {
        en: { subject: 'Interview cancelled', greet: 'Hi', body: 'Unfortunately the interview process for this opportunity has been cancelled. You can continue exploring other matches on DNJ.', linkText: 'View matches' },
        ms: { subject: 'Temu duga dibatalkan', greet: 'Hai', body: 'Malangnya, proses temu duga untuk peluang ini telah dibatalkan. Anda boleh terus meneroka padanan lain di DNJ.', linkText: 'Lihat padanan' },
        zh: { subject: '面试已取消', greet: '嗨', body: '很遗憾，此机会的面试流程已取消。您可以继续在 DNJ 探索其他匹配。', linkText: '查看匹配' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n${SITE}/home\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.body} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'offer_made_notify': {
      const roleTitle = typeof data.role_title === 'string' ? data.role_title : 'a role'
      const safeRole = escapeHtml(roleTitle)
      const T = {
        en: { subject: 'You have received a job offer!', greet: 'Hi', body: `Congratulations! A hiring manager has made you an offer for ${roleTitle}. Log in to review and respond.`, linkText: 'View offer' },
        ms: { subject: 'Anda menerima tawaran kerja!', greet: 'Hai', body: `Tahniah! Seorang pengurus pengambilan telah membuat tawaran untuk ${roleTitle}. Log masuk untuk semak dan bertindak balas.`, linkText: 'Lihat tawaran' },
        zh: { subject: '您收到了一份工作邀约！', greet: '嗨', body: `恭喜！有招聘经理向您提出了 ${roleTitle} 的录用邀约。请登入查看并回复。`, linkText: '查看邀约' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n${SITE}/home\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${escapeHtml(T.body).replace(escapeHtml(roleTitle), `<strong>${safeRole}</strong>`)} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'offer_accepted': {
      const talentName = typeof data.talent_name === 'string' ? data.talent_name : 'The candidate'
      const roleTitle = typeof data.role_title === 'string' ? data.role_title : 'your role'
      const safeT = escapeHtml(talentName)
      const safeR = escapeHtml(roleTitle)
      const T = {
        en: { subject: 'Offer accepted!', greet: 'Hi', body: `${talentName} has accepted your offer for ${roleTitle}. Log in to view contact details and next steps.`, linkText: 'View details' },
        ms: { subject: 'Tawaran diterima!', greet: 'Hai', body: `${talentName} telah menerima tawaran anda untuk ${roleTitle}. Log masuk untuk lihat maklumat hubungan dan langkah seterusnya.`, linkText: 'Lihat butiran' },
        zh: { subject: '邀约已接受！', greet: '嗨', body: `${talentName} 已接受您对 ${roleTitle} 的邀约。请登入查看联系方式及后续步骤。`, linkText: '查看详情' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n${SITE}/hr\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p><strong>${safeT}</strong> has accepted your offer for <strong>${safeR}</strong>. <a href="${SITE}/hr">${T.linkText}</a>.</p>`,
      }
    }
    case 'offer_declined': {
      const talentName = typeof data.talent_name === 'string' ? data.talent_name : 'The candidate'
      const roleTitle = typeof data.role_title === 'string' ? data.role_title : 'your role'
      const safeT = escapeHtml(talentName)
      const safeR = escapeHtml(roleTitle)
      const T = {
        en: { subject: 'Offer declined', greet: 'Hi', body: `${talentName} has declined your offer for ${roleTitle}. You may continue reviewing other matches.`, linkText: 'View matches' },
        ms: { subject: 'Tawaran ditolak', greet: 'Hai', body: `${talentName} telah menolak tawaran anda untuk ${roleTitle}. Anda boleh terus menyemak padanan lain.`, linkText: 'Lihat padanan' },
        zh: { subject: '邀约已拒绝', greet: '嗨', body: `${talentName} 已拒绝您对 ${roleTitle} 的邀约。您可以继续查看其他匹配。`, linkText: '查看匹配' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n\n${SITE}/hr\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p><strong>${safeT}</strong> has declined your offer for <strong>${safeR}</strong>. <a href="${SITE}/hr">${T.linkText}</a>.</p>`,
      }
    }
    case 'match_expiring': {
      const T = {
        en: { subject: 'A DNJ match is about to expire', greet: 'Hi', body: 'One of your pending matches expires in 24 hours. Log in to act on it:', linkText: 'Act now' },
        ms: { subject: 'Padanan DNJ anda hampir tamat tempoh', greet: 'Hai', body: 'Salah satu padanan anda akan tamat tempoh dalam 24 jam. Log masuk untuk bertindak:', linkText: 'Bertindak sekarang' },
        zh: { subject: '您的 DNJ 匹配即将到期', greet: '嗨', body: '您有一份匹配将于 24 小时内到期。请登入处理：', linkText: '立即处理' },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.body}\n${SITE}/home\n\n– DNJ`,
        html: `<p>${T.greet} ${safeFirst},</p><p>${T.body.replace(/[:：]\s*$/, '')} <a href="${SITE}/home">${T.linkText}</a>.</p>`,
      }
    }
    case 'match_no_action_48h': {
      const isHM = typeof data.audience === 'string' && data.audience === 'hiring_manager'
      const T = {
        en: {
          subject: 'Still thinking it over? Your DNJ match is waiting',
          greet: 'Hi',
          prompt: isHM
            ? 'A candidate has accepted your offer and is waiting on your invite.'
            : 'You opened an offer 48 hours ago. Accept or decline so matching can keep moving for you.',
          linkText: 'Take a look',
        },
        ms: {
          subject: 'Masih menimbang? Padanan DNJ anda menanti',
          greet: 'Hai',
          prompt: isHM
            ? 'Seorang calon telah menerima tawaran anda dan menanti jemputan daripada anda.'
            : 'Anda telah membuka tawaran 48 jam lalu. Terima atau tolak supaya proses padanan boleh diteruskan.',
          linkText: 'Lihat sekarang',
        },
        zh: {
          subject: '还在考虑吗? 您的 DNJ 匹配仍在等待',
          greet: '嗨',
          prompt: isHM
            ? '有候选人已接受您的 offer，正在等候您发出邀请。'
            : '您 48 小时前打开了一份 offer。请接受或拒绝，以便系统继续为您匹配。',
          linkText: '前往查看',
        },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.prompt}\n\n${SITE}/home\n\n– DNJ`,
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
        body: `${T.greet} ${first},\n\n${T.body}\n\n${T.linkLabel}: ${SITE}/hr\n\n– DNJ`,
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
          line1: `Your DNJ data export is ready. Download it within ${ttl} hours:`,
          line1Html: `Your DNJ data export is ready. <a href="${safeUrl}">Download</a> within <strong>${ttl} hours</strong>.`,
          warn: 'If you did not request this, contact privacy@diamondandjeweler.com immediately.',
        },
        ms: {
          subject: `Eksport data ${reqType} anda telah sedia`,
          greet: 'Hai',
          line1: `Eksport data DNJ anda telah sedia. Sila muat turun dalam ${ttl} jam:`,
          line1Html: `Eksport data DNJ anda telah sedia. <a href="${safeUrl}">Muat turun</a> dalam <strong>${ttl} jam</strong>.`,
          warn: 'Jika anda tidak meminta ini, sila hubungi privacy@diamondandjeweler.com dengan segera.',
        },
        zh: {
          subject: `您的 ${reqType} 数据导出已就绪`,
          greet: '嗨',
          line1: `您的 DNJ 数据导出已就绪。请在 ${ttl} 小时内下载：`,
          line1Html: `您的 DNJ 数据导出已就绪。请在 <strong>${ttl} 小时</strong> 内 <a href="${safeUrl}">下载</a>。`,
          warn: '若非您本人申请，请立即联系 privacy@diamondandjeweler.com。',
        },
      }[locale]
      return {
        subject: T.subject,
        body: `${T.greet} ${first},\n\n${T.line1}\n\n${url}\n\n${T.warn}\n\n– DNJ`,
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
