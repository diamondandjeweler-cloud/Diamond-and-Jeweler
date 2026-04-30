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
