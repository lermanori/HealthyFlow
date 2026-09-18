import { createHmac } from 'node:crypto'
import request from 'supertest'
import { app } from '../src/index'

const emailId = 'b48d72f7-0105-4b6f-a56b-8b2795c58012'
const signingKey = Buffer.from('synthetic-support-webhook-test-key')
const secret = `whsec_${signingKey.toString('base64')}`
const originalEnv = { ...process.env }
const event = { type: 'email.received', data: { email_id: emailId } }
const rawMail = [
  'From: Customer <customer@example.com>',
  'To: support@healthyflow.app',
  'Reply-To: replies@example.com',
  'Subject: Help with my day',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="support-test"',
  '',
  '--support-test',
  'Content-Type: text/plain; charset=UTF-8',
  '',
  'Please help with my day.',
  '--support-test',
  'Content-Type: image/png',
  'Content-Disposition: inline; filename="screenshot.png"',
  'Content-ID: <image-1>',
  'Content-Transfer-Encoding: base64',
  '',
  'c3ludGhldGljLWltYWdl',
  '--support-test--',
  '',
].join('\r\n')

let fetchMock: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>

function signedPost(body = JSON.stringify(event), timestamp = Math.floor(Date.now() / 1000)) {
  const id = 'msg_synthetic_support'
  const signature = createHmac('sha256', signingKey).update(`${id}.${timestamp}.${body}`).digest('base64')
  return request(app).post('/api/mail/resend')
    .set('Content-Type', 'application/json')
    .set('svix-id', id)
    .set('svix-timestamp', String(timestamp))
    .set('svix-signature', `v1,${signature}`)
    .send(body)
}

function receivingResponse(recipients = ['support@healthyflow.app'], overrides = {}) {
  return Response.json({
    id: emailId,
    // Deliberately different from received_for: only the envelope controls routing.
    to: ['support@healthyflow.app'],
    received_for: recipients,
    subject: 'Help with my day',
    raw: { download_url: 'https://mail-content.example.test/original.eml' },
    ...overrides,
  })
}

function successResponses(mime = rawMail, recipients?: string[]) {
  fetchMock.mockResolvedValueOnce(receivingResponse(recipients))
    .mockResolvedValueOnce(new Response(mime))
    .mockResolvedValueOnce(Response.json({ id: 'forwarded-email' }))
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 'synthetic-resend-key'
  process.env.RESEND_WEBHOOK_SECRET = secret
  process.env.SUPPORT_FORWARD_TO = 'owner@example.net'
  fetchMock = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'))
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  for (const name of ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'SUPPORT_FORWARD_TO']) {
    if (originalEnv[name] === undefined) delete process.env[name]
    else process.env[name] = originalEnv[name]
  }
  jest.restoreAllMocks()
})

it('verifies the raw bytes and forwards the body, attachment and customer reply address', async () => {
  successResponses()
  const response = await signedPost(JSON.stringify(event, null, 2))
  expect(response.status).toBe(200)
  expect(response.body).toEqual({ state: 'forwarded', id: 'forwarded-email' })
  const [url, options] = fetchMock.mock.calls[2]
  expect(url).toBe('https://api.resend.com/emails')
  expect(JSON.parse(String(options?.body))).toMatchObject({
    from: 'HealthyFlow Support <support@healthyflow.app>',
    to: 'owner@example.net',
    reply_to: ['replies@example.com'],
    subject: 'Help with my day',
    text: 'Please help with my day.\n',
    headers: { 'x-healthyflow-support-forward': emailId },
    attachments: [{ filename: 'screenshot.png', content: 'c3ludGhldGljLWltYWdl', content_type: 'image/png', content_id: 'image-1' }],
  })
  expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(`support-forward/${emailId}`)
})

it('uses From for replies when the customer supplied no Reply-To', async () => {
  successResponses(rawMail.replace('Reply-To: replies@example.com\r\n', ''))
  expect((await signedPost()).status).toBe(200)
  expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).reply_to).toEqual(['customer@example.com'])
})

it('accepts the previously published privacy alias', async () => {
  successResponses(rawMail, ['privacy@healthyflow.app'])
  expect((await signedPost()).body.state).toBe('forwarded')
})

it.each(['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'SUPPORT_FORWARD_TO'])('returns 503 when %s is missing', async (name) => {
  delete process.env[name]
  expect((await signedPost()).status).toBe(503)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('refuses a destination that would route mail back into the receiving domain', async () => {
  process.env.SUPPORT_FORWARD_TO = 'support@healthyflow.app'
  expect((await signedPost()).body).toEqual({ state: 'unavailable', reason: 'configuration' })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects unsigned, tampered and stale webhook requests before accessing email', async () => {
  const unsigned = await request(app).post('/api/mail/resend').send(event)
  expect(unsigned.status).toBe(400)
  const tampered = await signedPost().set('svix-signature', 'v1,bogus')
  expect(tampered.status).toBe(400)
  const stale = await signedPost(undefined, Math.floor(Date.now() / 1000) - 600)
  expect(stale.status).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('acknowledges other event types without fetching or forwarding anything', async () => {
  const response = await signedPost(JSON.stringify({ type: 'email.sent' }))
  expect(response.body).toEqual({ state: 'ignored', reason: 'event_type' })
  expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects malformed signed payloads', async () => {
  expect((await signedPost(JSON.stringify({ type: 'email.received', data: { email_id: '../other' } }))).status).toBe(400)
  expect(fetchMock).not.toHaveBeenCalled()
})

it('routes only SMTP recipients, ignoring a forged support To header on other mail', async () => {
  fetchMock.mockResolvedValueOnce(receivingResponse(['unrelated@example.org']))
  const response = await signedPost()
  expect(response.body).toEqual({ state: 'ignored', reason: 'recipient' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('does not forward its own marked output again', async () => {
  fetchMock.mockResolvedValueOnce(receivingResponse())
    .mockResolvedValueOnce(new Response(`X-HealthyFlow-Support-Forward: prior-id\r\n${rawMail}`))
  expect((await signedPost()).body).toEqual({ state: 'ignored', reason: 'already_forwarded' })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('reuses the same idempotency key when Resend retries an event', async () => {
  successResponses()
  successResponses()
  await signedPost()
  await signedPost()
  const keys = [2, 5].map((index) => new Headers(fetchMock.mock.calls[index][1]?.headers).get('Idempotency-Key'))
  expect(keys).toEqual([`support-forward/${emailId}`, `support-forward/${emailId}`])
})

it.each(['lookup', 'raw', 'send', 'malformed_success'])('returns retryable 503 for %s failures without logging mail content', async (stage) => {
  if (stage === 'lookup') fetchMock.mockResolvedValueOnce(Response.json({ message: 'private upstream error' }, { status: 500 }))
  else {
    fetchMock.mockResolvedValueOnce(receivingResponse())
      .mockResolvedValueOnce(new Response(rawMail, { status: stage === 'raw' ? 503 : 200 }))
    if (stage === 'send') fetchMock.mockResolvedValueOnce(Response.json({ message: 'private upstream error' }, { status: 500 }))
    if (stage === 'malformed_success') fetchMock.mockResolvedValueOnce(Response.json({}))
  }
  const response = await signedPost()
  expect(response.status).toBe(503)
  expect(response.body).toEqual({ state: 'unavailable', reason: 'provider' })
  expect(JSON.stringify(response.body)).not.toContain('customer@example.com')
})
