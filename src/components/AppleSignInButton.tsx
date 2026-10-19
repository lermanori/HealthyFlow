import appleButton from '../assets/apple/continue-with-apple-black@3x.png'
import LoadingSpinner from './LoadingSpinner'

type AppleSignInButtonProps = {
  disabled: boolean
  loading: boolean
  onClick: () => void
}

export default function AppleSignInButton({ disabled, loading, onClick }: AppleSignInButtonProps) {
  return (
    <div className="mx-auto w-full max-w-[300px]">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label="Continue with Apple"
        aria-busy={loading}
        className="block w-full transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <img
          src={appleButton}
          width="900"
          height="144"
          alt=""
          aria-hidden="true"
          className="block h-auto w-full"
        />
      </button>
      {loading && (
        <span className="mt-1 flex items-center justify-center gap-2 text-xs text-ink-muted" role="status">
          <LoadingSpinner size="sm" decorative />
          Finishing…
        </span>
      )}
    </div>
  )
}
