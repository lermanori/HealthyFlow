import { useState, useEffect, useCallback } from 'react'
import { ttsService, TTSOptions, TTSState, TTSService } from '../services/ttsService'

export function useTTS() {
  const [state, setState] = useState<TTSState>(ttsService.getState())

  useEffect(() => {
    const unsubscribe = ttsService.subscribe(setState)
    return unsubscribe
  }, [])

  const speak = useCallback((text: string, options?: TTSOptions) => {
    if (!TTSService.isSupported()) {
      console.warn('TTS is not supported in this browser')
      return
    }
    ttsService.speak(text, options)
  }, [])

  const pause = useCallback(() => {
    ttsService.pause()
  }, [])

  const resume = useCallback(() => {
    ttsService.resume()
  }, [])

  const stop = useCallback(() => {
    ttsService.stop()
  }, [])

  const getVoices = useCallback(() => {
    return ttsService.getVoices()
  }, [])

  const getDefaultVoice = useCallback(() => {
    return ttsService.getDefaultVoice()
  }, [])

  const isSupported = TTSService.isSupported()

  return {
    // State
    isSpeaking: state.isSpeaking,
    currentText: state.currentText,
    progress: state.progress,
    availableVoices: state.availableVoices,
    
    // Actions
    speak,
    pause,
    resume,
    stop,
    getVoices,
    getDefaultVoice,
    
    // Utilities
    isSupported
  }
} 