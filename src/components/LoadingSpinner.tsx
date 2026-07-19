interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
  decorative?: boolean
}

export default function LoadingSpinner({ size = 'md', className = '', label = 'Loading', decorative = false }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <span className="inline-flex" role={decorative ? undefined : 'status'} aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
      <span className={`animate-spin rounded-full border-2 border-line-strong border-t-cyan-500 ${sizeClasses[size]} ${className}`} />
    </span>
  )
}
