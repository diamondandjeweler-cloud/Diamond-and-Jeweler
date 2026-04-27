interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  required?: boolean
}

export default function Consent({ checked, onChange, label, required }: Props) {
  return (
    <label className="flex items-start gap-3 text-sm text-ink-700 cursor-pointer select-none group">
      <span className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer appearance-none h-[18px] w-[18px] border border-ink-300 rounded bg-white
                     checked:bg-ink-900 checked:border-ink-900
                     hover:border-ink-400 focus:ring-2 focus:ring-brand-500/40
                     transition cursor-pointer"
        />
        <svg className="absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition" viewBox="0 0 12 12" fill="none" aria-hidden>
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
