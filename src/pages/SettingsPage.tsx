import { useState } from 'react'
import { Settings, Bell, FolderSync as Sync, User, Shield, Smartphone, Key, Save } from 'lucide-react'
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

  const [aiSettings, setAiSettings] = useState({
    openaiApiKey: localStorage.getItem('openai_api_key') || '',
    enableAI: localStorage.getItem('openai_api_key') ? true : false,
    aiPersonality: 'encouraging', // encouraging, professional, casual
  })

  const handleSettingChange = (key: string, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    toast.success('Settings updated')
  }

  const handleAiSettingChange = (key: string, value: string | boolean) => {
    setAiSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSaveAiSettings = () => {
    if (aiSettings.openaiApiKey.trim()) {
      localStorage.setItem('openai_api_key', aiSettings.openaiApiKey.trim())
      setAiSettings(prev => ({ ...prev, enableAI: true }))
      toast.success('AI settings saved! You can now receive personalized recommendations.')
    } else {
      localStorage.removeItem('openai_api_key')
      setAiSettings(prev => ({ ...prev, enableAI: false }))
      toast.success('AI settings cleared.')
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
        <h3 className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
          {label}
        </h3>
        <p className={`text-sm ${disabled ? 'text-gray-400' : 'text-gray-600'}`}>
          {description}
        </p>
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          disabled 
            ? 'bg-gray-200 cursor-not-allowed'
            : checked 
              ? 'bg-primary-600' 
              : 'bg-gray-200'
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
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <Settings className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Profile Section */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <User className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={user?.name || ''}
              className="input-field"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
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
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Key className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">AI Configuration</h2>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">OpenAI API Key</h3>
            <p className="text-sm text-blue-700 mb-3">
              Add your OpenAI API key to enable personalized AI recommendations and insights.
              Your key is stored locally and never sent to our servers.
            </p>
            <div className="space-y-3">
              <input
                type="password"
                value={aiSettings.openaiApiKey}
                onChange={(e) => handleAiSettingChange('openaiApiKey', e.target.value)}
                placeholder="sk-..."
                className="input-field"
              />
              <div className="flex items-center justify-between">
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-700"
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
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

          <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
            <div className={`w-3 h-3 rounded-full ${aiSettings.enableAI ? 'bg-green-500' : 'bg-gray-400'}`}></div>
            <span className="text-sm text-gray-700">
              AI Features: {aiSettings.enableAI ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Bell className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
        </div>

        {/* Browser Permission */}
        {permission.default && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <Smartphone className="w-5 h-5 text-blue-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">Enable Browser Notifications</p>
                <p className="text-sm text-blue-700">Allow HealthyFlow to send you reminders and updates</p>
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
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <Bell className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-900">Notifications Blocked</p>
                <p className="text-sm text-red-700">Please enable notifications in your browser settings to receive reminders</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="divide-y divide-gray-200">
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
          <Sync className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Features</h2>
        </div>
        
        <div className="divide-y divide-gray-200">
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
          <Shield className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Privacy & Security</h2>
        </div>
        
        <div className="space-y-4">
          <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <div className="font-medium text-gray-900">Export Data</div>
            <div className="text-sm text-gray-600">Download all your data in JSON format</div>
          </button>
          
          <button 
            onClick={() => {
              localStorage.clear()
              toast.success('Cache cleared successfully')
            }}
            className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium text-gray-900">Clear Cache</div>
            <div className="text-sm text-gray-600">Clear all locally stored data including API keys</div>
          </button>
          
          {/* Clear All Tasks Button */}
          <button 
            onClick={handleClearAllTasks}
            className="w-full text-left p-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
          >
            <div className="font-medium text-red-600">Clear All Tasks</div>
            <div className="text-sm text-red-500">Delete all your tasks from the database (cannot be undone)</div>
          </button>
          
          <button className="w-full text-left p-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors">
            <div className="font-medium text-red-600">Delete Account</div>
            <div className="text-sm text-red-500">Permanently delete your account and data</div>
          </button>
        </div>
      </div>
    </div>
  )
}