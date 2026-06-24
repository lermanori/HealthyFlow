import { Dispatch, SetStateAction, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useSTT } from './useSTT'

interface UseDictatedTextOptions {
  text: string
  setText: Dispatch<SetStateAction<string>>
  disabled?: boolean
}

export function useDictatedText({ text, setText, disabled = false }: UseDictatedTextOptions) {
  const dictatedBaseTextRef = useRef('')
  const {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearTranscript,
  } = useSTT()

  useEffect(() => {
    const dictatedText = transcript || interimTranscript
    if (!dictatedText) return

    setText([dictatedBaseTextRef.current, dictatedText.trim()].filter(Boolean).join(' '))
  }, [interimTranscript, setText, transcript])

  const toggleDictation = () => {
    if (disabled) return
    if (!isSupported) {
      toast.error('Dictation is not supported in this browser')
      return
    }
    if (isListening) {
      stopListening()
      return
    }

    dictatedBaseTextRef.current = text.trim()
    clearTranscript()
    startListening({
      language: 'en-US',
      continuous: false,
      interimResults: true,
      maxAlternatives: 1,
    })
  }

  return {
    isListening,
    isDictationSupported: isSupported,
    dictationError: error,
    toggleDictation,
    clearTranscript,
  }
}
