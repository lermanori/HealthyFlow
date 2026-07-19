interface ProgressProps {
  label: string
  value: number
  max?: number
  className?: string
  indicatorClassName?: string
}

export default function Progress({ label, value, max = 100, className = '', indicatorClassName = 'bg-gradient-to-r from-cyan-500 to-blue-500' }: ProgressProps) {
  const safeMax = max > 0 ? max : 100
  const safeValue = Math.max(0, Math.min(value, safeMax))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      className={`overflow-hidden rounded-full bg-card ${className}`}
    >
      <div className={`h-full rounded-full ${indicatorClassName}`} style={{ width: `${(safeValue / safeMax) * 100}%` }} />
    </div>
  )
}
