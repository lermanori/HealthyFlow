import { isNativeIOS } from '../lib/native'
import {
  NativeSpeech,
  type NativeSpeechStateEvent,
  type NativeSpeechTranscriptEvent,
} from '../lib/nativeSpeech'

export interface STTOptions {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
}

export interface STTState {
  isListening: boolean
  isPreparing: boolean
  isSupported: boolean
  transcript: string
  interimTranscript: string
  confidence: number
  error: string | null
  statusMessage: string | null
}

export class STTService {
  private recognition: SpeechRecognition | null = null
  private state: STTState = {
    isListening: false,
    isPreparing: false,
    isSupported: false,
    transcript: '',
    interimTranscript: '',
    confidence: 0,
    error: null,
    statusMessage: null,
  }
  private listeners: ((state: STTState) => void)[] = []
  private nativeSetup: Promise<void> | null = null

  constructor() {
    if (isNativeIOS) {
      // The iOS app has a 26.0 deployment floor and uses Apple's native,
      // on-device SpeechAnalyzer exclusively. It never falls back to Web Speech.
      this.state.isSupported = true
      this.nativeSetup = this.initializeNativeRecognition()
    } else {
      this.initializeBrowserRecognition()
    }
  }

  private initializeBrowserRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition()
      this.state.isSupported = true
      this.setupEventHandlers()
    } else {
      this.state.isSupported = false
      this.state.error = 'Speech recognition is not supported in this browser'
    }
    
    this.notifyListeners()
  }

  private async initializeNativeRecognition() {
    try {
      await NativeSpeech.addListener('transcript', (event: NativeSpeechTranscriptEvent) => {
        this.state.transcript = event.finalized
        this.state.interimTranscript = event.volatile
        this.state.confidence = 0
        this.notifyListeners()
      })
      await NativeSpeech.addListener('stateChanged', (event: NativeSpeechStateEvent) => {
        this.applyNativeState(event)
      })

      const availability = await NativeSpeech.getAvailability({ locale: navigator.language })
      this.state.isSupported = availability.available
      this.state.error = availability.available
        ? null
        : availability.reason || 'Apple on-device transcription is unavailable'
      this.notifyListeners()
    } catch (error) {
      this.state.isSupported = false
      this.state.error = this.errorMessage(error, 'Apple on-device transcription is unavailable')
      this.notifyListeners()
    }
  }

  private applyNativeState(event: NativeSpeechStateEvent) {
    this.state.isPreparing = event.state === 'preparing' || event.state === 'downloading'
    this.state.isListening = event.state === 'listening'
    this.state.statusMessage = event.state === 'idle' ? null : event.message || null
    if (event.state === 'error') {
      this.state.error = event.message || 'Voice input failed'
    } else if (event.state !== 'idle') {
      this.state.error = null
    }
    this.notifyListeners()
  }

  private errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message.trim()) return error.message
    if (typeof error === 'object' && error !== null && 'message' in error) {
      const message = String((error as { message?: unknown }).message || '').trim()
      if (message) return message
    }
    return fallback
  }

  private setupEventHandlers() {
    if (!this.recognition) return

    this.recognition.onstart = () => {
      this.state.isListening = true
      this.state.error = null
      this.notifyListeners()
    }

    this.recognition.onend = () => {
      this.state.isListening = false
      this.notifyListeners()
    }

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      let interimTranscript = ''
      let confidence = 0

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        const isFinal = event.results[i].isFinal
        
        if (isFinal) {
          finalTranscript += transcript
          confidence = Math.max(confidence, event.results[i][0].confidence)
        } else {
          interimTranscript += transcript
        }
      }

      this.state.transcript = finalTranscript
      this.state.interimTranscript = interimTranscript
      this.state.confidence = confidence
      this.notifyListeners()
    }

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.state.isListening = false
      this.state.error = this.getErrorMessage(event.error)
      this.notifyListeners()
    }

    this.recognition.onnomatch = () => {
      this.state.isListening = false
      this.state.error = 'No speech was recognized'
      this.notifyListeners()
    }
  }

  private getErrorMessage(error: string): string {
    switch (error) {
      case 'no-speech':
        return 'No speech was detected'
      case 'audio-capture':
        return 'Audio capture failed'
      case 'not-allowed':
        return 'Microphone access denied'
      case 'network':
        return 'Network error occurred'
      case 'service-not-allowed':
        return 'Speech recognition service not allowed'
      case 'bad-grammar':
        return 'Bad grammar in speech'
      case 'language-not-supported':
        return 'Language not supported'
      default:
        return `Speech recognition error: ${error}`
    }
  }

  async start(options: STTOptions = {}) {
    if (isNativeIOS) {
      await this.nativeSetup
      if (!this.state.isSupported) {
        throw new Error(this.state.error || 'Apple on-device transcription is unavailable')
      }
      this.state.transcript = ''
      this.state.interimTranscript = ''
      this.state.confidence = 0
      this.state.error = null
      this.notifyListeners()
      try {
        await NativeSpeech.start({ locale: options.language || navigator.language })
      } catch (error) {
        this.state.isPreparing = false
        this.state.isListening = false
        this.state.error = this.errorMessage(error, 'Voice input could not start')
        this.state.statusMessage = null
        this.notifyListeners()
        throw error
      }
      return
    }

    if (!this.recognition || !this.state.isSupported) {
      throw new Error('Speech recognition is not supported')
    }

    // Clear previous state
    this.state.transcript = ''
    this.state.interimTranscript = ''
    this.state.confidence = 0
    this.state.error = null
    this.state.statusMessage = null

    // Configure recognition
    this.recognition.lang = options.language || navigator.language || 'en-US'
    this.recognition.continuous = options.continuous ?? false
    this.recognition.interimResults = options.interimResults ?? true
    this.recognition.maxAlternatives = options.maxAlternatives ?? 1

    try {
      this.recognition.start()
    } catch (error) {
      this.state.error = `Failed to start speech recognition: ${error}`
      this.notifyListeners()
      throw error
    }
  }

  async stop() {
    if (isNativeIOS) {
      await NativeSpeech.stop()
      return
    }
    if (this.recognition && this.state.isListening) {
      this.recognition.stop()
    }
  }

  async abort() {
    if (isNativeIOS) {
      await NativeSpeech.cancel()
      return
    }
    if (this.recognition && this.state.isListening) {
      this.recognition.abort()
    }
  }

  clear() {
    this.state.transcript = ''
    this.state.interimTranscript = ''
    this.state.confidence = 0
    this.state.error = null
    this.state.statusMessage = null
    this.notifyListeners()
  }

  getState(): STTState {
    return { ...this.state }
  }

  subscribe(listener: (state: STTState) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()))
  }

  // Utility method to check if STT is supported
  static isSupported(): boolean {
    if (isNativeIOS) return true
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  // Get available languages (this is a simplified version)
  static getAvailableLanguages(): string[] {
    return [
      'en-US', 'en-GB', 'en-AU', 'en-CA',
      'es-ES', 'es-MX', 'fr-FR', 'fr-CA',
      'de-DE', 'it-IT', 'pt-BR', 'pt-PT',
      'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW',
      'ru-RU', 'ar-SA', 'hi-IN', 'nl-NL'
    ]
  }
}

// Create singleton instance
export const sttService = new STTService()
