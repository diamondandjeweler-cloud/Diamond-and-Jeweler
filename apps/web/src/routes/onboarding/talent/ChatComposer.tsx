/**
 * Chat-phase composer — the auto-growing textarea + Send / Stop button.
 *
 * Relocated verbatim from TalentOnboarding.tsx. Purely presentational: the
 * parent still owns the chat engine (useOnboardingChat) and the textarea ref
 * (chatInputRef). The ref is forwarded as an ordinary `inputRef` prop and
 * applied as ref={inputRef} — no React.forwardRef needed. onSend wraps
 * () => void sendMessage(input); onStop wraps () => stop(). No logic changed.
 */
import { memo, type RefObject } from 'react'
import type { TFunction } from 'i18next'
import { Button } from '../../../components/ui'

interface ChatComposerProps {
  t: TFunction
  inputRef: RefObject<HTMLTextAreaElement>
  input: string
  setInput: (v: string) => void
  isStreaming: boolean
  onSend: () => void
  onStop: () => void
}

function ChatComposerImpl({ t, inputRef, input, setInput, isStreaming, onSend, onStop }: ChatComposerProps) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSend() }}
      className="flex items-end gap-2"
    >
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSend()
          }
        }}
        placeholder={
          isStreaming
            ? t('talentOnboard.chatTyping')
            : t('talentOnboard.chatPlaceholder')
        }
        rows={2}
        disabled={isStreaming}
        className="flex-1 resize-none rounded-xl border border-border bg-surface dark:text-fg dark:placeholder-fg-subtle px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-surface-2"
        // Active chat surface — autoFocus when entering this step is intentional.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
      />
      {isStreaming ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onStop}
        >
          {t('talentOnboard.stop')}
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={!input.trim()}
          size="sm"
        >
          {t('common.send')}
        </Button>
      )}
    </form>
  )
}

const ChatComposer = memo(ChatComposerImpl)
export default ChatComposer
