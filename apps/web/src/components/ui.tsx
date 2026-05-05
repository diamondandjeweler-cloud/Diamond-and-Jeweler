/**
 * Small set of UI primitives used across the app. Not a full library —
 * just enough to keep surfaces visually consistent.
 */
import { ReactNode, ReactElement, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, useId, useState, isValidElement, cloneElement } from 'react'

/* ------------------ Button ------------------ */

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const BTN_BASE: Record<Variant, string> = {
  primary:   'btn-primary',
  brand:     'btn-brand',
  secondary: 'btn-secondary',
  ghost:     'btn-ghost',
  danger:    'btn-danger',
  success:   'btn-success',
}
const BTN_SIZE: Record<Size, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, leftIcon, rightIcon, children, className, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      className={`${BTN_BASE[variant]} ${BTN_SIZE[size]} ${className ?? ''}`}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? <Spinner size={size} /> : leftIcon}
      {children}
      {rightIcon}
    </button>
  ),
)
Button.displayName = 'Button'

/* ------------------ Spinner ------------------ */

export function Spinner({ size = 'md' }: { size?: Size }) {
  const px = size === 'sm' ? 12 : size === 'lg' ? 18 : 14
  return (
    <svg className="animate-spin" width={px} height={px} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/* ------------------ Card ------------------ */

export function Card({
  children, className, hoverable, elevated, as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  hoverable?: boolean
  elevated?: boolean
  as?: 'div' | 'article' | 'section'
}) {
  const base = elevated ? 'card-elevated' : 'card'
  return (
    <Tag className={`${base} ${hoverable ? 'card-hover' : ''} ${className ?? ''}`}>
      {children}
    </Tag>
  )
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`p-6 ${className ?? ''}`}>{children}</div>
}

export function CardHeader({
  title, subtitle, right, eyebrow,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  eyebrow?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h2 className="font-display text-xl text-ink-900 truncate">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

/* ------------------ Badge ------------------ */

export type BadgeTone = 'gray' | 'brand' | 'green' | 'amber' | 'red' | 'accent'

export function Badge({ children, tone = 'gray', className, dot }: { children: ReactNode; tone?: BadgeTone; className?: string; dot?: boolean }) {
  const dotColor =
    tone === 'green'  ? 'bg-emerald-500' :
    tone === 'amber'  ? 'bg-amber-500' :
    tone === 'red'    ? 'bg-red-500' :
    tone === 'brand'  ? 'bg-brand-500' :
    tone === 'accent' ? 'bg-accent-500' :
    'bg-ink-400'
  return (
    <span className={`badge-${tone} ${className ?? ''}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
      {children}
    </span>
  )
}

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
  return (
    <div className="field mb-3">
      {label && (
        <label htmlFor={id} className="field-label">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {isValidElement(children) ? cloneElement(children as ReactElement, { id }) : children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
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
    const [show, setShow] = useState(false)
    return (
      <div className="field mb-3">
        {label && (
          <label htmlFor={id} className="field-label">
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
            {...rest}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-ink-400 hover:text-ink-600"
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
        {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
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
      <div className="mx-auto mb-4 h-12 w-12 flex items-center justify-center rounded-full bg-ink-100 text-ink-400">
        {icon ?? <DefaultEmptyIcon />}
      </div>
      <h3 className="font-display text-lg text-ink-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-500 mb-4 max-w-sm mx-auto">{description}</p>}
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
        <h1 className="font-display text-display-sm text-ink-900 mb-1.5 leading-tight">{title}</h1>
        {description && <p className="text-ink-500 text-sm md:text-[15px] max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------ Stat tile ------------------ */

export function Stat({
  label, value, hint, tone = 'default', icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'brand' | 'accent' | 'success' | 'danger'
  icon?: ReactNode
}) {
  const valueClass =
    tone === 'brand'   ? 'text-brand-700' :
    tone === 'accent'  ? 'text-accent-600' :
    tone === 'success' ? 'text-emerald-700' :
    tone === 'danger'  ? 'text-red-700' :
    'text-ink-900'
  const ringClass =
    tone === 'brand'   ? 'before:bg-brand-500/[0.04]' :
    tone === 'accent'  ? 'before:bg-accent-500/[0.05]' :
    tone === 'success' ? 'before:bg-emerald-500/[0.05]' :
    tone === 'danger'  ? 'before:bg-red-500/[0.04]' :
    ''
  return (
    <div className={`stat ${ringClass}`}>
      <div className="flex items-start justify-between gap-2 relative">
        <div className="stat-label">{label}</div>
        {icon && <div className="text-ink-300">{icon}</div>}
      </div>
      <div className={`stat-value relative ${valueClass}`}>{value}</div>
      {hint && <div className="stat-hint relative">{hint}</div>}
    </div>
  )
}

/* ------------------ Alert ------------------ */

export function Alert({
  tone = 'brand', title, children, icon,
}: {
  tone?: 'brand' | 'amber' | 'red' | 'green'
  title?: ReactNode
  children: ReactNode
  icon?: ReactNode
}) {
  const map = {
    brand: 'bg-brand-50 border-brand-200/70 text-brand-900',
    amber: 'bg-amber-50 border-amber-200/70 text-amber-900',
    red:   'bg-red-50 border-red-200/70 text-red-900',
    green: 'bg-emerald-50 border-emerald-200/70 text-emerald-900',
  } as const
  const iconColor = {
    brand: 'text-brand-600',
    amber: 'text-amber-600',
    red:   'text-red-600',
    green: 'text-emerald-600',
  } as const
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${map[tone]} flex items-start gap-3`} role="alert">
      <div className={`shrink-0 mt-0.5 ${iconColor[tone]}`}>{icon ?? <AlertIcon tone={tone} />}</div>
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold mb-0.5">{title}</div>}
        <div>{children}</div>
      </div>
    </div>
  )
}

function AlertIcon({ tone }: { tone: 'brand' | 'amber' | 'red' | 'green' }) {
  if (tone === 'red') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 8v5M12 16v.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  }
  if (tone === 'amber') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 10v4M12 17v.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
  }
  if (tone === 'green') {
    return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M8 12.5l3 3 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" /><path d="M12 8v.01M12 11v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
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
        <h2 className="font-display text-xl text-ink-900">{title}</h2>
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
