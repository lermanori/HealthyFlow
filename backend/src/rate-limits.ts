// Entry rate limits, per client network address. One definition, used by the
// routes that enforce them and by Admin's Guards panel that shows them (#307),
// so the two can never disagree.
export const AUTH_RATE_LIMITS = {
  guestStart: { max: 5, windowMinutes: 15 },
  signup: { max: 5, windowMinutes: 15 },
  providerSignIn: { max: 20, windowMinutes: 15 },
  recoveryRequest: { max: 5, windowMinutes: 15 },
  recoveryRedeem: { max: 20, windowMinutes: 15 },
  accountDelete: { max: 5, windowMinutes: 15 },
} as const

export const windowMs = (limit: { windowMinutes: number }) => limit.windowMinutes * 60 * 1000
