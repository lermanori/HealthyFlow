import { useState } from 'react'
import { Settings, Bell, FolderSync as Sync, User, Shield, Smartphone } from 'lucide-react'
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

  const handleSettingChange = (key: string, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
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