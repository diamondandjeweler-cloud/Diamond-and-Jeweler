import { supabase } from './supabase'

/**
 * Upload a file to a private bucket under the current user's folder.
 * Storage RLS enforces: path must start with auth.uid().
 * Returns the path (not a URL) which should be stored in the db.
 */
export async function uploadPrivate(
  bucket: 'ic-documents' | 'resumes' | 'business-licenses',
  file: File,
  userId: string,
  filenameHint: string,
): Promise<string> {
  const safeName = filenameHint.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${Date.now()}_${safeName}`
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 120_000)
  try {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
      signal: ac.signal,
    })
    if (error) throw error
  } finally {
    clearTimeout(t)
  }
  return path
}

/**
 * Create a short-lived signed URL so the uploader can preview their file.
 * Defaults to 60 seconds; storage policies still apply.
 */
export async function signedUrl(
  bucket: 'ic-documents' | 'resumes' | 'business-licenses',
  path: string,
  expiresInSeconds = 60,
): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}
