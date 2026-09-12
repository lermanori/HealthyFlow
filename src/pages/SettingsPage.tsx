import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, Loader2, Settings, Bell, FolderSync as Sync, User, Shield, ShieldCheck, Smartphone, Unplug, Sparkles, Mail, Copy, X, KeyRound, Trash2, HeartPulse } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { useCredits } from '../hooks/useCredits'
import { useSettings, applyTheme } from '../hooks/useSettings'
import toast from 'react-hot-toast'
import api, { accountService, ApiTokenRecord, ApiTokenScope, AssistantProfile, calendarService, CalendarConnectionStatus, connectionsService, contactMessagesService, DAILY_SIGNALS_QUERY_KEY, DailyTouchpointRhythm, DAY_SUMMARY_QUERY_KEY, McpOAuthGrant, pushService, rhythmService, TouchpointType, UserRhythm, UserRhythmPatch, UserSettings, WeeklyTouchpointRhythm } from '../services/api'
import { enablePush } from '../lib/push'
import { analytics } from '../lib/analytics'
import {
  canUseHostedGoogleCalendar,
  deviceCalendarService,
  type DeviceCalendarAuthorization,
} from '../lib/deviceCalendar'
import { calendarPathDiagnosis, calendarPathReasons } from '../lib/local/calendarPathDiagnostics'
import { localDayUser, rememberedLocalDayOwner } from '../lib/local/services'
import { isNativeIOS, openNativeBrowser } from '../lib/native'
import { AssistantProfileSchema, DEFAULT_PLANNING_WINDOW } from '../../backend/src/settings-schema'
import { actionExhaustionView } from '../utils/actionExhaustion'
import Switch from '../components/Switch'
import DeleteAccountDialog from '../components/DeleteAccountDialog'
import { MODULE_PRESENTATIONS } from '../modulePresentation'
import {
  SETTINGS_CATEGORIES,
  parseSettingsCategory,
  type SettingsCategoryId,
} from '../settingsPresentation'

function mcpEndpoint() {
  const apiBase = api.defaults.baseURL ?? 'http://localhost:3001/api'
  return apiBase.replace(/\/api\/?$/, '/mcp')
}

type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6
type DailyTouchpointType = 'morning' | 'midday'

const dayOptions: Array<{ value: DayIndex; label: string }> = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
]

const settingsCategoryIcon = {
  user: User,
  calendar: CalendarDays,
  bell: Bell,
  health: HeartPulse,
  appearance: Sparkles,
  connection: KeyRound,
  shield: Shield,
}

const touchpointCopy: Record<TouchpointType, { label: string; description: string }> = {
  morning: {
    label: 'Morning planning',
    description: 'Start the day with a planning kickoff.',
  },
  midday: {
    label: 'Mid-day check-in',
    description: 'Re-plan the rest of today while there is still room to adjust.',
  },
  weekly: {
    label: 'Weekly planning',
    description: 'Shape the coming week from your current context.',
  },
}

function mergeRhythm(current: UserRhythm, patch: UserRhythmPatch): UserRhythm {
  return {
    ...current,
    ...patch,
    morning: patch.morning ? { ...current.morning, ...patch.morning } : current.morning,
    midday: patch.midday ? { ...current.midday, ...patch.midday } : current.midday,
    weekly: patch.weekly ? { ...current.weekly, ...patch.weekly } : current.weekly,
  }
}

