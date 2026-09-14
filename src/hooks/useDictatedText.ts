import { Dispatch, SetStateAction, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useSTT } from './useSTT'
import { isNativeIOS } from '../lib/native'

interface UseDictatedTextOptions {
  text: string
  setText: Dispatch<SetStateAction<string>>
  disabled?: boolean
}

export function useDictatedText({ text, setText, disabled = false }: UseDictatedTextOptions) {
  const dictatedBaseTextRef = useRef('')
  const {
    isListening,
    isPreparing,
    isSupported,
    transcript,
    interimTranscript,
    error,
    statusMessage,
    startListening,
    stopListening,
    clearTranscript,
  } = useSTT()

  useEffect(() => {
    const dictatedText = [transcript.trim(), interimTranscript.trim()].filter(Boolean).join(' ')
    if (!dictatedText) return

    setText([dictatedBaseTextRef.current, dictatedText.trim()].filter(Boolean).join(' '))
  }, [interimTranscript, setText, transcript])

  const toggleDictation = () => {
    if (disabled) return
    if (!isSupported) {
      toast.error(
        isNativeIOS
          ? "Apple's on-device transcription is unavailable for this device or language."
          : 'Dictation is not supported in this browser',
      )
      return
    }
    if (isListening) {
      void stopListening()
      return
    }

    if (isPreparing) return

    dictatedBaseTextRef.current = text.trim()
    clearTranscript()
    void startListening({
      language: navigator.language || 'en-US',
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
    })
  }

  return {
    isListening,
    isPreparing,
    isDictationSupported: isSupported,
    dictationError: error,
    dictationStatus: statusMessage,
    toggleDictation,
    clearTranscript,
  }
}
