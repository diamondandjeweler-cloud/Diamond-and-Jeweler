import { encryptDobRpc, profileById, updateProfile } from '../data/repositories/profiles'
import { addWaitlistEntry } from '../data/repositories/waitlist'
import { createLogger } from './logger'
import type { Profile } from '../types/db'

const log = createLogger('api')

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await profileById(userId).maybeSingle()
  if (error) {
    // F-cache regression — previously this returned null silently, which the
    // session bootstrap then *stored* as the live profile + wiped the
    // localStorage cache. The next reload found no cached profile and the
    // auth gates hung on a spinner forever. Throwing here lets the bootstrap's
    // `.catch` handler fall back to the cached profile instead.
    log.error('fetchProfile error', error)
    throw error
  }
  return data as Profile | null
}

export async function markOnboardingComplete(userId: string) {
  const { error } = await updateProfile(userId, { onboarding_complete: true })
  if (error) throw error
}

/**
 * Encrypt a DOB via the SQL function encrypt_dob(text) -> bytea.
 * Returns the base64-encoded ciphertext ready to store in date_of_birth_encrypted.
 */
export async function encryptDob(dobIsoDate: string): Promise<string> {
  const { data, error } = await encryptDobRpc(dobIsoDate)
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
  const { error } = await addWaitlistEntry({
    email,
    full_name: fullName,
    intended_role: intendedRole,
    note: note ?? null,
  })
  if (error) throw error
}
