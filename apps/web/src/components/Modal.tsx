/**
 * Accessible modal primitive + confirm helpers.
 *
 * Replaces native window.confirm()/alert() on money/points/destructive actions
 * with a focus-trapped, Escape-closable, backdrop-dismissable dialog that matches
 * the app's design system (see ui.tsx / DobConfirmModal.tsx).
 *
 * Three layers, smallest-correct for each call site:
 *   1. <Modal>            — controlled primitive (open / onClose / title / footer)
 *   2. useConfirm()       — hook → [confirm, modalElement]; render the element in JSX
 *   3. confirmDialog(...)  — imperative promise API backed by a self-mounting portal
 *                            host, for non-component contexts (data hooks) where
 *                            threading JSX through a return bag is awkward.
 */
import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Button } from './ui'

/* ---------------------------------------------------------------- Modal ---- */

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Disable backdrop-click + Escape close (e.g. while a request is in flight). */
  dismissable?: boolean
  /** Accessible label used when no visible title is rendered. */
  ariaLabel?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  dismissable = true,
  ariaLabel,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  // Escape to close.
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, dismissable, onClose])

  // Body scroll-lock while open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Focus management: move focus into the panel on open, restore on close.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null
    const panel = panelRef.current
    if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      // Focus the first focusable control, else the panel itself.
      requestAnimationFrame(() => (first ?? panel).focus())
    }
    return () => {
      const el = restoreFocusRef.current
      if (el && typeof el.focus === 'function') el.focus()
    }
  }, [open])

  // Focus trap — keep Tab cycles inside the panel.
  const onKeyDownTrap = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement,
    )
    if (nodes.length === 0) {
      e.preventDefault()
      panel.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || active === panel) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  if (!open) return null

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- backdrop click is a mouse convenience; keyboard users close via Escape + focus-trap + the close button
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/50 sm:px-4"
      onMouseDown={(e) => {
        // Backdrop click closes — only when the press starts on the backdrop
        // itself (not on a drag that ends here).
        if (e.target === e.currentTarget && dismissable) onClose()
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the dialog keydown implements Escape-to-close + Tab focus-trap */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDownTrap}
        className="w-full bg-surface shadow-xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4 focus:outline-none max-h-[85vh] overflow-y-auto rounded-t-2xl animate-slide-up sm:max-w-md sm:rounded-2xl sm:pb-6 sm:animate-none"
      >
        {title && (
          <h2 id={titleId} className="text-xl font-semibold text-fg">
            {title}
          </h2>
        )}
        {children != null && (
          <div className="text-sm text-ink-700 dark:text-gray-300 space-y-2">{children}</div>
        )}
        {footer && <div className="flex gap-2 pt-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* -------------------------------------------------------- ConfirmModal ---- */

export type ConfirmTone = 'default' | 'danger'

export interface ConfirmOptions {
  title?: ReactNode
  message?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  tone?: ConfirmTone
  /** Notice mode: single acknowledge button, no cancel (alert replacement). */
  notice?: boolean
}

export interface ConfirmModalProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A ready-made confirm/notice dialog built on <Modal>. Used directly for
 * controlled call sites and internally by useConfirm / confirmDialog.
 */
export function ConfirmModal({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  notice = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      ariaLabel={!title ? 'Confirm' : undefined}
      footer={
        <>
          {!notice && (
            <Button variant="secondary" onClick={onCancel} className="flex-1">
              {cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            className="flex-1"
          >
            {confirmLabel ?? (notice ? 'OK' : 'Confirm')}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  )
}

/* ----------------------------------------------------------- useConfirm ---- */

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

/**
 * Hook for component call sites. Returns a promise-returning `confirm(opts)`
 * plus the modal element to render once in the component's JSX:
 *
 *   const [confirm, confirmModal] = useConfirm()
 *   ...
 *   if (!(await confirm({ title: 'Delete?', tone: 'danger' }))) return
 *   ...
 *   return (<>{children}{confirmModal}</>)
 */
export function useConfirm(): [
  (opts: ConfirmOptions) => Promise<boolean>,
  ReactNode,
] {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve })
      }),
    [],
  )

  const settle = useCallback(
    (ok: boolean) => {
      setPending((p) => {
        p?.resolve(ok)
        return null
      })
    },
    [],
  )

  const element = (
    <ConfirmModal
      open={pending != null}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
      title={pending?.title}
      message={pending?.message}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      tone={pending?.tone}
      notice={pending?.notice}
    />
  )

  return [confirm, element]
}

/* -------------------------------------------------------- confirmDialog ---- */

let portalRoot: Root | null = null
let portalHost: HTMLDivElement | null = null

function getPortalRoot(): Root {
  if (portalRoot && portalHost && document.body.contains(portalHost)) return portalRoot
  portalHost = document.createElement('div')
  portalHost.setAttribute('data-confirm-dialog-host', '')
  document.body.appendChild(portalHost)
  portalRoot = createRoot(portalHost)
  return portalRoot
}

/**
 * Imperative promise-based confirm for non-component contexts (data hooks).
 * Drop-in async replacement for `window.confirm`:
 *
 *   if (!(await confirmDialog({ message: '…' }))) return
 *
 * Renders the same <ConfirmModal> into a self-managed portal host, so the dialog
 * looks identical to the hook-driven sites.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const root = getPortalRoot()
  return new Promise<boolean>((resolve) => {
    function close(ok: boolean) {
      // Unmount the open dialog, then resolve the awaiting caller.
      root.render(
        <ConfirmModal open={false} onConfirm={() => {}} onCancel={() => {}} {...opts} />,
      )
      resolve(ok)
    }
    root.render(
      <ConfirmModal
        {...opts}
        open
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />,
    )
  })
}

/** Imperative notice (alert replacement): single acknowledge button. */
export function noticeDialog(opts: Omit<ConfirmOptions, 'notice'>): Promise<void> {
  return confirmDialog({ ...opts, notice: true }).then(() => undefined)
}
