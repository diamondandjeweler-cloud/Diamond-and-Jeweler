/**
 * Small set of UI primitives used across the app. Not a full library —
 * just enough to keep surfaces visually consistent.
 */
import { ReactNode, ReactElement, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, useId, useState, isValidElement, cloneElement } from 'react'

/* ------------------------------------------------------------------
 * Migrated primitives — implementations live in src/ui/<Name>/ (tv() +
 * semantic tokens; see src/ui/tokens.css). Re-exported here so every
 * existing `import { … } from '../components/ui'` keeps working; new code
 * should import from the src/ui barrel.
 * ------------------------------------------------------------------ */
export { Button, Spinner } from '../ui/Button'
export type { ButtonProps } from '../ui/Button'
export { Card, CardBody, CardHeader } from '../ui/Card'
export { Badge } from '../ui/Badge'
export type { BadgeTone } from '../ui/Badge'
export { Alert } from '../ui/Alert'
export { Stat } from '../ui/Stat'

/* ------------------ Field (label + input) ------------------ */

interface FieldBase {
  label?: string
  hint?: string
  error?: string
  required?: boolean
}

export function Field({
  label, hint, error, required, children,
}: FieldBase & { children: ReactNode }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  // Associate the control with its hint/error text so screen readers announce it,
  // and flag it invalid when errored. Previously only `id` was injected, so the
  // visible hint/error was silent to assistive tech.
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined
  const a11yProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-errormessage': error ? errId : undefined,
  }
  return (
    <div className="field mb-3">
      {label && (
        <label htmlFor={id} className="field-label dark:text-gray-300">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {isValidElement(children) ? cloneElement(children as ReactElement, a11yProps) : children}
      {error ? <p id={errId} className="field-error" role="alert">{error}</p> : hint ? <p id={hintId} className="field-hint dark:text-gray-400">{hint}</p> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldBase>(
  ({ label, hint, error, required, className, ...rest }, ref) => (
    <Field label={label} hint={hint} error={error} required={required}>
      <input ref={ref} className={`w-full ${className ?? ''}`} required={required} {...rest} />
    </Field>
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldBase>(
  ({ label, hint, error, required, className, ...rest }, ref) => (
    <Field label={label} hint={hint} error={error} required={required}>
      <textarea ref={ref} className={`w-full ${className ?? ''}`} required={required} {...rest} />
    </Field>
  ),
)
Textarea.displayName = 'Textarea'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldBase>(
  ({ label, hint, error, required, className, children, ...rest }, ref) => (
    <Field label={label} hint={hint} error={error} required={required}>
      <select ref={ref} className={`w-full ${className ?? ''}`} required={required} {...rest}>
        {children}
      </select>
    </Field>
  ),
)
Select.displayName = 'Select'

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & FieldBase>(
  ({ label, hint, error, required, className, ...rest }, ref) => {
    const id = useId()
    const hintId = `${id}-hint`
    const errId = `${id}-err`
    const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined
    const [show, setShow] = useState(false)
    return (
      <div className="field mb-3">
        {label && (
          <label htmlFor={id} className="field-label dark:text-gray-300">
            {label}{required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={show ? 'text' : 'password'}
            className={`w-full pr-10 ${className ?? ''}`}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-errormessage={error ? errId : undefined}
            {...rest}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 dark:text-gray-500 hover:text-ink-600 dark:hover:text-gray-300"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error ? <p id={errId} className="field-error" role="alert">{error}</p> : hint ? <p id={hintId} className="field-hint dark:text-gray-400">{hint}</p> : null}
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------ Empty state ------------------ */

export function EmptyState({
  title, description, action, icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="text-center py-14 px-6">
      <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-full bg-ink-100 dark:bg-gray-700 text-ink-400 dark:text-gray-400">
        {icon ?? <DefaultEmptyIcon />}
      </div>
      <h3 className="font-display text-lg text-ink-900 dark:text-white mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-500 dark:text-gray-400 mb-4 max-w-sm mx-auto">{description}</p>}
      {action}
    </div>
  )
}

function DefaultEmptyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 11h6M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

/* ------------------ Page header ------------------ */

export function PageHeader({
  title, description, actions, eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-display-sm text-ink-900 dark:text-white mb-1.5 leading-tight">{title}</h1>
        {description && <p className="text-ink-500 dark:text-gray-400 text-sm md:text-[15px] max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------ Section heading ------------------ */

export function SectionTitle({
  title, eyebrow, action,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="font-display text-xl text-ink-900 dark:text-white">{title}</h2>
      </div>
      {action}
    </div>
  )
}

/* ------------------ Live dot ------------------ */

export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-emerald-700">
      <span className="live-dot" />
      {label}
    </span>
  )
}