function AssistantProfileEditor({
  profile,
  onSave,
}: {
  profile: AssistantProfile
  onSave: (profile: AssistantProfile) => void
}) {
  const [draft, setDraft] = useState(profile)

  useEffect(() => {
    setDraft(profile)
  }, [profile])

  const commit = (candidate: AssistantProfile) => {
    const parsed = AssistantProfileSchema.safeParse(candidate)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Assistant preferences are invalid')
      return
    }
    setDraft(parsed.data)
    onSave(parsed.data)
  }

  const choose = <K extends 'responseStyle' | 'planningStyle' | 'followUpMode'>(
    key: K,
    value: AssistantProfile[K],
  ) => {
    const next = { ...draft, [key]: value }
    setDraft(next)
    commit(next)
  }

  return (
    <div className="card">
      <div className="mb-5 flex items-start space-x-3">
        <Sparkles className="mt-0.5 h-5 w-5 flex-none text-accent" />
        <div>
          <h2 className="text-lg font-semibold text-ink">Personal assistant</h2>
          <p className="text-sm text-ink-muted">
            Settings control how Talk works with you. Bigger direction belongs in Goals, while actual plans and outcomes remain in their owning modules.
          </p>
        </div>
      </div>

      <div className="grid gap-5">
        <label className="grid gap-1.5 text-sm text-ink-muted">
          What should Talk call you?
          <input
            type="text"
            value={draft.preferredName ?? ''}
            maxLength={80}
            placeholder="Use my account name"
            className="input-field min-h-11"
            onChange={(event) => setDraft({ ...draft, preferredName: event.target.value || null })}
            onBlur={() => commit({ ...draft, preferredName: draft.preferredName?.trim() || null })}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1.5 text-sm text-ink-muted">
            Response detail
            <select
              className="input-field min-h-11"
              value={draft.responseStyle}
              onChange={(event) => choose('responseStyle', event.target.value as AssistantProfile['responseStyle'])}
            >
              <option value="concise">Concise</option>
              <option value="balanced">Balanced</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm text-ink-muted">
            Planning approach
            <select
              className="input-field min-h-11"
              value={draft.planningStyle}
              onChange={(event) => choose('planningStyle', event.target.value as AssistantProfile['planningStyle'])}
            >
              <option value="one_step_at_a_time">One step at a time</option>
              <option value="guided">Guided</option>
              <option value="direct">Direct</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-sm text-ink-muted">
            Follow up
            <select
              className="input-field min-h-11"
              value={draft.followUpMode}
              onChange={(event) => choose('followUpMode', event.target.value as AssistantProfile['followUpMode'])}
            >
              <option value="ask_about_outcomes">Ask what happened</option>
              <option value="only_when_asked">Only when I ask</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1.5 text-sm text-ink-muted">
          About your day
          <textarea
            rows={5}
            maxLength={2000}
            value={draft.dayContext ?? ''}
            className="input-field w-full"
            onChange={(event) => setDraft({ ...draft, dayContext: event.target.value || null })}
            onBlur={() => commit({ ...draft, dayContext: draft.dayContext?.trim() || null })}
          />
          <span className="text-xs text-ink-muted">
            Background HealthyFlow reads when it helps you plan. Yours to edit or clear.
          </span>
        </label>

        <div className="flex flex-col gap-3 rounded-lg border border-line/70 bg-sunken/25 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-ink">Bigger direction</h3>
            <p className="text-sm text-ink-muted">Manage free-speech direction per module in Goals.</p>
          </div>
          <Link to="/goals" className="btn-secondary inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm">
            Open Goals
          </Link>
        </div>

        <Link to="/day-setup" className="btn-secondary inline-flex min-h-11 items-center justify-center px-4 text-sm">
          Run day setup again
        </Link>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, completeAccountDeletion } = useAuth()
  const { permission, requestPermission } = useNotifications()
  const {
    balance,
    summary: creditSummary,
    isLoading: creditsLoading,
    isUnavailable: creditsUnavailable,
  } = useCredits()
  const exhaustion = creditSummary ? actionExhaustionView(creditSummary) : null
  const { settings, updateSetting, resolution, retry: retrySettings } = useSettings()
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState<CalendarConnectionStatus | null>(null)
  const [deviceCalendarAuthorization, setDeviceCalendarAuthorization] = useState<DeviceCalendarAuthorization | null>(null)
  const [googleCalendarUnavailable, setGoogleCalendarUnavailable] = useState<string | null>(null)
  const [deviceCalendarUnavailable, setDeviceCalendarUnavailable] = useState<string | null>(null)
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false)
  const [deviceCalendarLoading, setDeviceCalendarLoading] = useState(isNativeIOS)
  const [googleCalendarActionLoading, setGoogleCalendarActionLoading] = useState(false)
  const [deviceCalendarActionLoading, setDeviceCalendarActionLoading] = useState(false)
  const calendarPath = calendarPathDiagnosis({
    isNativeIOS,
    user: user ? { id: user.id, email: user.email } : null,
    dayUserId: localDayUser(),
    rememberedOwnerId: rememberedLocalDayOwner(),
    calendarAuthorization: deviceCalendarAuthorization?.status ?? 'not_determined',
  })
  const [contactFlow, setContactFlow] = useState<'feedback' | 'more_actions' | null>(null)
  const [contactMessage, setContactMessage] = useState('')
  const [contactReplyTo, setContactReplyTo] = useState('')
  const openContactFlow = (kind: 'feedback' | 'more_actions') => {
    analytics.capture('founders_club_opened', { kind })
    setContactMessage(
      kind === 'more_actions'
        ? 'I would like to request more free AI actions.'
        : '',
    )
    setContactReplyTo('')
    setContactFlow(kind)
  }
  const [apiTokens, setApiTokens] = useState<ApiTokenRecord[]>([])
  const [oauthGrants, setOAuthGrants] = useState<McpOAuthGrant[]>([])
  const [newToken, setNewToken] = useState('')
  const [newTokenScopes, setNewTokenScopes] = useState<ApiTokenScope[]>([])
  const [tokenName, setTokenName] = useState('MCP connection')
  const [selectedScopes, setSelectedScopes] = useState<ApiTokenScope[]>(['hf:read'])
  const [rhythm, setRhythm] = useState<UserRhythm | null>(null)
  const [rhythmLoading, setRhythmLoading] = useState(true)
  const [rhythmSaving, setRhythmSaving] = useState<TouchpointType | 'timezone' | null>(null)
  const [exportingAccount, setExportingAccount] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const requestedCategory = parseSettingsCategory(location.pathname)
  const activeCategory: SettingsCategoryId = requestedCategory ?? 'account-billing'
  const googleCalendarEligible = canUseHostedGoogleCalendar({
    claimed: Boolean(user?.email),
    cloudActive: Boolean(creditSummary?.subscription.active),
    surfaceEnabled: !isNativeIOS,
  })

  useEffect(() => {
    if (location.pathname !== '/settings' && requestedCategory === null) {
      navigate('/settings', { replace: true })
      return
    }
    if (location.pathname === '/settings' && location.hash === '#features') {
      navigate('/settings/health-tools', { replace: true })
    }
  }, [location.hash, location.pathname, navigate, requestedCategory])

  const loadRhythm = async () => {
    try {
      setRhythmLoading(true)
      const next = await rhythmService.getRhythm()
      const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (next.timezone === 'UTC' && deviceTimezone && deviceTimezone !== 'UTC') {
        const patched = { ...next, timezone: deviceTimezone }
        setRhythm(patched)
        rhythmService.updateRhythm({ timezone: deviceTimezone }).catch(() => undefined)
      } else {
        setRhythm(next)
      }
    } catch {
      toast.error('Failed to load planning rhythm')
    } finally {
      setRhythmLoading(false)
    }
  }

  const loadDeviceCalendarStatus = useCallback(async () => {
    if (!isNativeIOS) return
    try {
      setDeviceCalendarLoading(true)
      setDeviceCalendarUnavailable(null)
      setDeviceCalendarAuthorization(await deviceCalendarService.authorization())
    } catch (e) {
      setDeviceCalendarUnavailable(e instanceof Error ? e.message : 'Device Calendar status is unavailable.')
      toast.error('Failed to load Device Calendar status')
    } finally {
      setDeviceCalendarLoading(false)
    }
  }, [])

  const loadGoogleCalendarStatus = useCallback(async () => {
    if (!googleCalendarEligible) {
      setGoogleCalendarStatus(null)
      setGoogleCalendarUnavailable(null)
      setGoogleCalendarLoading(false)
      return
    }
    try {
      setGoogleCalendarLoading(true)
      setGoogleCalendarUnavailable(null)
      setGoogleCalendarStatus(await calendarService.getGoogleStatus())
    } catch (e) {
      setGoogleCalendarUnavailable(e instanceof Error ? e.message : 'Google Calendar status is unavailable.')
      toast.error('Failed to load Google Calendar status')
    } finally {
      setGoogleCalendarLoading(false)
    }
  }, [googleCalendarEligible])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const calendarResult = params.get('calendar')
    const message = params.get('message')

    if (calendarResult === 'connected') {
      analytics.capture('google_calendar_connected')
      toast.success('Google Calendar connected')
      calendarService.invalidateGoogleAccess()
      void loadGoogleCalendarStatus()
    }

    if (calendarResult === 'error') {
      toast.error(message || 'Google Calendar connection failed')
    }

    if (calendarResult) {
      navigate('/settings/connections-advanced', { replace: true })
    }
  }, [loadGoogleCalendarStatus, location.search, navigate])

  useEffect(() => {
    if (!isNativeIOS) return
    const refreshPermissionWhenActive = (event: Event) => {
      const detail = (event as CustomEvent<{ isActive?: boolean }>).detail
      if (detail?.isActive) {
        void loadDeviceCalendarStatus()
        void loadGoogleCalendarStatus()
      }
    }
    window.addEventListener('healthyflow:app-state', refreshPermissionWhenActive)
    return () => window.removeEventListener('healthyflow:app-state', refreshPermissionWhenActive)
  }, [loadDeviceCalendarStatus, loadGoogleCalendarStatus])

  useEffect(() => {
    void loadDeviceCalendarStatus()
    void loadGoogleCalendarStatus()
    loadApiTokens()
    loadOAuthGrants()
    loadRhythm()
  }, [loadDeviceCalendarStatus, loadGoogleCalendarStatus])

  const invalidateCalendarDay = () => {
    queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
    queryClient.invalidateQueries({ queryKey: DAILY_SIGNALS_QUERY_KEY })
  }

  const handleConnectDeviceCalendar = async () => {
    try {
      setDeviceCalendarActionLoading(true)
      setDeviceCalendarUnavailable(null)
      const authorization = await deviceCalendarService.requestFullAccess()
      setDeviceCalendarAuthorization(authorization)
      if (authorization.status === 'full_access') {
        invalidateCalendarDay()
        toast.success('Device Calendar connected')
      }
    } catch (e) {
      setDeviceCalendarUnavailable(e instanceof Error ? e.message : 'Device Calendar connection is unavailable.')
      toast.error('Failed to connect Device Calendar')
    } finally {
      setDeviceCalendarActionLoading(false)
    }
  }

  const handleOpenDeviceCalendarSettings = async () => {
    try {
      setDeviceCalendarActionLoading(true)
      await deviceCalendarService.openSettings()
    } catch (e) {
      setDeviceCalendarUnavailable(e instanceof Error ? e.message : 'iOS Settings is unavailable.')
      toast.error('Failed to open iOS Settings')
    } finally {
      setDeviceCalendarActionLoading(false)
    }
  }

  const handleConnectGoogleCalendar = async () => {
    try {
      setGoogleCalendarActionLoading(true)
      setGoogleCalendarUnavailable(null)
      const url = await calendarService.getGoogleConnectUrl()
      await openNativeBrowser(url)
    } catch (e) {
      toast.error('Failed to start Google Calendar connection')
      setGoogleCalendarUnavailable(e instanceof Error ? e.message : 'Google Calendar connection is unavailable.')
    } finally {
      setGoogleCalendarActionLoading(false)
    }
  }

  const handleDisconnectGoogleCalendar = async () => {
    try {
      setGoogleCalendarActionLoading(true)
      await calendarService.disconnectGoogle()
      invalidateCalendarDay()
      toast.success('Google Calendar disconnected')
      await loadGoogleCalendarStatus()
    } catch (e) {
      toast.error('Failed to disconnect Google Calendar')
      setGoogleCalendarUnavailable(e instanceof Error ? e.message : 'Google Calendar disconnect failed.')
    } finally {
      setGoogleCalendarActionLoading(false)
    }
  }

  const loadApiTokens = async () => {
    try {
      setApiTokens(await connectionsService.listTokens())
    } catch (e) {
      toast.error('Failed to load connections')
    }
  }

  const loadOAuthGrants = async () => {
    try {
      setOAuthGrants(await connectionsService.listOAuthGrants())
    } catch {
      toast.error('Failed to load ChatGPT connections')
    }
  }

  const createTokenMutation = useMutation({
    mutationFn: () => connectionsService.createToken({ name: tokenName, scopes: selectedScopes }),
    onSuccess: async (created) => {
      setNewToken(created.token)
      setNewTokenScopes(created.record.scopes)
      setTokenName('MCP connection')
      setSelectedScopes(['hf:read'])
      await loadApiTokens()
      toast.success('Token created')
    },
    onError: () => toast.error('Failed to create token'),
  })

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => connectionsService.revokeToken(tokenId),
    onSuccess: async () => {
      await loadApiTokens()
      toast.success('Token revoked')
    },
    onError: () => toast.error('Failed to revoke token'),
  })

  const revokeOAuthGrantMutation = useMutation({
    mutationFn: (grantId: string) => connectionsService.revokeOAuthGrant(grantId),
    onSuccess: async () => {
      await loadOAuthGrants()
      toast.success('ChatGPT connection revoked')
    },
    onError: () => toast.error('Failed to revoke ChatGPT connection'),
  })

  const toggleScope = (scope: ApiTokenScope) => {
    setSelectedScopes((current) => {
      if (scope === 'hf:read') return current.includes(scope) ? current : [...current, scope]
      return current.includes(scope)
        ? current.filter((value) => value !== scope)
        : [...current, scope]
    })
  }

  const handleSettingChange = (key: keyof UserSettings, value: boolean) => {
    updateSetting(key, value)
    toast.success('Settings updated')
  }

  const handleWeekStartChange = (value: UserSettings['weekStartsOn']) => {
    updateSetting('weekStartsOn', value)
    toast.success('Settings updated')
  }

  const handleThemeChange = (theme: UserSettings['theme']) => {
    applyTheme(theme) // apply instantly; persistence follows
    updateSetting('theme', theme)
    toast.success('Settings updated')
  }

  const handlePlanningWindowToggle = (enabled: boolean) => {
    // Re-enabling restores the same window a new account starts with, so the
    // toggle and the schema default cannot drift apart.
    updateSetting('planningWindow', enabled ? DEFAULT_PLANNING_WINDOW : null)
    toast.success(enabled ? 'Usable day window enabled' : 'Capacity calculation disabled')
  }

  const handlePlanningWindowChange = (
    key: 'startTime' | 'endTime' | 'transitionBufferMinutes',
    value: string | number
  ) => {
    if (!settings?.planningWindow) return
    const next = { ...settings.planningWindow, [key]: value }
    if (next.startTime >= next.endTime) {
      toast.error('End time must be after start time')
      return
    }
    updateSetting('planningWindow', next)
  }

  const handleNotificationPermission = async () => {
    const granted = permission.granted || await requestPermission()
    if (!granted) {
      toast.error('Notifications permission denied')
      return
    }
    const subscribed = await enablePush()
    if (subscribed) {
      toast.success('Notifications enabled!')
    } else {
      toast.error('Could not enable push notifications on this device')
    }
  }

  const handleTestNotification = async () => {
    const ok = await enablePush()
    if (!ok) {
      toast.error('Enable notifications first (install to Home Screen on iPhone).')
      return
    }
    try {
      await pushService.sendTest()
      toast.success('Test notification sent — check your device.')
    } catch {
      toast.error('Could not send test notification.')
    }
  }

  const updateRhythm = async (patch: UserRhythmPatch, savingKey: TouchpointType | 'timezone') => {
    if (!rhythm) return
    const previous = rhythm
    const optimistic = mergeRhythm(rhythm, patch)
    setRhythm(optimistic)
    setRhythmSaving(savingKey)
    try {
      const updated = await rhythmService.updateRhythm(patch)
      setRhythm(updated)
      toast.success('Planning rhythm updated')
    } catch {
      setRhythm(previous)
      toast.error('Could not update planning rhythm')
    } finally {
      setRhythmSaving(null)
    }
  }

  const updateDailyTouchpoint = (type: DailyTouchpointType, patch: Partial<DailyTouchpointRhythm>) => {
    if (!rhythm) return
    updateRhythm({ [type]: { ...rhythm[type], ...patch } } as UserRhythmPatch, type)
  }

  const updateWeeklyTouchpoint = (patch: Partial<WeeklyTouchpointRhythm>) => {
    if (!rhythm) return
    updateRhythm({ weekly: { ...rhythm.weekly, ...patch } }, 'weekly')
  }

  const toggleDailyDay = (type: DailyTouchpointType, day: DayIndex) => {
    if (!rhythm) return
    const currentDays = rhythm[type].days
    const nextDays = currentDays.includes(day)
      ? currentDays.filter((value) => value !== day)
      : [...currentDays, day].sort((a, b) => a - b)
    updateDailyTouchpoint(type, { days: nextDays as DayIndex[] })
  }

  const startKickoff = (type: TouchpointType) => {
    navigate(`/talk?kickoff=${type}`)
  }

  const connectionPrompt = newToken
    ? `Connect HealthyFlow as an MCP server.

Transport: Streamable HTTP
URL: ${mcpEndpoint()}
Authorization: Bearer ${newToken}

This token is scoped for: ${newTokenScopes.join(', ')}

After connecting, use HealthyFlow tools to read my Tasks, Habit instances, Calorie entries, Weight entries, Achievements, and Workout sessions. If write scopes are present, you may create or update HealthyFlow data only when I explicitly ask. Ask for confirmation before destructive actions.`
    : ''

  const contactMessageMutation = useMutation({
    mutationFn: () => contactMessagesService.create({
      kind: contactFlow ?? 'feedback',
      message: contactMessage.trim(),
      ...(user?.email === null ? { replyTo: contactReplyTo.trim() } : {}),
    }),
    onSuccess: () => {
      toast.success('Message sent to the Founders Club')
      setContactFlow(null)
      setContactMessage('')
      setContactReplyTo('')
    },
    onError: () => toast.error('Could not send your message'),
  })

  // Clear all tasks
  const handleClearAllTasks = async () => {
    if (confirm('Are you sure you want to delete ALL your tasks? This cannot be undone.')) {
      try {
        await api.delete('/tasks')
        toast.success('All tasks deleted')
      } catch (e) {
        toast.error('Failed to delete all tasks')
      }
    }
  }

  const handleExportAccount = async () => {
    setExportingAccount(true)
    try {
      const filename = await accountService.exportData()
      toast.success(`Exported ${filename}`)
    } catch {
      toast.error('Could not export account data')
      throw new Error('Account export failed')
    } finally {
      setExportingAccount(false)
    }
  }

  const deletionBlocked = user?.role === 'admin' || user?.email === 'demo@healthyflow.com' || Boolean(user?.email?.startsWith('demo-'))


  const CalendarSyncLed = ({ connected }: { connected: boolean }) => (
    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
      connected
        ? 'border-state-success/40 bg-state-success/10 text-state-success'
        : 'border-line bg-raised text-ink-muted'
    }`}>
      <Sync className="h-5 w-5" aria-hidden="true" />
    </div>
  )

  const enabledHealthTools = settings
    ? MODULE_PRESENTATIONS.filter((presentation) => settings[presentation.settingKey]).length
    : null
  const enabledNotifications = settings
    ? [settings.notifications, settings.dailyReminders, settings.smartReminders, settings.weeklyReports].filter(Boolean).length
    : null
  const enabledTouchpoints = rhythm
    ? [rhythm.morning.enabled, rhythm.midday.enabled, rhythm.weekly.enabled].filter(Boolean).length
    : null
  const deviceCalendarConnected = deviceCalendarAuthorization?.status === 'full_access'
  const googleCalendarConnected = Boolean(googleCalendarStatus?.connected)
  const calendarConnected = isNativeIOS
    ? deviceCalendarConnected || googleCalendarConnected
    : googleCalendarConnected
  const settingsSummary = (category: SettingsCategoryId): string => {
    switch (category) {
      case 'account-billing':
        return creditsLoading ? user?.email ?? 'Loading account' : `${user?.email ?? 'Account'} · ${balance} AI actions`
      case 'planning':
        return enabledTouchpoints == null
          ? 'Loading planning status'
          : `${enabledTouchpoints} of 3 planning touchpoints on`
      case 'notifications':
        return enabledNotifications == null
          ? 'Loading notification status'
          : `${enabledNotifications} of 4 notification options on`
      case 'health-tools':
        return enabledHealthTools == null
          ? 'Loading Health tools'
          : `${enabledHealthTools} of ${MODULE_PRESENTATIONS.length} Health tools shown`
      case 'appearance':
        return `${settings?.theme === 'white' ? 'White' : 'Midnight'} theme`
      case 'connections-advanced':
        return `${calendarConnected ? 'Calendar connected' : 'Calendar not connected'} · ${oauthGrants.filter((grant) => !grant.revokedAt).length} ChatGPT connections`
      case 'data-privacy':
        return 'Export data or manage destructive actions'
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-28 md:pb-0">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-control bg-action">
          <Settings className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
      </div>

      <div className="min-w-0 xl:grid xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start xl:gap-6">
        <aside className={requestedCategory ? 'hidden xl:block' : 'block'}>
          <nav aria-label="Settings categories" className="space-y-2 xl:sticky xl:top-6">
            {SETTINGS_CATEGORIES
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((category) => {
                const Icon = settingsCategoryIcon[category.icon]
                const isActive = activeCategory === category.id
                return (
                  <Link
                    key={category.id}
                    to={`/settings/${category.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={`group flex min-h-16 items-center gap-3 rounded-xl border p-3 transition ${
                      isActive
                        ? 'border-accent/40 bg-accent/10 text-accent'
                        : 'border-line/70 bg-card/40 text-ink-soft hover:border-line-strong hover:bg-card/70'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{category.label}</span>
                      {category.classification !== 'routine' && (
                        <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          category.classification === 'destructive'
                            ? 'border-state-danger/30 text-state-danger'
                            : 'border-state-warning/30 text-state-warning'
                        }`}>
                          {category.classification}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs leading-snug text-ink-muted">
                        {settingsSummary(category.id)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted transition group-hover:translate-x-0.5" />
                  </Link>
                )
              })}
          </nav>
        </aside>

        <section
          aria-label="Settings category"
          className={`min-w-0 space-y-6 ${requestedCategory ? 'block' : 'hidden xl:block'}`}
        >
          <div className="flex items-start gap-3 xl:hidden">
            <Link
              to="/settings"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-accent hover:bg-accent/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Settings
            </Link>
            <div className="min-w-0 pt-2">
              <h2 className="font-semibold text-ink">
                {SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.label}
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                {SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)?.description}
              </p>
            </div>
          </div>

      {activeCategory === 'account-billing' && (
        <>
      {/* Profile Section */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <User className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-ink">Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Name</label>
            <input
              type="text"
              value={user?.name || ''}
              className="input-field"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-soft mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              className="input-field"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* AI actions */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Sparkles className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-ink">AI actions</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-soft">Available actions</span>
            <span className="text-2xl font-bold text-accent">
              {creditsLoading ? '...' : balance ?? 'Unavailable'}
            </span>
          </div>

          {creditsUnavailable && !creditsLoading && (
            <p className="text-sm text-state-danger" role="status">
              Actions available could not be read.
            </p>
          )}

          {exhaustion && (
            <div className="rounded-lg border border-state-warning/35 bg-state-warning/10 p-4">
              <p className="font-semibold text-ink">{exhaustion.title}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {exhaustion.kind === 'monthly'
                  ? `Your next 15 free AI actions become available on ${new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(exhaustion.nextAvailableAt))}.`
                  : exhaustion.detail}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {exhaustion.kind === 'guest' && (
                  <Link className="btn-primary px-4 py-2 text-sm" to="/claim">Create free account</Link>
                )}
                {exhaustion.kind !== 'unavailable' && (
                  <button className="btn-secondary px-4 py-2 text-sm" onClick={() => openContactFlow('more_actions')}>
                    Ask Founders Club
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="h-3 w-full overflow-hidden rounded-full bg-raised">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${balance === null ? 0 : Math.min((balance / 50) * 100, 100)}%` }}
            />
          </div>

          <div className="rounded-lg border border-line/70 bg-sunken/25 p-3 text-sm text-ink-soft">
            <p>
              AI actions include turning notes into tasks, reading a meal photo, or answering questions about your data.
            </p>
            <p className="mt-2 text-xs text-ink-muted">
              Guests receive 10 once. Free accounts receive 15 each calendar month.
            </p>
          </div>
        </div>
      </div>

      {/* Founders Club */}
      <div className="card" id="founders-club">
        <div className="mb-4 flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 flex-none text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-ink">Founders Club</h2>
            <p className="text-sm text-ink-muted">
              Help shape HealthyFlow with direct feedback, or ask for additional free AI actions.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary px-4 py-2 text-sm" onClick={() => openContactFlow('feedback')}>
            Send feedback
          </button>
          <button className="btn-primary px-4 py-2 text-sm" onClick={() => openContactFlow('more_actions')}>
            Request more actions
          </button>
        </div>
      </div>

      {contactFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close contact flow"
            onClick={() => setContactFlow(null)}
          />
          <div className="surface-overlay relative z-10 w-full max-w-lg p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {contactFlow === 'more_actions' ? 'Request more actions' : 'Send feedback'}
                </h2>
                <p className="text-sm text-ink-muted">
                  Your note goes directly to the HealthyFlow founder.
                </p>
              </div>
              <button type="button" className="text-ink-muted hover:text-ink-soft" onClick={() => setContactFlow(null)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                contactMessageMutation.mutate()
              }}
            >
              <label className="grid gap-1.5 text-sm text-ink-soft">
                Message
                <textarea
                  className="input-field min-h-32 w-full"
                  value={contactMessage}
                  maxLength={1000}
                  required
                  onChange={(event) => setContactMessage(event.target.value)}
                  placeholder={contactFlow === 'more_actions'
                    ? 'Tell us how additional actions would help.'
                    : 'What is working, or what should change?'}
                />
              </label>
              {user?.email === null && (
                <label className="grid gap-1.5 text-sm text-ink-soft">
                  Reply-to email
                  <input
                    type="email"
                    className="input-field min-h-11"
                    value={contactReplyTo}
                    maxLength={254}
                    required
                    autoComplete="email"
                    onChange={(event) => setContactReplyTo(event.target.value)}
                  />
                  <span className="text-xs text-ink-muted">A Guest has no account email, so we need an address to reply.</span>
                </label>
              )}
              <button
                type="submit"
                className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-3"
                disabled={contactMessageMutation.isPending || contactMessage.trim().length === 0}
              >
                {contactMessageMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send message
              </button>
            </form>
          </div>
        </div>
      )}
        </>
      )}

      {activeCategory === 'notifications' && (
        <>
      {/* Notifications */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Bell className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Notifications</h2>
          </div>
          <button
            type="button"
            onClick={handleTestNotification}
            className="btn-secondary text-sm"
          >
            Send test notification
          </button>
        </div>

        {/* Browser Permission */}
        {permission.default && (
          <div className="mb-4 rounded-section border border-state-info/30 bg-state-info/10 p-4">
            <div className="flex items-center space-x-3">
              <Smartphone className="w-5 h-5 text-state-info" />
              <div className="flex-1">
                <p className="text-sm font-medium text-state-info">Enable Browser Notifications</p>
                <p className="text-sm text-ink-soft">Allow HealthyFlow to send you reminders and updates</p>
              </div>
              <button
                onClick={handleNotificationPermission}
                className="btn-primary text-sm"
              >
                Enable
              </button>
            </div>
          </div>
        )}

        {permission.denied && (
          <div className="mb-4 rounded-section border border-state-danger/30 bg-state-danger/10 p-4">
            <div className="flex items-center space-x-3">
              <Bell className="w-5 h-5 text-state-danger" />
              <div>
                <p className="text-sm font-medium text-state-danger">Notifications Blocked</p>
                <p className="text-sm text-ink-soft">Please enable notifications in your browser settings to receive reminders</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="divide-y divide-line/50">
          <Switch
            label="Push Notifications"
            description="Receive notifications for task reminders and updates"
            checked={settings?.notifications ?? true}
            onChange={(checked) => handleSettingChange('notifications', checked)}
            disabled={!permission.granted}
          />

          <Switch
            label="Daily Reminders"
            description="Get reminded about your daily tasks and habits"
            checked={settings?.dailyReminders ?? true}
            onChange={(checked) => handleSettingChange('dailyReminders', checked)}
          />

          <Switch
            label="Smart Reminders"
            description="Intelligent reminders based on your schedule and habits"
            checked={settings?.smartReminders ?? true}
            onChange={(checked) => handleSettingChange('smartReminders', checked)}
          />

          <Switch
            label="Weekly Reports"
            description="Receive weekly progress summaries"
            checked={settings?.weeklyReports ?? true}
            onChange={(checked) => handleSettingChange('weeklyReports', checked)}
          />
        </div>
      </div>
        </>
      )}

      {activeCategory === 'planning' && (
        <>
      {/* Planning Rhythm */}
      <div className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <CalendarDays className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Planning Rhythm</h2>
          </div>
          {permission.granted ? (
            <span className="rounded-full border border-state-success/30 bg-state-success/10 px-3 py-1 text-xs font-medium text-state-success">
              Push ready
            </span>
          ) : (
            <button
              type="button"
              onClick={handleNotificationPermission}
              className="btn-secondary text-sm"
            >
              Enable push
            </button>
          )}
        </div>

        {rhythmLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken/40 p-4 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading rhythm
          </div>
        ) : rhythm ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-line/70 bg-sunken/25 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-medium text-ink-soft">Timezone</h3>
                  <p className="text-sm text-ink-muted">Notification times follow this timezone.</p>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    className="input-field w-full min-w-0 sm:w-64"
                    value={rhythm.timezone}
                    onChange={(event) => setRhythm({ ...rhythm, timezone: event.target.value })}
                    onBlur={() => updateRhythm({ timezone: rhythm.timezone.trim() || 'UTC' }, 'timezone')}
                    disabled={rhythmSaving !== null}
                  />
                  {rhythmSaving === 'timezone' && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                </div>
              </div>
            </div>

            {(['morning', 'midday'] as const).map((type) => {
              const touchpoint = rhythm[type]
              const copy = touchpointCopy[type]
              return (
                <div key={type} className="rounded-lg border border-line/70 bg-sunken/25 p-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-ink-soft">{copy.label}</h3>
                        <p className="text-sm text-ink-muted">{copy.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startKickoff(type)}
                          className="btn-secondary px-3 py-2 text-sm"
                        >
                          Start now
                        </button>
                        <button
                          type="button"
                          onClick={() => updateDailyTouchpoint(type, { enabled: !touchpoint.enabled })}
                          disabled={rhythmSaving !== null}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            touchpoint.enabled
                              ? 'border-accent/40 bg-accent/15 text-accent'
                              : 'border-line bg-page/60 text-ink-muted hover:text-ink-soft'
                          }`}
                        >
                          {touchpoint.enabled ? 'On' : 'Off'}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-center">
                      <label className="text-sm text-ink-muted" htmlFor={`${type}-time`}>Time</label>
                      <input
                        id={`${type}-time`}
                        type="time"
                        className="input-field w-full sm:w-36"
                        value={touchpoint.time}
                        onChange={(event) => updateDailyTouchpoint(type, { time: event.target.value })}
                        disabled={rhythmSaving !== null}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-center">
                      <span className="text-sm text-ink-muted">Days</span>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {dayOptions.map((day) => {
                          const selected = touchpoint.days.includes(day.value)
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleDailyDay(type, day.value)}
                              disabled={rhythmSaving !== null || (selected && touchpoint.days.length === 1)}
                              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                selected
                                  ? 'border-accent/40 bg-accent/15 text-accent'
                                  : 'border-line bg-page/60 text-ink-muted hover:text-ink-soft'
                              }`}
                            >
                              {day.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="rounded-lg border border-line/70 bg-sunken/25 p-4">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-ink-soft">{touchpointCopy.weekly.label}</h3>
                    <p className="text-sm text-ink-muted">{touchpointCopy.weekly.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startKickoff('weekly')}
                      className="btn-secondary px-3 py-2 text-sm"
                    >
                      Start now
                    </button>
                    <button
                      type="button"
                      onClick={() => updateWeeklyTouchpoint({ enabled: !rhythm.weekly.enabled })}
                      disabled={rhythmSaving !== null}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        rhythm.weekly.enabled
                          ? 'border-accent/40 bg-accent/15 text-accent'
                          : 'border-line bg-page/60 text-ink-muted hover:text-ink-soft'
                      }`}
                    >
                      {rhythm.weekly.enabled ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-center">
                  <label className="text-sm text-ink-muted" htmlFor="weekly-time">Time</label>
                  <input
                    id="weekly-time"
                    type="time"
                    className="input-field w-full sm:w-36"
                    value={rhythm.weekly.time}
                    onChange={(event) => updateWeeklyTouchpoint({ time: event.target.value })}
                    disabled={rhythmSaving !== null}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-center">
                  <label className="text-sm text-ink-muted" htmlFor="weekly-day">Day</label>
                  <select
                    id="weekly-day"
                    className="input-field w-full sm:w-44"
                    value={rhythm.weekly.day}
                    onChange={(event) => updateWeeklyTouchpoint({ day: Number(event.target.value) as DayIndex })}
                    disabled={rhythmSaving !== null}
                  >
                    {dayOptions.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-state-danger/30 bg-state-danger/10 p-4 text-sm text-state-danger">
            Planning rhythm is unavailable.
          </div>
        )}
      </div>

      {/* Capacity planning window */}
      <div className="card">
        <div className="mb-2 flex items-center space-x-3">
          <CalendarDays className="h-5 w-5 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-ink">Usable Day</h2>
            <p className="text-sm text-ink-muted">
              Define the window HealthyFlow may use for an honest capacity calculation.
            </p>
          </div>
        </div>

        <Switch
          label="Calculate daily capacity"
          description="Uses this explicit window, scheduled Item durations, Calendar obligations, and transition buffers. Reminder times are not reused."
          checked={settings?.planningWindow != null}
          onChange={handlePlanningWindowToggle}
        />

        {settings?.planningWindow && (
          <div className="mt-2 grid gap-4 border-t border-line/60 pt-4 sm:grid-cols-3">
            <label className="grid gap-1.5 text-sm text-ink-muted">
              Day starts
              <input
                type="time"
                value={settings.planningWindow.startTime}
                onChange={(event) => handlePlanningWindowChange('startTime', event.target.value)}
                className="input-field min-h-11"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-ink-muted">
              Day ends
              <input
                type="time"
                value={settings.planningWindow.endTime}
                onChange={(event) => handlePlanningWindowChange('endTime', event.target.value)}
                className="input-field min-h-11"
              />
            </label>
            <label className="grid gap-1.5 text-sm text-ink-muted">
              Transition buffer
              <select
                value={settings.planningWindow.transitionBufferMinutes}
                onChange={(event) => handlePlanningWindowChange('transitionBufferMinutes', Number(event.target.value))}
                className="input-field min-h-11"
              >
                <option value={0}>None</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
            <p className="text-xs text-ink-muted sm:col-span-3">
              The buffer is applied after each known obligation, clipped to this window, and overlapping time is counted once.
            </p>
          </div>
        )}
      </div>
        </>
      )}

      {activeCategory === 'planning' && settings?.assistantProfile && (
        <AssistantProfileEditor
          profile={settings.assistantProfile}
          onSave={(profile) => {
            updateSetting('assistantProfile', profile)
            toast.success('Assistant preferences updated')
          }}
        />
      )}

      {activeCategory === 'planning' && resolution === 'loading' && (
        <div className="card flex items-center gap-2 text-sm text-ink-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading assistant preferences
        </div>
      )}

      {activeCategory === 'planning' && resolution === 'error' && (
        <div className="card flex items-center justify-between gap-3 text-sm text-state-danger" role="alert">
          <span>Assistant preferences are unavailable.</span>
          <button type="button" onClick={() => void retrySettings()} className="btn-secondary px-3 py-2 text-sm">
            Retry
          </button>
        </div>
      )}

      {activeCategory === 'planning' && (
        <div className="card">
          <div className="mb-4 flex items-center space-x-3">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Planning preferences</h2>
          </div>
          <Switch
            label="AI Suggestions"
            description="Get personalized recommendations based on your Items and Habits"
            checked={settings?.aiSuggestions ?? true}
            onChange={(checked) => handleSettingChange('aiSuggestions', checked)}
          />
          <div className="flex flex-col gap-3 border-t border-line/60 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium text-ink-soft">First Day of Week</h3>
              <p className="text-sm text-ink-muted">Used by weekly date ranges</p>
            </div>
            <select
              aria-label="First Day of Week"
              value={settings?.weekStartsOn ?? 1}
              onChange={(event) => handleWeekStartChange(Number(event.target.value) as UserSettings['weekStartsOn'])}
              className="input-field w-full sm:w-44"
            >
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={2}>Tuesday</option>
              <option value={3}>Wednesday</option>
              <option value={4}>Thursday</option>
              <option value={5}>Friday</option>
              <option value={6}>Saturday</option>
            </select>
          </div>
        </div>
      )}

      {activeCategory === 'health-tools' && (
        <div className="card" id="features">
          <div className="mb-4 flex items-center space-x-3">
            <HeartPulse className="h-5 w-5 text-accent" />
            <div>
              <h2 className="text-lg font-semibold text-ink">Health tools</h2>
              <p className="text-sm text-ink-muted">Hiding a tool changes presentation only; existing records stay intact.</p>
            </div>
          </div>
          {resolution === 'loading' && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-line/70 bg-sunken/30 p-3 text-sm text-ink-muted" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking Health tool settings
            </div>
          )}
          {resolution === 'error' && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-state-warning/30 bg-state-warning/10 p-3 text-sm" role="alert">
              <span className="text-ink">Health tool settings could not be loaded.</span>
              <button className="font-semibold text-accent underline" type="button" onClick={() => void retrySettings()}>
                Retry
              </button>
            </div>
          )}
          <div className="divide-y divide-line/60">
            {MODULE_PRESENTATIONS
              .slice()
              .sort((a, b) => a.healthNavigation.order - b.healthNavigation.order)
              .map((presentation) => (
                <div key={presentation.id}>
                  <Switch
                    label={presentation.label}
                    description={presentation.description}
                    checked={settings?.[presentation.settingKey] ?? presentation.defaultEnabled}
                    onChange={(checked) => handleSettingChange(presentation.settingKey, checked)}
                    disabled={resolution !== 'ready'}
                  />
                  <p className="-mt-2 pb-4 pl-0 text-xs text-ink-muted">
                    {presentation.statusSemantics === 'tracker'
                      ? 'Tracker · missing data stays neutral'
                      : presentation.statusSemantics === 'hybrid'
                        ? 'Hybrid · targets are optional'
                        : 'Goal · measured against a target'}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {activeCategory === 'appearance' && (
        <div className="card">
          <div className="mb-4 flex items-center space-x-3">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-ink">Appearance</h2>
          </div>
          <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium text-ink-soft">Theme</h3>
              <p className="text-sm text-ink-muted">Choose the app's look</p>
            </div>
            <div className="inline-flex rounded-lg border border-line-strong p-1">
              {(['midnight', 'white'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                    (settings?.theme ?? 'midnight') === theme
                      ? 'bg-action text-on-action'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeCategory === 'connections-advanced' && (
        <>
          {(isNativeIOS || googleCalendarEligible) && <div className="card">
            <div className="mb-4 flex items-center space-x-3">
              <Sync className="h-5 w-5 text-accent" />
              <div>
                <h2 className="text-lg font-semibold text-ink">Calendar connections</h2>
                <p className="text-sm text-ink-muted">Connect external Calendar obligations to planning.</p>
              </div>
            </div>
            <div className="divide-y divide-line/70">
              {isNativeIOS && (
                <div className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <CalendarSyncLed connected={deviceCalendarConnected} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-ink-soft">Device Calendar</h3>
                        {deviceCalendarConnected && <CheckCircle2 className="h-4 w-4 text-state-success" />}
                      </div>
                      <p className="text-sm text-ink-muted">
                        {deviceCalendarUnavailable
                          ? `Device Calendar unavailable: ${deviceCalendarUnavailable}`
                          : deviceCalendarConnected
                            ? 'Connected to calendars on this iPhone. Automatically sync timed Items. Calendar data stays on this iPhone.'
                            : deviceCalendarAuthorization?.status === 'denied'
                              ? 'Calendar access is denied. You can change it in iOS Settings.'
                              : deviceCalendarAuthorization?.status === 'restricted'
                                ? 'Calendar access is restricted on this iPhone.'
                                : 'Include this iPhone’s Calendar obligations in Today and automatically sync timed Items. Calendar data stays on this iPhone.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {deviceCalendarLoading ? (
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking
                      </div>
                    ) : deviceCalendarAuthorization?.status === 'not_determined' || deviceCalendarAuthorization === null ? (
                      <button
                        onClick={deviceCalendarUnavailable ? loadDeviceCalendarStatus : handleConnectDeviceCalendar}
                        disabled={deviceCalendarActionLoading}
                        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        {deviceCalendarActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                        {deviceCalendarUnavailable ? 'Retry' : 'Connect Calendar'}
                      </button>
                    ) : (
                      <button
                        onClick={handleOpenDeviceCalendarSettings}
                        disabled={deviceCalendarActionLoading}
                        className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        {deviceCalendarActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
                        Open iOS Settings
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isNativeIOS && (
                <div className="py-4 first:pt-0 last:pb-0">
                  <h3 className="text-sm font-medium text-ink-soft">Calendar write path</h3>
                  <p className="text-sm text-ink-muted">
                    {calendarPath.reachesEventKit
                      ? 'Timed Items on this device are written to your iPhone Calendar.'
                      : 'Timed Items on this device are NOT reaching your iPhone Calendar.'}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <dt>Identity</dt><dd className="text-ink-soft">{calendarPath.identity}</dd>
                    <dt>Day branch</dt><dd className="text-ink-soft">{calendarPath.branch}</dd>
                  </dl>
                  {calendarPathReasons(calendarPath).length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-state-warning">
                      {calendarPathReasons(calendarPath).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {googleCalendarEligible && (
                <div className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    <CalendarSyncLed connected={googleCalendarConnected} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-ink-soft">Google Calendar · Cloud</h3>
                        {googleCalendarConnected && <CheckCircle2 className="h-4 w-4 text-state-success" />}
                      </div>
                      <p className="text-sm text-ink-muted">
                        {googleCalendarUnavailable
                          ? `Google Calendar unavailable: ${googleCalendarUnavailable}`
                          : googleCalendarConnected
                            ? `Connected to ${googleCalendarStatus?.accountEmail || 'Google Calendar'}`
                            : 'Connect Google Calendar through HealthyFlow Cloud.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {googleCalendarLoading ? (
                      <div className="flex items-center gap-2 text-sm text-ink-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Checking
                      </div>
                    ) : googleCalendarConnected ? (
                      <button
                        onClick={handleDisconnectGoogleCalendar}
                        disabled={googleCalendarActionLoading}
                        className="inline-flex items-center gap-2 rounded-lg border border-state-danger/30 px-3 py-2 text-sm font-medium text-state-danger transition-colors hover:bg-state-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {googleCalendarActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={googleCalendarUnavailable ? loadGoogleCalendarStatus : handleConnectGoogleCalendar}
                        disabled={googleCalendarActionLoading}
                        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                      >
                        {googleCalendarActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                        {googleCalendarUnavailable ? 'Retry' : 'Connect Google'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>}

      <div className="card">
        <div className="mb-4 flex items-center space-x-3">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <div>
            <h2 className="text-lg font-semibold text-ink">ChatGPT connection</h2>
            <p className="text-sm text-ink-muted">
              Let ChatGPT use HealthyFlow through a secure sign-in and consent flow.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-line/70 bg-sunken/25 p-4">
          <p className="text-sm font-medium text-ink">MCP server URL</p>
          <div className="mt-2 flex gap-2">
            <input className="input-field min-w-0 flex-1 font-mono text-xs" value={mcpEndpoint()} readOnly />
            <button
              type="button"
              className="btn-secondary px-3"
              onClick={() => {
                navigator.clipboard.writeText(mcpEndpoint())
                toast.success('MCP URL copied')
              }}
              aria-label="Copy MCP server URL"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-ink-soft">
            <li>In ChatGPT Settings, enable Developer mode under Security and login.</li>
            <li>Open ChatGPT Plugins, select the plus button, and create a connection with this MCP server URL.</li>
            <li>Review the discovered tools. ChatGPT will open HealthyFlow for authorization when you first use one.</li>
          </ol>
          <p className="mt-3 text-xs text-ink-muted">
            No token needs to be copied into ChatGPT. Access tokens are short-lived,
            and you can revoke the connection below.
          </p>
        </div>

        <div className="mt-4 divide-y divide-card">
          {oauthGrants.length === 0 && (
            <p className="py-3 text-sm text-ink-muted">No ChatGPT OAuth connections yet.</p>
          )}
          {oauthGrants.map((grant) => (
            <div key={grant.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{grant.clientName}</p>
                <p className="text-xs text-ink-muted">{grant.scopes.join(', ')}</p>
                <p className="text-xs text-ink-muted">
                  Connected {new Date(grant.createdAt).toLocaleDateString()}
                  {grant.lastUsedAt ? ` · last used ${new Date(grant.lastUsedAt).toLocaleString()}` : ''}
                  {grant.revokedAt ? ' · revoked' : ''}
                </p>
              </div>
              {!grant.revokedAt && (
                <button
                  type="button"
                  className="rounded-lg border border-state-danger/30 p-2 text-state-danger hover:bg-state-danger/10"
                  onClick={() => revokeOAuthGrantMutation.mutate(grant.id)}
                  disabled={revokeOAuthGrantMutation.isPending}
                  aria-label={`Revoke ${grant.clientName} connection`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center space-x-3">
          <KeyRound className="h-5 w-5 text-accent" />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">Developer client tokens</h2>
              <span className="rounded-full border border-state-warning/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-state-warning">
                Advanced
              </span>
            </div>
            <p className="text-sm text-ink-muted">
              Create scoped credentials for clients that accept a custom Authorization header. ChatGPT uses OAuth above.
            </p>
          </div>
        </div>

        {newToken && (
          <div className="mb-4 rounded-lg border border-state-warning/35 bg-state-warning/10 p-3">
            <p className="text-sm font-medium text-state-warning">Copy this token now</p>
            <div className="mt-2 flex gap-2">
              <input className="input-field min-w-0 flex-1 font-mono text-xs" value={newToken} readOnly />
              <button
                className="btn-secondary px-3"
                onClick={() => {
                  navigator.clipboard.writeText(newToken)
                  toast.success('Token copied')
                }}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3">
              <p className="text-sm font-medium text-state-warning">Connection prompt</p>
              <textarea className="input-field mt-2 min-h-[150px] font-mono text-xs" value={connectionPrompt} readOnly />
              <button
                className="btn-secondary mt-2 inline-flex items-center gap-2 px-3 py-2 text-sm"
                onClick={() => {
                  navigator.clipboard.writeText(connectionPrompt)
                  toast.success('Connection prompt copied')
                }}
              >
                <Copy className="h-4 w-4" />
                Copy prompt
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-line/70 bg-sunken/25 p-3">
          <input className="input-field" value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
          <div className="grid gap-2 sm:grid-cols-2">
            {(['hf:read', 'hf:write:add', 'hf:write:update', 'hf:write:complete', 'hf:write:delete'] as ApiTokenScope[]).map((scope) => (
              <label key={scope} className="flex items-center gap-2 rounded-md border border-card px-3 py-2 text-sm text-ink-soft">
                <input type="checkbox" checked={selectedScopes.includes(scope)} onChange={() => toggleScope(scope)} />
                {scope}
              </label>
            ))}
          </div>
          <button
            className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            disabled={createTokenMutation.isPending || selectedScopes.length === 0}
            onClick={() => createTokenMutation.mutate()}
          >
            {createTokenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Generate token
          </button>
        </div>

        <div className="mt-4 divide-y divide-card">
          {apiTokens.map((token) => (
            <div key={token.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{token.name}</p>
                <p className="text-xs text-ink-muted">{token.scopes.join(', ')}</p>
                <p className="text-xs text-ink-muted">
                  Last used {token.lastUsedAt ?? '-'} {token.revokedAt ? ` · revoked ${token.revokedAt}` : ''}
                </p>
              </div>
              {!token.revokedAt && (
                <button
                  className="rounded-lg border border-state-danger/30 p-2 text-state-danger hover:bg-state-danger/10"
                  onClick={() => revokeTokenMutation.mutate(token.id)}
                  aria-label="Revoke token"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
        </>
      )}

      {activeCategory === 'data-privacy' && (
        <>
      {/* Privacy */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Shield className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-ink">Privacy & Security</h2>
        </div>
        
        <div className="space-y-4">
          <Link to="/support" className="block w-full rounded-lg border border-line-strong p-3 text-left transition-colors hover:bg-card/50">
            <div className="font-medium text-ink-soft">Support</div>
            <div className="text-sm text-ink-muted">Contact HealthyFlow at lermanori@gmail.com</div>
          </Link>

          <button disabled={exportingAccount} onClick={() => void handleExportAccount()} className="w-full text-left p-3 rounded-lg border border-line-strong hover:bg-card/50 transition-colors disabled:cursor-wait disabled:opacity-60">
            <div className="font-medium text-ink-soft">Export Data</div>
            <div className="text-sm text-ink-muted">{exportingAccount ? 'Preparing your portable archive…' : 'Download a complete portable JSON archive'}</div>
          </button>
          
          {/* Clear All Tasks Button */}
          <button 
            onClick={handleClearAllTasks}
            className="w-full text-left p-3 rounded-lg border border-state-danger/30 hover:bg-state-danger/10 transition-colors"
          >
            <div className="font-medium text-state-danger">Clear All Tasks</div>
            <div className="text-sm text-state-danger">Delete all your tasks from the database (cannot be undone)</div>
          </button>
          
          <button disabled={deletionBlocked} onClick={() => setShowDeleteAccount(true)} className="w-full text-left p-3 rounded-lg border border-state-danger/30 hover:bg-state-danger/10 transition-colors disabled:cursor-not-allowed disabled:opacity-55">
            <div className="font-medium text-state-danger">Delete Account</div>
            <div className="text-sm text-state-danger">{deletionBlocked ? 'Demo and administrator accounts cannot be deleted here' : 'Permanently delete your account and data'}</div>
          </button>
        </div>
      </div>
      {showDeleteAccount && (
        <DeleteAccountDialog
          onClose={() => setShowDeleteAccount(false)}
          onExport={handleExportAccount}
          requiresPassword={user?.authMethod === 'password'}
          onDeleted={(warnings) => {
            setShowDeleteAccount(false)
            if (warnings.includes('google-revocation-failed')) {
              toast('Google access could not be revoked automatically. Remove HealthyFlow in your Google Account permissions.', { icon: '⚠️', duration: 9000 })
            }
            if (warnings.includes('supabase-auth-deletion-failed')) {
              toast('Your HealthyFlow data was deleted, but provider sign-in cleanup needs support.', { icon: '⚠️', duration: 9000 })
            }
            completeAccountDeletion()
            navigate('/login', { replace: true })
          }}
        />
      )}
        </>
      )}
        </section>
      </div>
    </div>
  )
}
