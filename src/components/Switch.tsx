interface SwitchProps {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export default function Switch({ label, description, checked, disabled, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>
        <span className="block text-sm font-medium text-ink-soft">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>}
      </span>
      <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? 'border-cyan-400 bg-cyan-500' : 'border-line-strong bg-sunken'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
