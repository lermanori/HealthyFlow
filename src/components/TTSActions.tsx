import { Play, Pause, Square, Volume2, Loader2 } from 'lucide-react'
import { useTTS } from '../hooks/useTTS'

interface TTSActionsProps {
  suggestions: any[]
  onSpeakResults: () => void
  className?: string
}

export default function TTSActions({ 
  suggestions, 
  onSpeakResults, 
  className = "" 
}: TTSActionsProps) {
  const { isSpeaking, pause, resume, stop } = useTTS()

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {isSpeaking ? (
        <>
          <button
            onClick={pause}
            className="btn-secondary text-xs flex items-center space-x-1"
          >
            <Pause className="w-3 h-3" />
            <span>Pause</span>
          </button>
          <button
            onClick={resume}
            className="btn-secondary text-xs flex items-center space-x-1"
          >
            <Play className="w-3 h-3" />
            <span>Resume</span>
          </button>
          <button
            onClick={stop}
            className="btn-secondary text-xs flex items-center space-x-1"
          >
            <Square className="w-3 h-3" />
            <span>Stop</span>
          </button>
        </>
      ) : (
        <button
          onClick={onSpeakResults}
          className="btn-secondary text-xs flex items-center space-x-1"
          disabled={suggestions.length === 0}
        >
          <Volume2 className="w-3 h-3" />
          <span>Speak Results</span>
        </button>
      )}

      {/* Speaking Indicator */}
      {isSpeaking && (
        <div className="flex items-center space-x-1 text-cyan-400">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
          <span className="text-xs">Speaking...</span>
        </div>
      )}
    </div>
  )
} 