import express from 'express'
import { logger } from '../utils/logger'
import {
  MobileVersionConfigurationError,
  readIosVersionPolicy,
} from '../mobile-version'

const router = express.Router()

router.get('/version/ios', (_req, res) => {
  try {
    res.set('Cache-Control', 'no-store')
    return res.json(readIosVersionPolicy())
  } catch (error) {
    if (error instanceof MobileVersionConfigurationError) {
      logger.error('[mobile-version] invalid iOS version policy:', error.message)
      return res.status(503).json({ error: 'iOS version policy is unavailable' })
    }
    throw error
  }
})

export const mobileRoutes = router
