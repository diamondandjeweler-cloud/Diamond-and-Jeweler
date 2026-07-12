/**
 * Field family — label + control primitives: Field, Input, Textarea, Select,
 * PasswordInput.
 *
 * Moved verbatim from components/ui.tsx (same export names, props, defaults and
 * className strings) so the DOM output is byte-identical; components/ui now
 * re-exports these as a thin deprecated shim. New code should import from the
 * src/ui barrel (`import { Field, Input } from '../../ui'`).
 */
import {
  ReactNode,
  ReactElement,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  forwardRef,
  useId,
  useState,
  isValidElement,
  cloneElement,
} from 'react'

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
        <label htmlFor={id} className="field-label dark:text-fg-strong">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {isValidElement(children) ? cloneElement(children as ReactElement, a11yProps) : children}
      {error ? <p id={errId} className="field-error" role="alert">{error}</p> : hint ? <p id={hintId} className="field-hint dark:text-fg-muted">{hint}</p> : null}
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
          <label htmlFor={id} className="field-label dark:text-fg-strong">
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
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-fg-subtle hover:text-ink-600 dark:hover:text-fg-strong"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error ? <p id={errId} className="field-error" role="alert">{error}</p> : hint ? <p id={hintId} className="field-hint dark:text-fg-muted">{hint}</p> : null}
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
