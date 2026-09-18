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
import { Resend } from 'resend'
import PostalMime from 'postal-mime'
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

const SUPPORT_ADDRESS = 'support@healthyflow.app'
const SUPPORT_RECIPIENTS = new Set([SUPPORT_ADDRESS, 'privacy@healthyflow.app'])
const FORWARD_HEADER = 'x-healthyflow-support-forward'
const ForwardConfigSchema = z.object({
  key: z.string().min(1),
  secret: z.string().regex(/^whsec_[A-Za-z0-9+/=]+$/),
  // A destination on our receiving domain could recursively forward to itself.
  to: z.string().email().refine((value) => !value.toLowerCase().endsWith('@healthyflow.app')),
})
const WebhookHeadersSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().regex(/^\d+$/),
  signature: z.string().min(1),
})
const ReceivedEventSchema = z.object({
  type: z.literal('email.received'),
  data: z.object({ email_id: z.string().uuid() }),
})
const ReceivedMailSchema = z.object({
  id: z.string().uuid(),
  received_for: z.array(z.string().email()).min(1),
  subject: z.string(),
  raw: z.object({ download_url: z.string().url().startsWith('https://') }),
})
const ForwardResultSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('forwarded'), id: z.string().min(1) }),
  z.object({ state: z.literal('ignored'), reason: z.enum(['event_type', 'recipient', 'already_forwarded']) }),
  z.object({ state: z.literal('invalid'), reason: z.enum(['signature', 'payload']) }),
  z.object({ state: z.literal('unavailable'), reason: z.enum(['configuration', 'provider']) }),
])
export type SupportForwardResult = z.infer<typeof ForwardResultSchema>

/**
 * Signed Resend notification -> the founder's configured support inbox.
 * No email content or private destination is persisted or logged by HealthyFlow.
 * The same received email ID always uses the same Resend idempotency key, so
 * ordinary webhook retries cannot send duplicate forwards (provider TTL: 24h).
 */
export async function forwardSupportMail(
  body: Buffer,
  headers: Partial<z.infer<typeof WebhookHeadersSchema>>,
): Promise<SupportForwardResult> {
  const config = ForwardConfigSchema.safeParse({
    key: process.env.RESEND_API_KEY,
    secret: process.env.RESEND_WEBHOOK_SECRET,
    to: process.env.SUPPORT_FORWARD_TO,
  })
  if (!config.success) return { state: 'unavailable', reason: 'configuration' }
  const checkedHeaders = WebhookHeadersSchema.safeParse(headers)
  if (!checkedHeaders.success || !Buffer.isBuffer(body)) {
    return { state: 'invalid', reason: 'signature' }
  }

  const resend = new Resend(config.data.key)
  let verified: unknown
  try {
    verified = resend.webhooks.verify({
      payload: body.toString('utf8'),
      headers: checkedHeaders.data,
      webhookSecret: config.data.secret,
    })
  } catch {
    return { state: 'invalid', reason: 'signature' }
  }
  const envelope = z.object({ type: z.string() }).safeParse(verified)
  if (!envelope.success) return { state: 'invalid', reason: 'payload' }
  if (envelope.data.type !== 'email.received') return { state: 'ignored', reason: 'event_type' }
  const event = ReceivedEventSchema.safeParse(verified)
  if (!event.success) return { state: 'invalid', reason: 'payload' }

  try {
    const received = await resend.emails.receiving.get(event.data.data.email_id)
    if (received.error) throw new Error('Received mail unavailable')
    const email = ReceivedMailSchema.parse(received.data)
    if (email.id !== event.data.data.email_id) throw new Error('Received mail ID mismatch')
    // Use SMTP envelope recipients, not the sender-controlled To header.
    if (!email.received_for.some((address) => SUPPORT_RECIPIENTS.has(address.toLowerCase()))) {
      return { state: 'ignored', reason: 'recipient' }
    }
    const raw = await fetch(email.raw.download_url, { signal: AbortSignal.timeout(15_000) })
    if (!raw.ok) throw new Error('Raw mail unavailable')
    const parsed = await PostalMime.parse(await raw.arrayBuffer(), { attachmentEncoding: 'base64' })
    if (parsed.headers.some((header) => header.key === FORWARD_HEADER)) {
      return { state: 'ignored', reason: 'already_forwarded' }
    }
    // The SDK forwarding shortcut drops Reply-To. Preserve it explicitly so
    // Reply in the destination inbox goes back to the person seeking support.
    const replyAddresses = parsed.replyTo?.length ? parsed.replyTo : parsed.from ? [parsed.from] : []
    const replyTo = z.array(z.string().email()).min(1).parse(
      replyAddresses.flatMap((address) => address.group ? address.group.map((entry) => entry.address) : [address.address]),
    )
    const result = await resend.emails.send({
      from: `HealthyFlow Support <${SUPPORT_ADDRESS}>`,
      to: config.data.to,
      replyTo,
      subject: email.subject,
      // A successfully parsed MIME message may contain only HTML/attachments.
      text: parsed.text ?? '',
      html: parsed.html,
      headers: { [FORWARD_HEADER]: event.data.data.email_id },
      attachments: parsed.attachments.map((attachment) => ({
        filename: attachment.filename ?? undefined,
        content: z.string().parse(attachment.content),
        contentType: attachment.mimeType,
        contentId: attachment.contentId?.replace(/^<|>$/g, ''),
      })),
    }, { idempotencyKey: `support-forward/${event.data.data.email_id}` })
    if (result.error) throw new Error('Forward refused')
    return ForwardResultSchema.parse({ state: 'forwarded', id: result.data?.id })
  } catch {
    // Provider errors and parsed content can contain private customer data.
    logger.error('[mail] support forwarding unavailable', { emailId: event.data.data.email_id })
    return { state: 'unavailable', reason: 'provider' }
  }
}
