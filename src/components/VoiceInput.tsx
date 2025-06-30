import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Square, RotateCcw, Settings, Volume2 } from 'lucide-react'
import { useSTT } from '../hooks/useSTT'

interface VoiceInputProps {
  onTranscriptChange: (transcript: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function VoiceInput({
  onTranscriptChange,
  placeholder = "Speak to describe your tasks...",
  disabled = false,
  className = ""
}: VoiceInputProps) {
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    confidence,
    error,
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
    getAvailableLanguages
  } = useSTT()

  const [selectedLanguage, setSelectedLanguage] = useState('en-US')
  const [showSettings, setShowSettings] = useState(false)

  // Update parent component when transcript changes
  useEffect(() => {
    if (transcript) {
      onTranscriptChange(transcript)
    }
  }, [transcript, onTranscriptChange])

  const handleStartListening = () => {
    if (disabled) return
    
    startListening({
      language: selectedLanguage,
      continuous: false,
      interimResults: true,
      maxAlternatives: 1
    })
  }

  const handleStopListening = () => {
    stopListening()
  }

  const handleClear = () => {
    clearTranscript()
    onTranscriptChange('')
  }

  const getConfidenceColor = (conf: number) => {
    if (conf > 0.8) return 'text-green-400'
    if (conf > 0.6) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getConfidenceText = (conf: number) => {
    if (conf > 0.8) return 'Excellent'
    if (conf > 0.6) return 'Good'
    if (conf > 0.4) return 'Fair'
    return 'Poor'
  }

  if (!isSupported) {
    return (
      <div className={`p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 ${className}`}>
        <div className="flex items-center space-x-2">
          <MicOff className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-yellow-400 font-medium">Voice Input Not Supported</span>
        </div>
        <p className="text-xs text-gray-300 mt-1">
          Speech recognition is not supported in your browser. Try using Chrome, Safari, or Edge.
        </p>
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Voice Input Area */}
      <div className="relative">
        <div className="relative">
          <textarea
            value={transcript || interimTranscript}
            onChange={(e) => onTranscriptChange(e.target.value)}
            placeholder={placeholder}
            className="input-field min-h-32 resize-none holographic text-gray-100 placeholder-gray-400 pr-20"
            disabled={disabled || isListening}
          />
          
          {/* Voice Controls Overlay */}
          <div className="absolute bottom-3 right-3 flex items-center space-x-2">
            {error && (
              <div className="text-xs text-red-400 bg-red-500/20 px-2 py-1 rounded">
                {error}
              </div>
            )}
            
            {confidence > 0 && (
              <div className={`text-xs px-2 py-1 rounded ${getConfidenceColor(confidence)} bg-gray-800/50`}>
                {getConfidenceText(confidence)} ({Math.round(confidence * 100)}%)
              </div>
            )}
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-1 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Voice Control Buttons */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-2">
            {isListening ? (
              <>
                <motion.button
                  onClick={handleStopListening}
                  className="btn-secondary flex items-center space-x-2"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Square className="w-4 h-4" />
                  <span>Stop Listening</span>
                </motion.button>
                
                <motion.div
                  className="flex items-center space-x-2 text-cyan-400"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <div className="w-2 h-2 bg-cyan-400 rounded-full" />
                  <span className="text-sm">Listening...</span>
                </motion.div>
              </>
            ) : (
              <button
                onClick={handleStartListening}
                disabled={disabled}
                className="btn-primary flex items-center space-x-2"
              >
                <Mic className="w-4 h-4" />
                <span>Start Voice Input</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {(transcript || interimTranscript) && (
              <button
                onClick={handleClear}
                className="btn-secondary text-xs flex items-center space-x-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-800/50 rounded-xl p-4 border border-cyan-500/30"
          >
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-200 flex items-center space-x-2">
                <Volume2 className="w-4 h-4" />
                <span>Voice Input Settings</span>
              </h4>
              
              <div>
                <label className="text-xs text-gray-400 block mb-2">Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  {getAvailableLanguages().map(lang => {
                    const [code, country] = lang.split('-')
                    const languageNames: Record<string, string> = {
                      'en': 'English',
                      'es': 'Spanish',
                      'fr': 'French',
                      'de': 'German',
                      'it': 'Italian',
                      'pt': 'Portuguese',
                      'ja': 'Japanese',
                      'ko': 'Korean',
                      'zh': 'Chinese',
                      'ru': 'Russian',
                      'ar': 'Arabic',
                      'hi': 'Hindi',
                      'nl': 'Dutch'
                    }
                    const countryNames: Record<string, string> = {
                      'US': 'United States',
                      'GB': 'United Kingdom',
                      'AU': 'Australia',
                      'CA': 'Canada',
                      'ES': 'Spain',
                      'MX': 'Mexico',
                      'FR': 'France',
                      'DE': 'Germany',
                      'IT': 'Italy',
                      'BR': 'Brazil',
                      'PT': 'Portugal',
                      'JP': 'Japan',
                      'KR': 'South Korea',
                      'CN': 'China',
                      'TW': 'Taiwan',
                      'RU': 'Russia',
                      'SA': 'Saudi Arabia',
                      'IN': 'India',
                      'NL': 'Netherlands'
                    }
                    return (
                      <option key={lang} value={lang}>
                        {languageNames[code] || code} ({countryNames[country] || country})
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="text-xs text-gray-400">
                <p>💡 <strong>Tips for better recognition:</strong></p>
                <ul className="mt-1 space-y-1">
                  <li>• Speak clearly and at a normal pace</li>
                  <li>• Minimize background noise</li>
                  <li>• Use natural language like "I need to go to the gym and prepare for tomorrow's meeting"</li>
                  <li>• The system will automatically convert your speech to structured tasks</li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interim Results Display */}
      {interimTranscript && !transcript && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30"
        >
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            <span className="text-xs text-cyan-400 font-medium">Listening...</span>
          </div>
          <p className="text-sm text-gray-300 italic">
            "{interimTranscript}"
          </p>
        </motion.div>
      )}
    </div>
  )
} 