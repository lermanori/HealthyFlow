import { useState, useEffect } from 'react'
import { Settings, Bell, FolderSync as Sync, User, Shield, Smartphone, Save, Brain, Sparkles, Eye, EyeOff, Copy, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function SettingsPage() {
  const { user } = useAuth()
  const { permission, requestPermission } = useNotifications()
  const [settings, setSettings] = useState({
    notifications: true,
    dailyReminders: true,
    weeklyReports: true,
    aiSuggestions: true,
    calendarSync: false,
    smartReminders: true,
    completionSounds: true,
  })

  const [showApiKey, setShowApiKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [apiKeyParts, setApiKeyParts] = useState({
    prefix: '',
    middle: '',
    suffix: ''
  })

  const [aiSettings, setAiSettings] = useState({
    openaiApiKey: localStorage.getItem('openai_api_key') || '',
    enableAI: localStorage.getItem('openai_api_key') ? true : false,
    aiPersonality: 'encouraging', // encouraging, professional, casual
  })

  // Initialize API key parts when component loads
  useEffect(() => {
    const savedKey = localStorage.getItem('openai_api_key') || ''
    if (savedKey && savedKey.startsWith('sk-')) {
      setApiKeyParts({
        prefix: savedKey.substring(0, 3),
        middle: savedKey.substring(3, savedKey.length - 4),
        suffix: savedKey.substring(savedKey.length - 4)
      })
    }
  }, [])

  const handleSettingChange = (key: string, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    toast.success('Settings updated')
  }

  const handleAiSettingChange = (key: string, value: string | boolean) => {
    setAiSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleApiKeyPartChange = (part: 'prefix' | 'middle' | 'suffix', value: string) => {
    setApiKeyParts(prev => ({ ...prev, [part]: value }))
    
    // Reconstruct the full API key
    const newParts = { ...apiKeyParts, [part]: value }
    const fullKey = newParts.prefix + newParts.middle + newParts.suffix
    
    // Update the main state
    setAiSettings(prev => ({ ...prev, openaiApiKey: fullKey }))
  }

  const handleSaveAiSettings = () => {
    // Reconstruct the full API key from parts if using the segmented input
    let keyToSave = aiSettings.openaiApiKey
    
    if (apiKeyParts.prefix || apiKeyParts.middle || apiKeyParts.suffix) {
      keyToSave = apiKeyParts.prefix + apiKeyParts.middle + apiKeyParts.suffix
    }
    
    if (keyToSave.trim()) {
      localStorage.setItem('openai_api_key', keyToSave.trim())
      setAiSettings(prev => ({ ...prev, enableAI: true }))
      toast.success('AI settings saved! You can now receive personalized recommendations.')
    } else {
      localStorage.removeItem('openai_api_key')
      setAiSettings(prev => ({ ...prev, enableAI: false }))
      toast.success('AI settings cleared.')
    }
  }

  const copyApiKey = () => {
    const key = aiSettings.openaiApiKey
    if (key) {
      navigator.clipboard.writeText(key)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
          toast.success('API key copied to clipboard')
        })
        .catch(() => {
          toast.error('Failed to copy API key')
        })
    }
  }

  const pasteApiKey = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim().startsWith('sk-')) {
        setAiSettings(prev => ({ ...prev, openaiApiKey: text.trim() }))
        
        // Also update the segmented parts
        if (text.length > 7) {
          setApiKeyParts({
            prefix: text.substring(0, 3),
            middle: text.substring(3, text.length - 4),
            suffix: text.substring(text.length - 4)
          })
        }
        
        toast.success('API key pasted')
      } else {
        toast.error('Invalid API key format')
      }
    } catch (error) {
      toast.error('Failed to paste from clipboard')
    }
  }

  const handleNotificationPermission = async () => {
    const granted = await requestPermission()
    if (granted) {
      toast.success('Notifications enabled!')
    } else {
      toast.error('Notifications permission denied')
    }
  }

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

      {/* AI Configuration */}
      <div className="card ai-glow">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
            <Brain className="w-3 h-3 text-white" />
          </div>
          <h2 className="text-lg font-semibold text-gray-100">AI Configuration</h2>
          <Sparkles className="w-4 h-4 text-cyan-400 animate-neon-flicker" />
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl">
            <h3 className="text-sm font-medium text-blue-300 mb-2">OpenAI API Key</h3>
            <p className="text-sm text-gray-300 mb-3">
              Add your OpenAI API key to enable personalized AI recommendations and insights.
              Your key is stored locally and never sent to our servers.
            </p>
            
            {/* Mobile-friendly API Key Input */}
            <div className="space-y-3">
              {/* Standard Input with Show/Hide Toggle */}
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={aiSettings.openaiApiKey}
                  onChange={(e) => handleAiSettingChange('openaiApiKey', e.target.value)}
                  placeholder="sk-..."
                  className="input-field pr-20"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400"
                    aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={copyApiKey}
                    className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400"
                    aria-label="Copy API key"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {/* Segmented Input for Mobile */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400">
                  Mobile-friendly input (enter your key in parts):
                </label>
                <div className="flex space-x-2">
                  <div className="w-16">
                    <input
                      type="text"
                      value={apiKeyParts.prefix}
                      onChange={(e) => handleApiKeyPartChange('prefix', e.target.value)}
                      placeholder="sk-"
                      className="input-field text-center"
                      maxLength={3}
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyParts.middle}
                      onChange={(e) => handleApiKeyPartChange('middle', e.target.value)}
                      placeholder="middle part"
                      className="input-field"
                    />
                  </div>
                  <div className="w-16">
                    <input
                      type="text"
                      value={apiKeyParts.suffix}
                      onChange={(e) => handleApiKeyPartChange('suffix', e.target.value)}
                      placeholder="end"
                      className="input-field text-center"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>
              
              {/* Paste Button for Mobile */}
              <button
                onClick={pasteApiKey}
                className="w-full p-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center space-x-2"
              >
                <Smartphone className="w-4 h-4" />
                <span>Paste from Clipboard</span>
              </button>
              
              <div className="flex items-center justify-between">
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Get your API key from OpenAI →
                </a>
                <button
                  onClick={handleSaveAiSettings}
                  className="btn-primary text-sm flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Save</span>
                </button>
              </div>
            </div>
          </div>

          {aiSettings.enableAI && (
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-2">
                AI Personality
              </label>
              <select
                value={aiSettings.aiPersonality}
                onChange={(e) => handleAiSettingChange('aiPersonality', e.target.value)}
                className="input-field"
              >
                <option value="encouraging">Encouraging & Motivational</option>
                <option value="professional">Professional & Direct</option>
                <option value="casual">Casual & Friendly</option>
              </select>
            </div>
          )}

          <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <div className={`w-3 h-3 rounded-full ${aiSettings.enableAI ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></div>
            <span className="text-sm text-gray-300">
              AI Features: {aiSettings.enableAI ? 'Enhanced Mode' : 'Basic Mode'}
            </span>
          </div>
        </div>
      </div>

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
            checked={settings.notifications}
            onChange={(checked) => handleSettingChange('notifications', checked)}
            disabled={!permission.granted}
          />
          
          <SettingToggle
            label="Daily Reminders"
            description="Get reminded about your daily tasks and habits"
            checked={settings.dailyReminders}
            onChange={(checked) => handleSettingChange('dailyReminders', checked)}
          />
          
          <SettingToggle
            label="Smart Reminders"
            description="Intelligent reminders based on your schedule and habits"
            checked={settings.smartReminders}
            onChange={(checked) => handleSettingChange('smartReminders', checked)}
          />
          
          <SettingToggle
            label="Weekly Reports"
            description="Receive weekly progress summaries"
            checked={settings.weeklyReports}
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
            checked={settings.aiSuggestions}
            onChange={(checked) => handleSettingChange('aiSuggestions', checked)}
            disabled={!aiSettings.enableAI}
          />
          
          <SettingToggle
            label="Completion Sounds"
            description="Play celebratory sounds when completing tasks"
            checked={settings.completionSounds}
            onChange={(checked) => handleSettingChange('completionSounds', checked)}
          />
          
          <SettingToggle
            label="Calendar Sync"
            description="Sync with Google Calendar (coming soon)"
            checked={settings.calendarSync}
            onChange={(checked) => handleSettingChange('calendarSync', checked)}
            disabled={true}
          />
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