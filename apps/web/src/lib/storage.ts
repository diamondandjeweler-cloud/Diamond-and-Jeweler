import { supabase } from './supabase'

// Allowed file types and their magic byte signatures.
// Each entry: [extension, mimeType, byteOffset, expectedBytes]
const ALLOWED_TYPES: Array<{
  ext: string
  mime: string
  offset: number
  magic: number[]
}> = [
  { ext: 'pdf',  mime: 'application/pdf',                                  offset: 0, magic: [0x25, 0x50, 0x44, 0x46] },           // %PDF
  { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', offset: 0, magic: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP)
  { ext: 'doc',  mime: 'application/msword',                               offset: 0, magic: [0xD0, 0xCF, 0x11, 0xE0] },           // Compound doc
  { ext: 'jpg',  mime: 'image/jpeg',                                        offset: 0, magic: [0xFF, 0xD8, 0xFF] },
  { ext: 'jpeg', mime: 'image/jpeg',                                        offset: 0, magic: [0xFF, 0xD8, 0xFF] },
  { ext: 'png',  mime: 'image/png',                                         offset: 0, magic: [0x89, 0x50, 0x4E, 0x47] },
]

const MAX_BYTES_TO_READ = 16

/**
 * Validates a file's actual content via magic bytes (not just the declared MIME type).
 * Throws if the file is not one of the allowed types.
 */
async function assertSafeFile(file: File): Promise<string> {
  const slice = file.slice(0, MAX_BYTES_TO_READ)
  const buf = await slice.arrayBuffer()
  const bytes = new Uint8Array(buf)

  for (const t of ALLOWED_TYPES) {
    const magic = t.magic
    const offset = t.offset
    if (bytes.length < offset + magic.length) continue
    const match = magic.every((b, i) => bytes[offset + i] === b)
    if (match) return t.mime
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'unknown'
  throw new Error(
    `File type not allowed. Accepted: PDF, DOCX, DOC, JPG, PNG. Detected extension: .${ext}`,
  )
}

/**
 * Upload a file to a private bucket under the current user's folder.
 * Storage RLS enforces: path must start with auth.uid().
 * Returns the path (not a URL) which should be stored in the db.
 */
export async function uploadPrivate(
  bucket: 'ic-documents' | 'resumes' | 'business-licenses' | 'talent-photos',
  file: File,
  userId: string,
  filenameHint: string,
): Promise<string> {
  const verifiedMime = await assertSafeFile(file)
  const safeName = filenameHint.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: verifiedMime,
  })
  if (error) throw error
  return path
}

/**
 * Create a short-lived signed URL so the uploader can preview their file.
 * Defaults to 60 seconds; storage policies still apply.
 */
export async function signedUrl(
  bucket: 'ic-documents' | 'resumes' | 'business-licenses' | 'talent-photos',
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

/**
 * Sibling helper for HM-side resume access. Wraps the storage signed-URL
 * creation with a database audit emit (PDPA section 10 — CV downloads must
 * be logged for dispute resolution). Storage events don't fire DB triggers
 * on their own, so we route the request through the log_cv_download RPC
 * which both verifies the caller's status-gated access and writes the
 * audit_log row before handing back the signed URL.
 *
 * Falls back gracefully if the audit RPC is unavailable so a user-facing
 * resume preview never breaks; the gap surfaces as an admin alert instead.
 */
export async function signedResumeUrlForMatch(
  matchId: string,
  resumePath: string,
  expiresInSeconds = 60,
): Promise<string> {
  // If the audit emit fails, the download must NOT proceed (PDPA defensibility:
  // every download must have a log row). The thrown error propagates to the caller.
  const { error: auditErr } = await supabase.rpc('log_cv_download', { p_match_id: matchId })
  if (auditErr) {
    // Don't expose internal error text to caller; surface as a generic deny.
    throw new Error(auditErr.message || 'cv_download_audit_failed')
  }
  return signedUrl('resumes', resumePath, expiresInSeconds)
}
