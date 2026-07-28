import toast from 'react-hot-toast'

export function showUndoToast(message: string, onUndo: () => void, undoLabel: string) {
  toast.custom(
    (currentToast) => (
      <div
        role="status"
        aria-live="polite"
        className={`flex max-w-sm items-center gap-4 rounded-section border border-line bg-overlay px-4 py-3 text-sm text-ink shadow-overlay transition ${
          currentToast.visible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="min-w-0 flex-1">{message}</span>
        <button
          type="button"
          aria-label={undoLabel}
          className="min-h-11 shrink-0 rounded-control px-3 font-semibold text-accent transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => {
            toast.dismiss(currentToast.id)
            onUndo()
          }}
        >
          Undo
        </button>
      </div>
    ),
    { duration: 8000, position: 'bottom-center' },
  )
}
