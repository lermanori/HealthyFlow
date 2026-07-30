import { z } from 'zod'

export const AppMarketingVersionSchema = z.string()
  .trim()
  .regex(/^\d+(?:\.\d+){0,3}$/, 'Version must contain one to four numeric components')

const DisabledIosVersionPolicySchema = z.object({
  enabled: z.literal(false),
  platform: z.literal('ios'),
}).strict()

export const EnabledIosVersionPolicySchema = z.object({
  enabled: z.literal(true),
  platform: z.literal('ios'),
  minimumVersion: AppMarketingVersionSchema,
  latestVersion: AppMarketingVersionSchema,
  storeUrl: z.string().url().refine(
    (value) => new URL(value).protocol === 'https:' && new URL(value).hostname === 'apps.apple.com',
    'Store URL must be an HTTPS apps.apple.com URL',
  ),
  message: z.string().trim().min(1).max(240),
}).strict()

export const IosVersionPolicySchema = z.discriminatedUnion('enabled', [
  DisabledIosVersionPolicySchema,
  EnabledIosVersionPolicySchema,
])

export type EnabledIosVersionPolicy = z.infer<typeof EnabledIosVersionPolicySchema>
export type IosVersionPolicy = z.infer<typeof IosVersionPolicySchema>

function numericVersionParts(version: string) {
  return AppMarketingVersionSchema.parse(version)
    .split('.')
    .map(Number)
}

export function compareMarketingVersions(left: string, right: string): number {
  const leftParts = numericVersionParts(left)
  const rightParts = numericVersionParts(right)
  const width = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < width; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

const MobileVersionContracts = {
  AppMarketingVersionSchema,
  EnabledIosVersionPolicySchema,
  IosVersionPolicySchema,
  compareMarketingVersions,
}

export default MobileVersionContracts
