import { z } from 'zod'

export const NativePushRegistrationSchema = z.object({
  platform: z.literal('ios'),
  deviceToken: z.string().min(32).max(512).regex(/^[a-fA-F0-9]+$/),
  appId: z.literal('app.healthyflow.mobile'),
})

export type NativePushRegistration = z.infer<typeof NativePushRegistrationSchema>
