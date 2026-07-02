import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Loader2, Settings, Bell, FolderSync as Sync, User, Shield, Smartphone, Unplug, Sparkles, Mail, Instagram, MessageCircle, Copy, X, KeyRound, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { useCredits } from '../hooks/useCredits'
import { useSettings } from '../hooks/useSettings'
import toast from 'react-hot-toast'
import api, { ApiTokenRecord, ApiTokenScope, calendarService, CalendarConnectionStatus, connectionsService, contactMessagesService, UserSettings } from '../services/api'

function mcpEndpoint() {
  const apiBase = api.defaults.baseURL ?? 'http://localhost:3001/api'
  return apiBase.replace(/\/api\/?$/, '/mcp')
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { permission, requestPermission } = useNotifications()
  const { balance, summary: creditSummary, isLoading: creditsLoading } = useCredits()
  const { settings, updateSetting } = useSettings()
  const [calendarStatus, setCalendarStatus] = useState<CalendarConnectionStatus | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [calendarActionLoading, setCalendarActionLoading] = useState(false)
  const [contactFlow, setContactFlow] = useState<'subscribe' | 'topup' | null>(null)
  const [apiTokens, setApiTokens] = useState<ApiTokenRecord[]>([])
  const [newToken, setNewToken] = useState('')
  const [newTokenScopes, setNewTokenScopes] = useState<ApiTokenScope[]>([])
  const [tokenName, setTokenName] = useState('MCP connection')
  const [selectedScopes, setSelectedScopes] = useState<ApiTokenScope[]>(['hf:read'])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const calendarResult = params.get('calendar')
    const message = params.get('message')

    if (calendarResult === 'connected') {
      toast.success('Google Calendar connected')
    }

    if (calendarResult === 'error') {
      toast.error(message || 'Google Calendar connection failed')
    }

    if (calendarResult) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    loadCalendarStatus()
    loadApiTokens()
  }, [])

  const loadCalendarStatus = async () => {
    try {
      setCalendarLoading(true)
      const status = await calendarService.getGoogleStatus()
      setCalendarStatus(status)
    } catch (e) {
      toast.error('Failed to load calendar status')
    } finally {
      setCalendarLoading(false)
    }
  }

  const handleConnectGoogleCalendar = async () => {
    try {
      setCalendarActionLoading(true)
      const url = await calendarService.getGoogleConnectUrl()
      window.location.href = url
    } catch (e) {
      toast.error('Failed to start Google Calendar connection')
      setCalendarActionLoading(false)
    }
  }

  const handleDisconnectGoogleCalendar = async () => {
    try {
      setCalendarActionLoading(true)
      await calendarService.disconnectGoogle()
      toast.success('Google Calendar disconnected')
      await loadCalendarStatus()
    } catch (e) {
      toast.error('Failed to disconnect Google Calendar')
    } finally {
      setCalendarActionLoading(false)
    }
  }

  const loadApiTokens = async () => {
    try {
      setApiTokens(await connectionsService.listTokens())
    } catch (e) {
      toast.error('Failed to load connections')
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

  const handleNotificationPermission = async () => {
    const granted = await requestPermission()
    if (granted) {
      toast.success('Notifications enabled!')
    } else {
      toast.error('Notifications permission denied')
    }
  }

  const contactSubject = contactFlow === 'topup' ? 'HealthyFlow credit top-up' : 'HealthyFlow monthly credits'
  const contactBody = `Hi Ori, I want to ${contactFlow === 'topup' ? 'buy more HealthyFlow credits' : 'subscribe to HealthyFlow credits'} for ${user?.email ?? 'my account'}.`
  const encodedSubject = encodeURIComponent(contactSubject)
  const encodedBody = encodeURIComponent(contactBody)
  const whatsappUrl = `https://wa.me/972523221702?text=${encodedBody}`
  const smsUrl = `sms:+972523221702?&body=${encodedBody}`
  const isOutOfCredits = !creditsLoading && balance <= 0
  const isLowOnCredits = !creditsLoading && balance > 0 && balance < 25
  const planPrice = creditSummary?.pricing.priceUsd ?? 1
  const monthlyCredits = creditSummary?.pricing.monthlyCredits ?? 500
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
      kind: contactFlow ?? 'subscribe',
      message: contactBody,
    }),
    onSuccess: () => {
      toast.success('Message sent to admin')
      setContactFlow(null)
    },
    onError: () => toast.error('Failed to send message'),
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

  const SettingToggle = ({ 
    label, 
    description, 
    checked, 
    onChange,
    disabled = false
  }: { 
    label: string
    description: string
    checked: boolean
    onChange: (checked: boolean) => void
    disabled?: boolean
  }) => (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1">
        <h3 className={`text-sm font-medium ${disabled ? 'text-gray-500' : 'text-gray-200'}`}>
          {label}
        </h3>
        <p className={`text-sm ${disabled ? 'text-gray-600' : 'text-gray-400'}`}>
          {description}
        </p>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          disabled 
            ? 'bg-gray-700 cursor-not-allowed'
            : checked 
              ? 'bg-cyan-500' 
              : 'bg-gray-600'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )

  const CalendarSyncLed = ({ connected }: { connected: boolean }) => (
    <div className="relative h-16 w-16 shrink-0 rounded-full bg-gradient-to-br from-gray-950 via-gray-800 to-gray-950 p-2 shadow-inner shadow-black/80 border border-gray-700">
      <div className={`absolute inset-1 rounded-full blur-md transition-opacity duration-500 ${connected ? 'bg-emerald-400/50 opacity-100' : 'bg-gray-700/20 opacity-40'}`} />
      <div className={`relative h-full w-full rounded-full border transition-all duration-500 ${
        connected
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-200 via-emerald-500 to-green-800 shadow-[0_0_24px_rgba(52,211,153,0.75),inset_0_0_12px_rgba(255,255,255,0.45)]'
          : 'border-gray-600 bg-gradient-to-br from-gray-500 via-gray-700 to-gray-950 shadow-[inset_0_0_12px_rgba(0,0,0,0.75)]'
      }`}>
        <div className="absolute left-3 top-2 h-4 w-6 rounded-full bg-white/30 blur-sm" />
        {connected && <div className="absolute inset-0 rounded-full animate-pulse bg-emerald-300/15" />}
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-28 md:pb-0">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center animate-float">
          <Settings className="w-4 h-4 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-100 neon-text">Settings</h1>
      </div>

      {/* Profile Section */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <User className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Profile</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Name</label>
            <input
              type="text"
              value={user?.name || ''}
              className="input-field"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              className="input-field"
              readOnly
            />
          </div>
        </div>
      </div>

      {/* AI Tokens */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">AI Credits</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Available credits</span>
            <span className="text-2xl font-bold text-cyan-400">
              {creditsLoading ? '...' : balance}
            </span>
          </div>

          {(isOutOfCredits || isLowOnCredits) && (
            <div className={`rounded-lg border p-4 ${
              isOutOfCredits
                ? 'border-rose-500/35 bg-rose-500/10'
                : 'border-amber-500/35 bg-amber-500/10'
            }`}>
              <p className="font-semibold text-gray-100">
                {isOutOfCredits ? 'You are out of AI credits' : 'You are running low on AI credits'}
              </p>
              <p className="mt-1 text-sm text-gray-300">
                Subscribe for {monthlyCredits} credits each month, or buy a quick top-up when you only need a little more.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary px-4 py-2 text-sm" onClick={() => setContactFlow('subscribe')}>
                  Subscribe
                </button>
                <button className="btn-secondary px-4 py-2 text-sm" onClick={() => setContactFlow('topup')}>
                  Buy More
                </button>
              </div>
            </div>
          )}

          {creditSummary && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-700/70 bg-gray-950/25 p-3">
                <p className="text-gray-400">Monthly plan</p>
                <p className="mt-1 font-semibold text-gray-100">
                  {creditSummary.subscription.active ? `${creditSummary.subscription.pricePhase} plan` : 'Inactive'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Refresh {creditSummary.subscription.renewalDate ?? '-'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-700/70 bg-gray-950/25 p-3">
                <p className="text-gray-400">Used this month</p>
                <p className="mt-1 font-semibold text-gray-100">{creditSummary.usedThisMonth}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {creditSummary.subscriptionBalance} monthly · {creditSummary.topupBalance} top-up credits left
                </p>
              </div>
            </div>
          )}

          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full transition-all duration-300"
              style={{ width: `${Math.min((balance / 50) * 100, 100)}%` }}
            />
          </div>

          <div className="rounded-lg border border-gray-700/70 bg-gray-950/25 p-3 text-sm text-gray-300">
            <p>
              Credits power AI actions like turning notes into tasks, reading a meal photo, or answering questions about your data.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Most quick text analyses use about 5-15 credits. Longer notes or images can use more.
            </p>
          </div>

          {creditSummary && (
            <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/8 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-cyan-100">
                    ${planPrice} / month
                  </p>
                  <p className="text-sm text-gray-300">{monthlyCredits} credits / month, refreshed monthly with no rollover.</p>
                  <p className="mt-1 text-xs text-gray-400">Pick the plan when you want AI available without watching each action.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary px-4 py-2 text-sm" onClick={() => setContactFlow('subscribe')}>
                    Subscribe
                  </button>
                  <button className="btn-secondary px-4 py-2 text-sm" onClick={() => setContactFlow('topup')}>
                    Buy More
                  </button>
                </div>
              </div>
            </div>
          )}
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
          <div className="relative z-10 w-full max-w-lg rounded-lg border border-cyan-500/25 bg-gray-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">
                  {contactFlow === 'topup' ? 'Buy more credits' : 'Subscribe'}
                </h2>
                <p className="text-sm text-gray-400">
                  Manual fulfillment for now. Reach out through any channel.
                </p>
              </div>
              <button type="button" className="text-gray-400 hover:text-gray-200" onClick={() => setContactFlow(null)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2">
              <a className="btn-secondary inline-flex items-center gap-2 px-4 py-3" href={`mailto:lermanori@gmail.com?subject=${encodedSubject}&body=${encodedBody}`}>
                <Mail className="h-4 w-4" />
                Email
              </a>
              <a className="btn-secondary inline-flex items-center gap-2 px-4 py-3" href="https://instagram.com/lermanori" target="_blank" rel="noreferrer">
                <Instagram className="h-4 w-4" />
                Instagram DM
              </a>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-2 px-4 py-3"
                onClick={() => contactMessageMutation.mutate()}
                disabled={contactMessageMutation.isPending}
              >
                {contactMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                In-app message
              </button>
              <a className="btn-secondary inline-flex items-center gap-2 px-4 py-3" href={whatsappUrl} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a className="btn-secondary inline-flex items-center gap-2 px-4 py-3" href={smsUrl}>
                <Smartphone className="h-4 w-4" />
                SMS
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Bell className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Notifications</h2>
        </div>

        {/* Browser Permission */}
        {permission.default && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-xl">
            <div className="flex items-center space-x-3">
              <Smartphone className="w-5 h-5 text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-300">Enable Browser Notifications</p>
                <p className="text-sm text-gray-300">Allow HealthyFlow to send you reminders and updates</p>
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
          <div className="mb-4 p-4 bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-xl">
            <div className="flex items-center space-x-3">
              <Bell className="w-5 h-5 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-300">Notifications Blocked</p>
                <p className="text-sm text-gray-300">Please enable notifications in your browser settings to receive reminders</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="divide-y divide-gray-700/50">
          <SettingToggle
            label="Push Notifications"
            description="Receive notifications for task reminders and updates"
            checked={settings?.notifications ?? true}
            onChange={(checked) => handleSettingChange('notifications', checked)}
            disabled={!permission.granted}
          />

          <SettingToggle
            label="Daily Reminders"
            description="Get reminded about your daily tasks and habits"
            checked={settings?.dailyReminders ?? true}
            onChange={(checked) => handleSettingChange('dailyReminders', checked)}
          />

          <SettingToggle
            label="Smart Reminders"
            description="Intelligent reminders based on your schedule and habits"
            checked={settings?.smartReminders ?? true}
            onChange={(checked) => handleSettingChange('smartReminders', checked)}
          />

          <SettingToggle
            label="Weekly Reports"
            description="Receive weekly progress summaries"
            checked={settings?.weeklyReports ?? true}
            onChange={(checked) => handleSettingChange('weeklyReports', checked)}
          />
        </div>
      </div>

      {/* AI & Sync */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Sync className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Features</h2>
        </div>
        
        <div className="divide-y divide-gray-700/50">
          <SettingToggle
            label="AI Suggestions"
            description="Get personalized recommendations based on your habits"
            checked={settings?.aiSuggestions ?? true}
            onChange={(checked) => handleSettingChange('aiSuggestions', checked)}
          />

          <SettingToggle
            label="Completion Sounds"
            description="Play celebratory sounds when completing tasks"
            checked={settings?.completionSounds ?? true}
            onChange={(checked) => handleSettingChange('completionSounds', checked)}
          />

          <SettingToggle
            label="Calorie Intake"
            description="Track calorie intake alongside your tasks and habits"
            checked={settings?.calorieIntake ?? false}
            onChange={(checked) => handleSettingChange('calorieIntake', checked)}
          />

          <SettingToggle
            label="Achievement Tracker"
            description="Track personal bests and measurable progress over time"
            checked={settings?.achievementTracker ?? false}
            onChange={(checked) => handleSettingChange('achievementTracker', checked)}
          />

          <div className="py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <CalendarSyncLed connected={Boolean(calendarStatus?.connected)} />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-200">Calendar Sync</h3>
                    {calendarStatus?.connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  </div>
                  <p className="text-sm text-gray-400">
                    {calendarStatus?.connected
                      ? `Connected to ${calendarStatus.accountEmail || 'Google Calendar'}`
                      : 'Connect Google Calendar to start syncing timed tasks'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:justify-end">
                {calendarLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking
                  </div>
                ) : calendarStatus?.connected ? (
                  <button
                    onClick={handleDisconnectGoogleCalendar}
                    disabled={calendarActionLoading}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {calendarActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={handleConnectGoogleCalendar}
                    disabled={calendarActionLoading}
                    className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
                  >
                    {calendarActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                    Connect Google
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center space-x-3">
          <KeyRound className="h-5 w-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Connections</h2>
        </div>

        {newToken && (
          <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-100">Copy this token now</p>
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
              <p className="text-sm font-medium text-amber-100">Connection prompt</p>
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

        <div className="space-y-3 rounded-lg border border-gray-700/70 bg-gray-950/25 p-3">
          <input className="input-field" value={tokenName} onChange={(event) => setTokenName(event.target.value)} />
          <div className="grid gap-2 sm:grid-cols-2">
            {(['hf:read', 'hf:write:add', 'hf:write:update', 'hf:write:complete', 'hf:write:delete'] as ApiTokenScope[]).map((scope) => (
              <label key={scope} className="flex items-center gap-2 rounded-md border border-gray-800 px-3 py-2 text-sm text-gray-200">
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

        <div className="mt-4 divide-y divide-gray-800">
          {apiTokens.map((token) => (
            <div key={token.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-100">{token.name}</p>
                <p className="text-xs text-gray-400">{token.scopes.join(', ')}</p>
                <p className="text-xs text-gray-500">
                  Last used {token.lastUsedAt ?? '-'} {token.revokedAt ? ` · revoked ${token.revokedAt}` : ''}
                </p>
              </div>
              {!token.revokedAt && (
                <button
                  className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10"
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

      {/* Preferences */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <CalendarDays className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Preferences</h2>
        </div>

        <div className="flex flex-col gap-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">First Day of Week</h3>
            <p className="text-sm text-gray-400">Used by Week View and weekly date ranges</p>
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

      {/* Privacy */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Shield className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-100">Privacy & Security</h2>
        </div>
        
        <div className="space-y-4">
          <button className="w-full text-left p-3 rounded-lg border border-gray-600 hover:bg-gray-800/50 transition-colors">
            <div className="font-medium text-gray-200">Export Data</div>
            <div className="text-sm text-gray-400">Download all your data in JSON format</div>
          </button>
          
          <button 
            onClick={() => {
              localStorage.clear()
              toast.success('Cache cleared successfully')
            }}
            className="w-full text-left p-3 rounded-lg border border-gray-600 hover:bg-gray-800/50 transition-colors"
          >
            <div className="font-medium text-gray-200">Clear Cache</div>
            <div className="text-sm text-gray-400">Clear all locally stored data including API keys</div>
          </button>
          
          {/* Clear All Tasks Button */}
          <button 
            onClick={handleClearAllTasks}
            className="w-full text-left p-3 rounded-lg border border-red-500/30 hover:bg-red-500/10 transition-colors"
          >
            <div className="font-medium text-red-400">Clear All Tasks</div>
            <div className="text-sm text-red-300">Delete all your tasks from the database (cannot be undone)</div>
          </button>
          
          <button className="w-full text-left p-3 rounded-lg border border-red-500/30 hover:bg-red-500/10 transition-colors">
            <div className="font-medium text-red-400">Delete Account</div>
            <div className="text-sm text-red-300">Permanently delete your account and data</div>
          </button>
        </div>
      </div>
    </div>
  )
}
