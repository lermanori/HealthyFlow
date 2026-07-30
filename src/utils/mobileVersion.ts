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
  if (
    !policy.enabled
    || compareMarketingVersions(currentVersion, policy.minimumVersion) >= 0
  ) {
    return { status: 'supported', currentVersion }
  }

  return {
    status: 'blocked',
    currentVersion,
    policy,
    source,
  }
}
