/**
 * Sending an email, and the two the app actually sends.
 *
 * One seam, so the delivery provider is a detail. Every test drives
 * `recordingMailSender`; nothing in a test run reaches Resend, and no test needs
 * a credential to be meaningful.
 *
 * A send that fails says so. It never resolves as though the mail went out —
 * a person waiting for a link that was never sent has no way to tell that from
 * a link that is merely slow, and support cannot tell them either.
 */
import { z } from 'zod'
import { logger } from './utils/logger'

export const MailMessageSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1),
}).strict()
export type MailMessage = z.infer<typeof MailMessageSchema>

export type MailSendResult =
  | { state: 'sent'; id: string }
  | { state: 'unavailable'; reason: string }

export interface MailSender {
  send(message: MailMessage): Promise<MailSendResult>
}

/** Where recovery mail comes from. Verified in Resend before it can send. */
export function mailFrom(): string {
  return process.env.MAIL_FROM || 'HealthyFlow <noreply@healthyflow.app>'
}

/** Where a verification or reset link points. */
export function appBaseUrl(): string {
  return (process.env.FRONTEND_URL || 'https://healthyflow.app').replace(/\/+$/, '')
}

/**
 * Resend, reached over its HTTP API rather than its SDK.
 *
 * One `fetch` against one documented endpoint, so the server carries no extra
 * dependency for two emails. The key is read per call: a deploy that sets it
 * without a restart still works, and nothing holds it in module scope.
 */
export function resendMailSender(): MailSender {
  return {
    async send(message: MailMessage): Promise<MailSendResult> {
      const key = process.env.RESEND_API_KEY
      if (!key) {
        return { state: 'unavailable', reason: 'No mail provider is configured.' }
      }

      const checked = MailMessageSchema.parse(message)
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: mailFrom(), ...checked }),
        })

        if (!response.ok) {
          // The provider's own message, never the key and never the body — the
          // body carries the link that is the whole secret.
          const detail = await response.text().catch(() => '')
          logger.error('[mail] provider refused', {
            status: response.status,
            detail: detail.slice(0, 300),
          })
          return { state: 'unavailable', reason: `Mail provider returned ${response.status}.` }
        }

        const body = await response.json() as { id?: string }
        return { state: 'sent', id: body.id ?? 'unknown' }
      } catch (error) {
        logger.error('[mail] provider unreachable:', error)
        return { state: 'unavailable', reason: 'Mail provider was unreachable.' }
      }
    },
  }
}

/** Captures messages instead of sending them. Every test uses this. */
export function recordingMailSender(
  outcome: MailSendResult = { state: 'sent', id: 'test-message' },
): MailSender & { sent: MailMessage[] } {
  const sent: MailMessage[] = []
  return {
    sent,
    async send(message: MailMessage): Promise<MailSendResult> {
      sent.push(MailMessageSchema.parse(message))
      return outcome
    },
  }
}

export function verificationEmail(link: string, name: string): Omit<MailMessage, 'to'> {
  return {
    subject: 'Confirm your email for HealthyFlow',
    text: [
      `Hi ${name},`,
      '',
      'Confirm this address so you can recover your account later:',
      link,
      '',
      'The link works once and expires in 24 hours.',
      'If you did not create a HealthyFlow account, you can ignore this.',
    ].join('\n'),
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      '<p>Confirm this address so you can recover your account later:</p>',
      `<p><a href="${escapeHtml(link)}">Confirm my email</a></p>`,
      '<p>The link works once and expires in 24 hours.</p>',
      '<p>If you did not create a HealthyFlow account, you can ignore this.</p>',
    ].join(''),
  }
}

export function passwordResetEmail(link: string, name: string): Omit<MailMessage, 'to'> {
  return {
    subject: 'Reset your HealthyFlow password',
    text: [
      `Hi ${name},`,
      '',
      'Choose a new password here:',
      link,
      '',
      'The link works once and expires in 1 hour.',
      'If you did not ask for this, nothing has changed and you can ignore it.',
    ].join('\n'),
    html: [
      `<p>Hi ${escapeHtml(name)},</p>`,
      '<p>Choose a new password here:</p>',
      `<p><a href="${escapeHtml(link)}">Reset my password</a></p>`,
      '<p>The link works once and expires in 1 hour.</p>',
      '<p>If you did not ask for this, nothing has changed and you can ignore it.</p>',
    ].join(''),
  }
}

/** A display name is user-supplied, and it is being put inside HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
