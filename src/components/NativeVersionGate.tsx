import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUpCircle, Loader2, X } from 'lucide-react'
import { analytics } from '../lib/analytics'
import { isNativeApp, openNativeBrowser } from '../lib/native'
import {
  checkNativeVersionGate,
  dismissUpdateNudge,
  isUpdateNudgeDismissed,
} from '../lib/versionGate'
import type { EnabledIosVersionPolicy } from '../../backend/src/mobile-version-contracts'
import type { NativeVersionDecision, VersionPolicySource } from '../utils/mobileVersion'

type GateState =
  | { status: 'checking' }
  | NativeVersionDecision

export default function NativeVersionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>(
    isNativeApp
      ? { status: 'checking' }
      : { status: 'supported', currentVersion: null },
  )
  const [storeError, setStoreError] = useState(false)
  const checkSequence = useRef(0)
  const lastBlockedSignature = useRef<string | null>(null)

  useEffect(() => {
    if (!isNativeApp) return
    let active = true

    const check = async () => {
      const sequence = ++checkSequence.current
      const decision = await checkNativeVersionGate()
      if (active && sequence === checkSequence.current) {
        setState(decision)
      }
    }

    void check()
    const handleAppState = (event: Event) => {
      const isActive = (event as CustomEvent<{ isActive?: boolean }>).detail?.isActive
      if (isActive) void check()
    }
    window.addEventListener('healthyflow:app-state', handleAppState)
    return () => {
      active = false
      window.removeEventListener('healthyflow:app-state', handleAppState)
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'blocked') return
    const signature = `${state.currentVersion}:${state.policy.minimumVersion}`
    if (lastBlockedSignature.current === signature) return
    lastBlockedSignature.current = signature
    analytics.capture('native_version_blocked', {
      current_version: state.currentVersion,
      minimum_version: state.policy.minimumVersion,
      policy_source: state.source,
    })
  }, [state])

  if (state.status === 'supported') return <>{children}</>

  if (state.status === 'outdated') {
    return (
      <>
        {children}
        <UpdateNudge
          currentVersion={state.currentVersion}
          policy={state.policy}
          source={state.source}
        />
      </>
    )
  }

  if (state.status === 'checking') {
    return (
      <div
        className="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center bg-page text-ink"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-accent" aria-hidden="true" />
          <p className="text-sm text-ink-muted">Checking HealthyFlow version…</p>
        </div>
      </div>
    )
  }

  const openStore = async () => {
    setStoreError(false)
    try {
      analytics.capture('native_update_opened', {
        current_version: state.currentVersion,
        target_version: state.policy.minimumVersion,
        trigger: 'blocked',
      })
      await openNativeBrowser(state.policy.storeUrl)
    } catch {
      setStoreError(true)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex min-h-dvh items-center justify-center bg-page px-6 text-ink"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="native-version-title"
      aria-describedby="native-version-message"
    >
      <div className="surface-overlay w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <ArrowUpCircle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 id="native-version-title" className="text-2xl font-bold text-ink">
          Update required
        </h1>
        <p id="native-version-message" className="mt-3 text-sm leading-6 text-ink-soft">
          {state.policy.message}
        </p>
        <p className="mt-3 text-xs text-ink-muted">
          Installed {state.currentVersion} · Requires {state.policy.minimumVersion} or newer
        </p>
        <button
          type="button"
          className="btn-primary mt-6 w-full px-4 py-3"
          onClick={() => void openStore()}
        >
          Update HealthyFlow
        </button>
        {storeError && (
          <p className="mt-3 text-xs text-state-danger" role="alert">
            The App Store could not be opened. Check your connection and try again.
          </p>
        )}
      </div>
    </div>
  )
}

function UpdateNudge({
  currentVersion,
  policy,
  source,
}: {
  currentVersion: string
  policy: EnabledIosVersionPolicy
  source: VersionPolicySource
}) {
  const [dismissed, setDismissed] = useState(() => isUpdateNudgeDismissed(policy.latestVersion))
  const lastSeenVersion = useRef<string | null>(null)

  useEffect(() => {
    if (dismissed || lastSeenVersion.current === policy.latestVersion) return
    lastSeenVersion.current = policy.latestVersion
    analytics.capture('native_update_available', {
      current_version: currentVersion,
      latest_version: policy.latestVersion,
      policy_source: source,
    })
  }, [currentVersion, dismissed, policy.latestVersion, source])

  if (dismissed) return null

  const dismiss = () => {
    dismissUpdateNudge(policy.latestVersion)
    setDismissed(true)
    analytics.capture('native_update_dismissed', {
      current_version: currentVersion,
      latest_version: policy.latestVersion,
    })
  }

  const openStore = () => {
    analytics.capture('native_update_opened', {
      current_version: currentVersion,
      target_version: policy.latestVersion,
      trigger: 'nudge',
    })
    void openNativeBrowser(policy.storeUrl).catch(() => {
      // The nudge is optional; a failed store hand-off stays silent.
    })
  }

  return (
    <div
      className="fixed inset-x-0 z-[150] px-4"
      style={{ bottom: 'calc(var(--mobile-dock-height, 0px) + 0.75rem)' }}
      role="status"
      aria-live="polite"
    >
      <div className="surface-overlay mx-auto flex w-full max-w-sm items-center gap-3 p-3 shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <ArrowUpCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Update available</p>
          <p className="text-xs text-ink-muted">
            HealthyFlow {policy.latestVersion} is ready in the App Store.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
          onClick={openStore}
        >
          Update
        </button>
        <button
          type="button"
          className="shrink-0 rounded-lg p-1 text-ink-muted hover:text-ink"
          onClick={dismiss}
          aria-label="Dismiss update notice"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
