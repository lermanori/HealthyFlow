import { z } from 'zod'
import { db } from './supabase-client'

const CloudSubscriptionSchema = z.object({
  active: z.boolean(),
}).passthrough()
const CloudAccountIdentitySchema = z.object({
  email: z.string().email().nullable(),
}).passthrough()

export const CloudAccessStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('active') }).strict(),
  z.object({ status: z.literal('inactive') }).strict(),
])
export type CloudAccessState = z.infer<typeof CloudAccessStateSchema>
export type ActiveCloudAccess = Extract<CloudAccessState, { status: 'active' }>

export class CloudNotActiveError extends Error {
  readonly reason = 'cloud_not_active' as const

  constructor() {
    super('Cloud is not active on this account.')
    this.name = 'CloudNotActiveError'
  }
}

export function isCloudNotActiveError(error: unknown): error is CloudNotActiveError {
  return error instanceof CloudNotActiveError
}

export const CloudAccess = {
  async read(userId: string): Promise<CloudAccessState> {
    const rawSubscription = await db.getUserCreditSubscription(userId)
    const subscription = rawSubscription == null
      ? null
      : CloudSubscriptionSchema.parse(rawSubscription)
    if (!subscription?.active) {
      return CloudAccessStateSchema.parse({ status: 'inactive' })
    }
    const account = CloudAccountIdentitySchema.parse(await db.getUserById(userId))
    return CloudAccessStateSchema.parse({
      status: account.email ? 'active' : 'inactive',
    })
  },

  async require(userId: string): Promise<ActiveCloudAccess> {
    const access = await this.read(userId)
    if (access.status !== 'active') throw new CloudNotActiveError()
    return access
  },
}
