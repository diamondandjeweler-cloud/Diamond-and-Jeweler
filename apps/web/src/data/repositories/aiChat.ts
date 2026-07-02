import { supabase } from '../../lib/supabase'

// ── ai_chat_messages: admin AI-chat transcript reads ─────────────────────────
// Centralizes the ai_chat_messages table (admin AIChatPanel). The panel applies
// conditional .gte/.eq filter tails depending on its date/endpoint/role filters,
// so this exposes the BASE builder (select + order + limit) and the caller
// chains the conditionals — projection passed through verbatim.

/** Base transcript query: newest messages first, capped at `limit`. Caller chains conditional .gte/.eq filters. */
export function listAiChatMessages(limit: number) {
  return supabase
    .from('ai_chat_messages')
    .select('id, conversation_id, user_id, endpoint, role, content, provider, model, input_tokens, output_tokens, user_role, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
}
