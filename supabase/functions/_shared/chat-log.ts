/**
 * chat-log
 *
 * Persists every user/assistant turn from chat-support and chat-onboard
 * into public.ai_chat_messages for token tracking + product analytics.
 *
 * The tee* helpers wrap the upstream SSE body so the client still gets
 * every byte unchanged, while we accumulate full text + token usage in
 * the background and write a single assistant row when the stream ends.
 */
import { adminClient } from './supabase.ts'

export type Endpoint = 'chat-onboard' | 'chat-support'
export type ChatMode = 'talent' | 'hm'

export interface LogContext {
  conversation_id: string
  user_id: string
  user_role: string
  endpoint: Endpoint
  mode?: ChatMode | null
}

/** Generate a fresh conversation_id when the client doesn't supply one. */
export function ensureConversationId(input: unknown): string {
  if (typeof input === 'string' && /^[0-9a-f-]{32,36}$/i.test(input)) return input
  return crypto.randomUUID()
}

export async function logUserMessage(ctx: LogContext, content: string): Promise<void> {
  try {
    await adminClient().from('ai_chat_messages').insert({
      conversation_id: ctx.conversation_id,
      user_id:         ctx.user_id,
      user_role:       ctx.user_role,
      endpoint:        ctx.endpoint,
      mode:            ctx.mode ?? null,
      role:            'user',
      content,
    })
  } catch (e) {
    console.error('logUserMessage failed:', (e as Error).message)
  }
}

export interface AssistantLog {
  content: string
  provider: string
  model: string
  input_tokens?: number | null
  output_tokens?: number | null
}

export async function logAssistantMessage(ctx: LogContext, msg: AssistantLog): Promise<void> {
  try {
    await adminClient().from('ai_chat_messages').insert({
      conversation_id: ctx.conversation_id,
      user_id:         ctx.user_id,
      user_role:       ctx.user_role,
      endpoint:        ctx.endpoint,
      mode:            ctx.mode ?? null,
      role:            'assistant',
      content:         msg.content,
      provider:        msg.provider,
      model:           msg.model,
      input_tokens:    msg.input_tokens ?? null,
      output_tokens:   msg.output_tokens ?? null,
    })
  } catch (e) {
    console.error('logAssistantMessage failed:', (e as Error).message)
  }
}

/**
 * Tee an Anthropic SSE stream:
 *   • Forward every byte to the client unchanged (matches existing parser).
 *   • Parse `message_start` / `content_block_delta` / `message_delta` to
 *     accumulate text + token usage.
 *   • After the upstream closes, log the assistant row asynchronously.
 */
export function teeAnthropic(
  upstream: ReadableStream<Uint8Array>,
  ctx: LogContext,
  model: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  let buf = ''
  let fullText = ''
  let inputTokens: number | null = null
  let outputTokens: number | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const evt = JSON.parse(raw)
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                fullText += evt.delta.text
              } else if (evt.type === 'message_start') {
                if (evt.message?.usage?.input_tokens != null)  inputTokens  = evt.message.usage.input_tokens
                if (evt.message?.usage?.output_tokens != null) outputTokens = evt.message.usage.output_tokens
              } else if (evt.type === 'message_delta' && evt.usage?.output_tokens != null) {
                outputTokens = evt.usage.output_tokens
              }
            } catch { /* ignore malformed line */ }
          }
        }
      } catch (e) {
        console.error('teeAnthropic upstream read failed:', (e as Error).message)
      } finally {
        controller.close()
        void logAssistantMessage(ctx, {
          content: fullText, provider: 'anthropic', model,
          input_tokens: inputTokens, output_tokens: outputTokens,
        })
      }
    },
  })
}

/**
 * Tee an OpenAI-compatible SSE stream (Groq / Gemini / OpenAI / OpenRouter).
 *   • Rewrite each `choices[0].delta.content` chunk into Anthropic
 *     content_block_delta SSE format, matching the existing client parser.
 *   • Capture the final usage chunk (when the upstream supports
 *     stream_options.include_usage) for token logging.
 *   • After the upstream closes, log the assistant row asynchronously.
 */
export function teeOpenAICompat(
  upstream: ReadableStream<Uint8Array>,
  ctx: LogContext,
  provider: string,
  model: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buf = ''
  let fullText = ''
  let inputTokens: number | null = null
  let outputTokens: number | null = null

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader()
      let finished = false
      try {
        while (!finished) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue
            if (raw === '[DONE]') {
              controller.enqueue(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'))
              finished = true
              break
            }
            try {
              const evt = JSON.parse(raw)
              const text = evt.choices?.[0]?.delta?.content
              if (typeof text === 'string' && text.length > 0) {
                fullText += text
                const out = JSON.stringify({
                  type: 'content_block_delta', index: 0,
                  delta: { type: 'text_delta', text },
                })
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${out}\n\n`))
              }
              if (evt.usage) {
                if (typeof evt.usage.prompt_tokens === 'number')     inputTokens  = evt.usage.prompt_tokens
                if (typeof evt.usage.completion_tokens === 'number') outputTokens = evt.usage.completion_tokens
              }
            } catch { /* ignore malformed line */ }
          }
        }
      } catch (e) {
        console.error(`teeOpenAICompat (${provider}) upstream read failed:`, (e as Error).message)
      } finally {
        controller.close()
        void logAssistantMessage(ctx, {
          content: fullText, provider, model,
          input_tokens: inputTokens, output_tokens: outputTokens,
        })
      }
    },
  })
}
