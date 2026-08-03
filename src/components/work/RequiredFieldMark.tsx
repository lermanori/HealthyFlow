export function RequiredFieldMark() {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-state-danger">*</span>
      <span className="sr-only"> (required)</span>
    </>
  )
}

export function RequiredFieldsNote({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-ink-muted ${className}`.trim()}>
      <span aria-hidden="true" className="font-semibold text-state-danger">*</span> Required fields
    </p>
  )
}
