import { useState, useEffect } from 'react'
import { Volume2, Settings, Mic, MicOff } from 'lucide-react'
import { useTTS } from '../hooks/useTTS'

interface TTSSettingsProps {
  ttsEnabled: boolean
  onTTSEnabledChange: (enabled: boolean) => void
  selectedVoice: string
  onVoiceChange: (voice: string) => void
  autoSpeakResults: boolean
  onAutoSpeakChange: (enabled: boolean) => void
  rate: number
  onRateChange: (rate: number) => void
  onTestVoice?: () => void
}

export default function TTSSettings({
  ttsEnabled,
  onTTSEnabledChange,
  selectedVoice,
  onVoiceChange,
  autoSpeakResults,
  onAutoSpeakChange,
  rate,
  onRateChange,
  onTestVoice
}: TTSSettingsProps) {
  const { isSupported, availableVoices, getDefaultVoice } = useTTS()
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    // Set default voice if none selected
    if (!selectedVoice && availableVoices.length > 0) {
      const defaultVoice = getDefaultVoice()
      if (defaultVoice) {
        onVoiceChange(defaultVoice.name)
      }
    }
  }, [availableVoices, selectedVoice, onVoiceChange, getDefaultVoice])

  const handleTestVoice = () => {
    if (onTestVoice) {
      onTestVoice()
    }
  }

  if (!isSupported) {
    return (
      <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
        <div className="flex items-center space-x-2">
          <MicOff className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-yellow-400 font-medium">TTS Not Supported</span>
        </div>
        <p className="text-xs text-gray-300 mt-1">
          Text-to-speech is not supported in your browser. Try using Chrome, Safari, or Edge.
        </p>
      </div>
    )
  }

  return (
    <div className="tts-controls bg-gray-800/50 rounded-xl p-4 border border-cyan-500/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Volume2 className="w-3 h-3 text-white" />
          </div>
          <h4 className="text-sm font-medium text-gray-200">Voice Assistant</h4>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={ttsEnabled}
              onChange={(e) => onTTSEnabledChange(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
          </label>
        </div>
      </div>

      {/* Expanded Settings */}
      {isExpanded && ttsEnabled && (
        <div className="space-y-4 pt-3 border-t border-gray-700/50">
          {/* Voice Selection */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">Voice</label>
            <select 
              value={selectedVoice}
              onChange={(e) => onVoiceChange(e.target.value)}
              className="input-field text-sm w-full"
            >
              {availableVoices.map(voice => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Speech Rate */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">
              Speech Rate: {rate}x
            </label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={(e) => onRateChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Slow</span>
              <span>Normal</span>
              <span>Fast</span>
            </div>
          </div>

          {/* Auto-speak Toggle */}
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={autoSpeakResults}
              onChange={(e) => onAutoSpeakChange(e.target.checked)}
              className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-cyan-500 focus:ring-2"
            />
            <label className="text-xs text-gray-400">
              Auto-speak analysis results
            </label>
          </div>

          {/* Test Voice Button */}
          <button
            onClick={handleTestVoice}
            className="btn-secondary text-xs w-full flex items-center justify-center space-x-2"
          >
            <Mic className="w-4 h-4" />
            <span>Test Voice</span>
          </button>
        </div>
      )}

      {/* Collapsed Info */}
      {!isExpanded && ttsEnabled && (
        <div className="text-xs text-gray-400">
          {selectedVoice && (
            <p>Voice: {selectedVoice}</p>
          )}
          {autoSpeakResults && (
            <p>Auto-speak: Enabled</p>
          )}
        </div>
      )}
    </div>
  )
} 