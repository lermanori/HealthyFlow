import MobileVersionContracts, {
  type EnabledIosVersionPolicy,
  type IosVersionPolicy,
} from '../../backend/src/mobile-version-contracts'

const { compareMarketingVersions } = MobileVersionContracts

export type VersionPolicySource = 'live' | 'cache'

export type NativeVersionDecision =
  | {
      status: 'supported'
      currentVersion: string | null
    }
  | {
      // Newer than the minimum but older than the current release: the app stays
      // usable and only nudges towards the App Store.
      status: 'outdated'
      currentVersion: string
      policy: EnabledIosVersionPolicy
      source: VersionPolicySource
    }
  | {
      status: 'blocked'
      currentVersion: string
      policy: EnabledIosVersionPolicy
      source: VersionPolicySource
    }

export function evaluateIosVersionPolicy(
  currentVersion: string,
  policy: IosVersionPolicy,
  source: VersionPolicySource,
): NativeVersionDecision {
  if (!policy.enabled) {
    return { status: 'supported', currentVersion }
  }

  if (compareMarketingVersions(currentVersion, policy.minimumVersion) < 0) {
    return { status: 'blocked', currentVersion, policy, source }
  }

  if (compareMarketingVersions(currentVersion, policy.latestVersion) < 0) {
    return { status: 'outdated', currentVersion, policy, source }
  }

  return { status: 'supported', currentVersion }
}
