/**
 * Pure SSE / transcript processing for the Bo onboarding chat (Phase 3-5 clean-arch).
 *
 * The Talent and HM onboarding wizards both stream Claude's reply from the
 * `chat-onboard` edge function as Server-Sent Events and progressively paint the
 * accumulated text. The *mechanics* of that stream — decoding `data:` frames,
 * accumulating `text_delta` chunks, recognising the `[PROFILE_READY]` sentinel,
 * and hiding a half-typed sentinel from the user — were duplicated verbatim in
 * both route components. That logic is deterministic and framework-free, so it
 * lives here in the pure domain layer with a golden-vector characterization
 * suite. No React, no fetch, no Supabase.
 *
 * The completion sentinel is `[PROFILE_READY]`: when Bo emits it the chat phase
 * is over and the wizard advances. Because the token streams a character at a
 * time, a *partial* sentinel (e.g. `…thanks![PROFILE_`) must never flash on
 * screen, so `displayText` strips any trailing partial `[PROFILE_*` fragment.
 */

/** Marker Bo appends to its final turn to signal the structured profile is ready. */
export const PROFILE_READY_SENTINEL = '[PROFILE_READY]'

/**
 * Outcome of feeding one decoded SSE chunk-buffer's worth of lines to the
 * accumulator. `stop` is true once a terminal frame (`[DONE]` or
 * `message_stop`) was seen — the caller should break its read loop.
 */
export interface StreamStepResult {
  /** Full accumulated assistant text so far (sentinel NOT stripped). */
  accumulated: string
  /** True once a terminal SSE frame was encountered in this batch. */
  stop: boolean
}

/**
 * Split a raw decode buffer into complete lines, returning the finished lines
 * plus the trailing partial line that must be carried into the next read.
 *
 * Relocated verbatim from the inline `buffer.split('\n'); buffer = lines.pop()`
 * idiom in both onboarding components.
 */
export function splitSseBuffer(buffer: string): { lines: string[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  return { lines, rest }
}

/**
 * Fold one batch of complete SSE lines into the running accumulated text.
 *
 * Mirrors the inner `for (const line of lines)` loop exactly:
 *  - only `data: ` lines are considered; everything else is ignored;
 *  - a `data: [DONE]` frame stops the stream;
 *  - each JSON frame of `type: content_block_delta` with a `text_delta` delta
 *    appends `delta.text` to the accumulator;
 *  - a `message_stop` frame stops the stream;
 *  - malformed JSON is skipped silently.
 */
export function accumulateSseLines(lines: string[], accumulated: string): StreamStepResult {
  let acc = accumulated
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const raw = line.slice(6).trim()
    if (raw === '[DONE]') return { accumulated: acc, stop: true }
    try {
      const evt = JSON.parse(raw) as {
        type?: string
        delta?: { type?: string; text?: string }
      }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
        acc += evt.delta.text ?? ''
      }
      if (evt.type === 'message_stop') return { accumulated: acc, stop: true }
    } catch {
      /* skip malformed SSE lines */
    }
  }
  return { accumulated: acc, stop: false }
}

/**
 * True once the completion sentinel has been fully emitted.
 */
export function isProfileReady(accumulated: string): boolean {
  return accumulated.includes(PROFILE_READY_SENTINEL)
}

/**
 * The user-facing text for the currently accumulated assistant reply.
 *
 * When the full `[PROFILE_READY]` sentinel is present it is removed outright.
 * Otherwise any *trailing partial* sentinel fragment (`[PROFILE_` … streaming
 * in) is stripped so a half-typed marker never flashes on screen. Trailing
 * whitespace is trimmed in both cases. Relocated verbatim from the inline
 * `display` computation shared by both onboarding components.
 */
export function displayText(accumulated: string): string {
  return accumulated.includes(PROFILE_READY_SENTINEL)
    ? accumulated.replace(PROFILE_READY_SENTINEL, '').trimEnd()
    : accumulated.replace(/\[PROFILE_[A-Z_\]]*$/, '').trimEnd()
}
