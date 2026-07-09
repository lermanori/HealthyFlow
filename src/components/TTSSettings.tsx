import { useState, useEffect } from 'react'
import { Volume2, Settings, Mic, MicOff, X } from 'lucide-react'
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
  compact?: boolean
  embedded?: boolean
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
  onTestVoice,
  compact = false,
  embedded = false
}: TTSSettingsProps) {
  const { isSupported, availableVoices, getDefaultVoice } = useTTS()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

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
      <div className={`${embedded ? 'rounded-lg px-2 py-1' : 'rounded-xl border border-yellow-500/30 p-4'} bg-yellow-500/10`}>
        <div className="flex items-center space-x-2">
          <MicOff className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-yellow-400 font-medium">TTS Not Supported</span>
        </div>
        <p className="text-xs text-ink-soft mt-1">
          Text-to-speech is not supported in your browser. Try using Chrome, Safari, or Edge.
        </p>
      </div>
    )
  }

  return (
    <div
      className={`tts-controls ${
        embedded
          ? 'rounded-xl border border-cyan-500/25 bg-page/25 px-1.5 py-1'
          : `rounded-xl border border-cyan-500/30 bg-card/50 ${compact ? 'p-3' : 'p-4'}`
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between ${compact ? '' : 'mb-3'}`}>
        <div className={`flex items-center ${embedded ? 'space-x-1.5' : 'space-x-2'}`}>
          <div className={`${embedded ? 'h-8 w-8 rounded-lg' : 'w-6 h-6 rounded-lg'} bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center`}>
            <Volume2 className="w-3 h-3 text-white" />
          </div>
          {!embedded && <h4 className="text-sm font-medium text-ink-soft">Voice Assistant</h4>}
        </div>
        
        <div className={`flex items-center ${embedded ? 'space-x-1.5' : 'space-x-2'}`}>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`${embedded ? 'flex h-8 w-8 items-center justify-center rounded-lg' : 'p-1 rounded'} hover:bg-gray-700 transition-colors`}
            aria-label="Open voice assistant settings"
          >
            <Settings className="w-4 h-4 text-ink-muted" />
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

      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-sunken/75 p-4 backdrop-blur-sm"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cyan-500/30 bg-page p-5 shadow-2xl shadow-cyan-500/20"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600">
                  <Volume2 className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">Voice Assistant</h3>
                  <p className="text-xs text-ink-muted">Configure spoken analysis feedback</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-card hover:text-ink"
                aria-label="Close voice assistant settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-5 flex items-center justify-between rounded-xl border border-line/70 bg-card/60 p-3">
              <div>
                <h4 className="text-sm font-medium text-ink">Enable Voice Assistant</h4>
                <p className="text-xs text-ink-muted">Allow HealthyFlow to speak generated results.</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={ttsEnabled}
                  onChange={(e) => onTTSEnabledChange(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-full bg-gray-600 after:absolute after:left-[3px] after:top-[3px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-cyan-500 peer-checked:after:translate-x-full peer-focus:outline-none"></div>
              </label>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs text-ink-muted">Voice</label>
                <select
                  value={selectedVoice}
                  onChange={(e) => onVoiceChange(e.target.value)}
                  className="input-field w-full text-sm"
                >
                  {availableVoices.map(voice => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs text-ink-muted">
                  Speech Rate: {rate}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={rate}
                  onChange={(e) => onRateChange(parseFloat(e.target.value))}
                  className="slider h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-700"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>Slow</span>
                  <span>Normal</span>
                  <span>Fast</span>
                </div>
              </div>

              <label className="flex items-center space-x-3 rounded-xl border border-line/70 bg-card/40 p-3">
                <input
                  type="checkbox"
                  checked={autoSpeakResults}
                  onChange={(e) => onAutoSpeakChange(e.target.checked)}
                  className="h-4 w-4 rounded border-line-strong bg-gray-700 text-cyan-500 focus:ring-2 focus:ring-cyan-500"
                />
                <span className="text-sm text-ink-soft">Auto-speak analysis results</span>
              </label>

              <button
                onClick={handleTestVoice}
                disabled={!ttsEnabled}
                className="btn-secondary flex w-full items-center justify-center space-x-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mic className="w-4 h-4" />
                <span>Test Voice</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collapsed Info */}
      {!compact && ttsEnabled && (
        <div className="text-xs text-ink-muted">
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
