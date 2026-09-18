import express from 'express'
import { forwardSupportMail } from '../mail'

export const mailRoutes = express.Router()

// Mounted before express.json: signature verification needs the exact bytes.
mailRoutes.post('/resend', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  const result = await forwardSupportMail(req.body, {
    id: req.get('svix-id'),
    timestamp: req.get('svix-timestamp'),
    signature: req.get('svix-signature'),
  })
  const status = result.state === 'unavailable' ? 503 : result.state === 'invalid' ? 400 : 200
  return res.status(status).json(result)
})
