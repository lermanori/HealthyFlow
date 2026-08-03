import { App as CapacitorApp } from '@capacitor/app'
import MobileVersionContracts, {
  type EnabledIosVersionPolicy,
  type IosVersionPolicy,
} from '../../backend/src/mobile-version-contracts'
import { mobileVersionService } from '../services/api'
import {
  evaluateIosVersionPolicy,
  type NativeVersionDecision,
  type VersionPolicySource,
} from '../utils/mobileVersion'
import { isNativeApp } from './native'

const {
  AppMarketingVersionSchema,
  EnabledIosVersionPolicySchema,
} = MobileVersionContracts

const IOS_VERSION_POLICY_CACHE_KEY = 'healthyflow-ios-version-policy-v1'
const IOS_UPDATE_NUDGE_DISMISSED_KEY = 'healthyflow-ios-update-nudge-dismissed-v1'

/**
 * The soft update nudge is dismissed per released version, so a later release
 * asks again instead of staying hidden forever.
 */
export function isUpdateNudgeDismissed(latestVersion: string): boolean {
  try {
    return window.localStorage.getItem(IOS_UPDATE_NUDGE_DISMISSED_KEY) === latestVersion
  } catch {
    return false
  }
}

export function dismissUpdateNudge(latestVersion: string) {
  try {
    window.localStorage.setItem(IOS_UPDATE_NUDGE_DISMISSED_KEY, latestVersion)
  } catch {
    // A dismissal that cannot be stored only costs one extra nudge.
  }
}

function readCachedPolicy(): EnabledIosVersionPolicy | null {
  try {
    const raw = window.localStorage.getItem(IOS_VERSION_POLICY_CACHE_KEY)
    if (!raw) return null
    const parsed = EnabledIosVersionPolicySchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // Invalid local state is discarded below.
  }
  window.localStorage.removeItem(IOS_VERSION_POLICY_CACHE_KEY)
  return null
}

function cacheLivePolicy(policy: IosVersionPolicy) {
  if (!policy.enabled) {
    window.localStorage.removeItem(IOS_VERSION_POLICY_CACHE_KEY)
    return
  }
  window.localStorage.setItem(IOS_VERSION_POLICY_CACHE_KEY, JSON.stringify(policy))
}

async function resolvePolicy(): Promise<{
  policy: IosVersionPolicy | null
  source: VersionPolicySource
}> {
  try {
    const policy = await mobileVersionService.getIosPolicy()
    cacheLivePolicy(policy)
    return { policy, source: 'live' }
  } catch (error) {
    console.warn('[version-gate] live iOS policy unavailable; checking cache:', error)
    return { policy: readCachedPolicy(), source: 'cache' }
  }
}

export async function checkNativeVersionGate(): Promise<NativeVersionDecision> {
  if (!isNativeApp) {
    return { status: 'supported', currentVersion: null }
  }

  try {
    const appInfo = await CapacitorApp.getInfo()
    const currentVersion = AppMarketingVersionSchema.parse(appInfo.version)
    const { policy, source } = await resolvePolicy()
    if (!policy) return { status: 'supported', currentVersion }
    return evaluateIosVersionPolicy(currentVersion, policy, source)
  } catch (error) {
    console.error('[version-gate] could not evaluate installed iOS version:', error)
    return { status: 'supported', currentVersion: null }
  }
}
