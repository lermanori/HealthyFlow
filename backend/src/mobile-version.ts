import { z } from 'zod'
import {
  compareMarketingVersions,
  EnabledIosVersionPolicySchema,
  type IosVersionPolicy,
} from './mobile-version-contracts'

const EnabledIosVersionEnvironmentSchema = z.object({
  minimumVersion: z.string(),
  latestVersion: z.string(),
  storeUrl: z.string(),
  message: z.string(),
})

export class MobileVersionConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MobileVersionConfigurationError'
  }
}

export function readIosVersionPolicy(
  environment: NodeJS.ProcessEnv = process.env,
): IosVersionPolicy {
  if (environment.IOS_VERSION_GATE_ENABLED !== 'true') {
    return { enabled: false, platform: 'ios' }
  }

  const minimumVersion = environment.IOS_MINIMUM_VERSION
  const parsedEnvironment = EnabledIosVersionEnvironmentSchema.safeParse({
    minimumVersion,
    latestVersion: environment.IOS_LATEST_VERSION ?? minimumVersion,
    storeUrl: environment.IOS_APP_STORE_URL,
    message: environment.IOS_UPDATE_MESSAGE
      ?? 'A newer version of HealthyFlow is required to continue.',
  })
  if (!parsedEnvironment.success) {
    throw new MobileVersionConfigurationError(
      'The enabled iOS version gate is missing required configuration.',
    )
  }

  const policy = EnabledIosVersionPolicySchema.safeParse({
    enabled: true,
    platform: 'ios',
    ...parsedEnvironment.data,
  })
  if (!policy.success) {
    throw new MobileVersionConfigurationError(
      `The enabled iOS version gate is invalid: ${policy.error.issues[0]?.message ?? 'unknown error'}`,
    )
  }
  if (compareMarketingVersions(policy.data.latestVersion, policy.data.minimumVersion) < 0) {
    throw new MobileVersionConfigurationError(
      'IOS_LATEST_VERSION cannot be lower than IOS_MINIMUM_VERSION.',
    )
  }

  return policy.data
}
