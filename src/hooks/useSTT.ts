import { useState, useEffect, useCallback } from 'react'
import { sttService, STTOptions, STTState, STTService } from '../services/sttService'

export function useSTT() {
  const [state, setState] = useState<STTState>(sttService.getState())

  useEffect(() => {
    const unsubscribe = sttService.subscribe(setState)
    return unsubscribe
  }, [])

  const startListening = useCallback(async (options?: STTOptions) => {
    if (!STTService.isSupported()) {
      console.warn('Speech recognition is not supported on this device')
      return
    }
    try {
      await sttService.start(options)
    } catch (error) {
      console.error('Failed to start speech recognition:', error)
    }
  }, [])

  const stopListening = useCallback(async () => {
    await sttService.stop()
  }, [])

  const abortListening = useCallback(async () => {
    await sttService.abort()
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
    isPreparing: state.isPreparing,
    isSupported: state.isSupported,
    transcript: state.transcript,
    interimTranscript: state.interimTranscript,
    confidence: state.confidence,
    error: state.error,
    statusMessage: state.statusMessage,
    
    // Actions
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
    getAvailableLanguages
  }
}
