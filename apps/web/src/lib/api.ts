import { supabase } from './supabase'
import type { Profile } from '../types/db'

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.error('fetchProfile error', error)
    return null
  }
  return data as Profile | null
}

export async function markOnboardingComplete(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_complete: true })
    .eq('id', userId)
  if (error) throw error
}

/**
 * Encrypt a DOB via the SQL function encrypt_dob(text) -> bytea.
 * Returns the base64-encoded ciphertext ready to store in date_of_birth_encrypted.
 */
export async function encryptDob(dobIsoDate: string): Promise<string> {
  const { data, error } = await supabase.rpc('encrypt_dob', { dob_text: dobIsoDate })
  if (error) throw error
  // Supabase returns bytea as a hex-prefixed string or base64 depending on driver;
  // for consistency, cast to string here. The column type is bytea.
  return data as unknown as string
}

export async function submitWaitlist(
  email: string,
  fullName: string,
  intendedRole: 'talent' | 'hr_admin',
  note?: string,
) {
  const { error } = await supabase
    .from('waitlist')
    .insert({
      email,
      full_name: fullName,
      intended_role: intendedRole,
      note: note ?? null,
    })
  if (error) throw error
}

/* ------------------ Support tickets ------------------ */

export type SupportCategory =
  | 'bug' | 'feedback' | 'account' | 'payment' | 'feature_request' | 'other'

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type SupportPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface SupportTicket {
  id: string
  user_id: string
  category: SupportCategory
  subject: string
  message: string
  status: SupportStatus
  priority: SupportPriority
  admin_reply: string | null
  replied_by: string | null
  replied_at: string | null
  attachment_url: string | null
  user_agent: string | null
  page_url: string | null
  created_at: string
  updated_at: string
}

export interface SupportTicketInput {
  category: SupportCategory
  subject: string
  message: string
  attachment?: File | null
}

const SUPPORT_BUCKET = 'support-attachments'

async function uploadSupportAttachment(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export async function createSupportTicket(input: SupportTicketInput): Promise<SupportTicket> {
  const { data: userData, error: userErr } = await supabase.auth.getUser()
  if (userErr || !userData.user) throw userErr ?? new Error('Not authenticated')
  const userId = userData.user.id

  let attachmentPath: string | null = null
  if (input.attachment) {
    attachmentPath = await uploadSupportAttachment(userId, input.attachment)
  }

  const payload = {
    user_id: userId,
    category: input.category,
    subject: input.subject.trim(),
    message: input.message.trim(),
    attachment_url: attachmentPath,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    page_url: typeof window !== 'undefined' ? window.location.href : null,
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data as SupportTicket
}

export async function listMySupportTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SupportTicket[]
}

export interface SupportFilters {
  status?: SupportStatus | 'all'
  category?: SupportCategory | 'all'
  priority?: SupportPriority | 'all'
  search?: string
}

export async function listAllSupportTickets(filters: SupportFilters = {}): Promise<SupportTicket[]> {
  let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false })
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category)
  if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority)
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,]/g, '')
    q = q.or(`subject.ilike.%${s}%,message.ilike.%${s}%`)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as SupportTicket[]
}

export async function replyToSupportTicket(
  id: string,
  reply: string,
  status: SupportStatus = 'in_progress',
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const adminId = userData.user?.id ?? null
  const { error } = await supabase
    .from('support_tickets')
    .update({
      admin_reply: reply,
      replied_by: adminId,
      replied_at: new Date().toISOString(),
      status,
    })
    .eq('id', id)
  if (error) throw error
}

export async function updateSupportTicketStatus(
  id: string,
  status: SupportStatus,
  priority?: SupportPriority,
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (priority) patch.priority = priority
  const { error } = await supabase.from('support_tickets').update(patch).eq('id', id)
  if (error) throw error
}

export async function getSupportAttachmentUrl(path: string, expiresInSec = 300): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SUPPORT_BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error) return null
  return data?.signedUrl ?? null
}
