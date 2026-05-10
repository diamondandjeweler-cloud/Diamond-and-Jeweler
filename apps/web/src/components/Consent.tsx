interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  required?: boolean
}

export default function Consent({ checked, onChange, label, required }: Props) {
  // F20 — checkbox bumped from 22×22 to 24×24 so the visual tap target
  // meets WCAG 2.2 AA. The full row also keeps a 44px minimum height so
  // the comfortable touch surface (the whole label is clickable) is well
  // above the AA floor on mobile.
  return (
    <label className="flex items-start gap-3 text-sm text-ink-700 cursor-pointer select-none group min-h-[44px] py-1.5">
      <span className="relative flex items-center justify-center shrink-0 mt-0.5 h-6 w-6">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer appearance-none h-6 w-6 border border-ink-300 rounded bg-white
                     checked:bg-ink-900 checked:border-ink-900
                     hover:border-ink-400 focus:ring-2 focus:ring-brand-500/40
                     transition cursor-pointer"
        />
        <svg className="absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6l2.5 2.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-relaxed">
        {label}
        {required && <span className="text-red-500 ml-1" aria-hidden>*</span>}
      </span>
    </label>
  )
}
