import express from 'express'
import { z } from 'zod'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import {
  completeGoogleCalendarOAuth,
  disconnectGoogleCalendar,
  getCalendarOAuthReturnUrl,
  getGoogleCalendarConnectUrl,
  getGoogleCalendarStatus,
  isGoogleCalendarNotConnectedError,
  syncTimedTasksForDate,
  syncGoogleCalendarEventsForDate,
  updateExternalCalendarEventCompletion,
  updateExternalCalendarEventSchedule,
} from '../calendar'

const router = express.Router()
const ClientTimeZone = z.string().min(1).max(100).optional()
const ScheduleUpdateBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  timeZone: ClientTimeZone,
})

function clientTimeZone(req: AuthRequest, bodyTimeZone?: string): string | undefined {
  const headerTimeZone = req.header('x-client-time-zone')
  return bodyTimeZone || (headerTimeZone && headerTimeZone.length <= 100 ? headerTimeZone : undefined)
}

router.get('/google/connect-url', authenticateToken, (req: AuthRequest, res) => {
  try {
    res.json({ url: getGoogleCalendarConnectUrl(req.user.userId) })
  } catch (error) {
    console.error('Google Calendar connect URL error:', error)
    res.status(500).json({ error: 'Failed to start Google Calendar connection' })
  }
})

router.get('/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : null
  const state = typeof req.query.state === 'string' ? req.query.state : null
  const oauthError = typeof req.query.error === 'string' ? req.query.error : null

  if (oauthError) {
    return res.redirect(getCalendarOAuthReturnUrl('error', oauthError))
  }

  if (!code || !state) {
    return res.redirect(getCalendarOAuthReturnUrl('error', 'Missing Google OAuth callback data'))
  }

  try {
    await completeGoogleCalendarOAuth(code, state)
    return res.redirect(getCalendarOAuthReturnUrl('connected'))
  } catch (error) {
    console.error('Google Calendar OAuth callback error:', error)
    return res.redirect(getCalendarOAuthReturnUrl('error', 'Google Calendar connection failed'))
  }
})

router.get('/google/status', authenticateToken, async (req: AuthRequest, res) => {
  try {
    res.json(await getGoogleCalendarStatus(req.user.userId))
  } catch (error) {
    console.error('Google Calendar status error:', error)
    res.status(500).json({ error: 'Failed to load Google Calendar status' })
  }
})

router.get('/google/events', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  try {
    res.json(await syncGoogleCalendarEventsForDate(req.user.userId, parsed.data.date))
  } catch (error) {
    if (isGoogleCalendarNotConnectedError(error)) {
      return res.json([])
    }
    console.error('Google Calendar events error:', error)
    res.status(500).json({ error: 'Failed to load Google Calendar events' })
  }
})

router.patch('/google/events/:id/completion', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = z.object({ completed: z.boolean() }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'completed must be a boolean' })
  }

  try {
    res.json(await updateExternalCalendarEventCompletion(
      req.user.userId,
      req.params.id,
      parsed.data.completed
    ))
  } catch (error) {
    console.error('Google Calendar event completion error:', error)
    res.status(500).json({ error: 'Failed to update calendar event completion' })
  }
})

router.patch('/google/events/:id/schedule', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ScheduleUpdateBody.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD and startTime must be HH:MM' })
  }

  try {
    res.json(await updateExternalCalendarEventSchedule(
      req.user.userId,
      req.params.id,
      {
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        timeZone: clientTimeZone(req, parsed.data.timeZone),
      }
    ))
  } catch (error) {
    console.error('Google Calendar event schedule error:', error)
    res.status(500).json({ error: 'Failed to update calendar event schedule' })
  }
})

router.post('/google/sync-timed-tasks', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: ClientTimeZone,
  }).safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' })
  }

  try {
    res.json(await syncTimedTasksForDate(
      req.user.userId,
      parsed.data.date,
      clientTimeZone(req, parsed.data.timeZone)
    ))
  } catch (error) {
    console.error('Google Calendar timed task sync error:', error)
    res.status(500).json({ error: 'Failed to sync timed tasks to Google Calendar' })
  }
})

router.delete('/google/disconnect', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await disconnectGoogleCalendar(req.user.userId)
    res.status(204).send()
  } catch (error) {
    console.error('Google Calendar disconnect error:', error)
    res.status(500).json({ error: 'Failed to disconnect Google Calendar' })
  }
})

export { router as calendarRoutes }
