import { useState, useEffect, useCallback } from 'react'
import { sttService, STTOptions, STTState, STTService } from '../services/sttService'

export function useSTT() {
  const [state, setState] = useState<STTState>(sttService.getState())

  useEffect(() => {
    const unsubscribe = sttService.subscribe(setState)
    return unsubscribe
  }, [])

  const startListening = useCallback((options?: STTOptions) => {
    if (!STTService.isSupported()) {
      console.warn('Speech recognition is not supported in this browser')
      return
    }
    try {
      sttService.start(options)
    } catch (error) {
      console.error('Failed to start speech recognition:', error)
    }
  }, [])

  const stopListening = useCallback(() => {
    sttService.stop()
  }, [])

  const abortListening = useCallback(() => {
    sttService.abort()
  }, [])

  const clearTranscript = useCallback(() => {
    sttService.clear()
  }, [])

  const getAvailableLanguages = useCallback(() => {
    return STTService.getAvailableLanguages()
  }, [])

  return {
    // State
    isListening: state.isListening,
    isSupported: state.isSupported,
    transcript: state.transcript,
    interimTranscript: state.interimTranscript,
    confidence: state.confidence,
    error: state.error,
    
    // Actions
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
    getAvailableLanguages
  }
} 