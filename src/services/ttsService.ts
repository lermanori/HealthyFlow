export interface TTSOptions {
  voice?: string
  rate?: number
  pitch?: number
  volume?: number
}

export interface TTSState {
  isSpeaking: boolean
  isPaused: boolean
  currentText: string
  progress: number
  availableVoices: SpeechSynthesisVoice[]
  error: string | null
}

export class TTSService {
  private speechSynthesis: SpeechSynthesis | null
  private state: TTSState = {
    isSpeaking: false,
    isPaused: false,
    currentText: '',
    progress: 0,
    availableVoices: [],
    error: null,
  }
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private listeners: ((state: TTSState) => void)[] = []

  constructor() {
    this.speechSynthesis = TTSService.isSupported() ? window.speechSynthesis : null
    if (this.speechSynthesis) this.initializeVoices()
  }

  private initializeVoices() {
    const speechSynthesis = this.speechSynthesis
    if (!speechSynthesis) return
    // Load voices when they become available
    const loadVoices = () => {
      this.state.availableVoices = speechSynthesis.getVoices()
      this.notifyListeners()
    }

    // Handle voice loading
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices
    }
    
    // Initial load
    loadVoices()
  }

  speak(text: string, options: TTSOptions = {}) {
    if (!this.speechSynthesis || !TTSService.isSupported()) return
    // Stop any current speech
    this.stop()

    const utterance = new SpeechSynthesisUtterance(text)
    this.currentUtterance = utterance
    this.state.currentText = text
    this.state.isSpeaking = false
    this.state.isPaused = false
    this.state.progress = 0
    this.state.error = null
    this.notifyListeners()
    
    // Set voice
    if (options.voice) {
      const voice = this.state.availableVoices.find(v => v.name === options.voice)
      if (voice) {
        utterance.voice = voice
      }
    }

    // Set properties
    utterance.rate = options.rate || 1.0
    utterance.pitch = options.pitch || 1.0
    utterance.volume = options.volume || 1.0

    // Event handlers
    utterance.onstart = () => {
      if (this.currentUtterance !== utterance) return
      this.state.isSpeaking = true
      this.state.isPaused = false
      this.state.currentText = text
      this.state.progress = 0
      this.notifyListeners()
    }

    utterance.onend = () => {
      if (this.currentUtterance !== utterance) return
      this.currentUtterance = null
      this.state.isSpeaking = false
      this.state.isPaused = false
      this.state.currentText = ''
      this.state.progress = 100
      this.notifyListeners()
    }

    utterance.onpause = () => {
      if (this.currentUtterance !== utterance) return
      this.state.isSpeaking = false
      this.state.isPaused = true
      this.notifyListeners()
    }

    utterance.onresume = () => {
      if (this.currentUtterance !== utterance) return
      this.state.isSpeaking = true
      this.state.isPaused = false
      this.notifyListeners()
    }

    utterance.onerror = (event) => {
      if (this.currentUtterance !== utterance) return
      this.currentUtterance = null
      console.error('TTS playback failed', { error: event.error })
      this.state.isSpeaking = false
      this.state.isPaused = false
      this.state.currentText = ''
      this.state.error = event.error || 'playback_failed'
      this.notifyListeners()
    }

    // Start speaking
    this.speechSynthesis.speak(utterance)
  }

  pause() {
    if (this.speechSynthesis && this.currentUtterance && this.state.isSpeaking) {
      this.speechSynthesis.pause()
      this.state.isSpeaking = false
      this.state.isPaused = true
      this.notifyListeners()
    }
  }

  resume() {
    if (this.speechSynthesis && this.currentUtterance && this.state.isPaused) {
      this.speechSynthesis.resume()
      this.state.isSpeaking = true
      this.state.isPaused = false
      this.notifyListeners()
    }
  }

  stop() {
    if (!this.speechSynthesis) return
    if (this.currentUtterance || this.speechSynthesis.speaking || this.speechSynthesis.paused) {
      this.currentUtterance = null
      this.speechSynthesis.cancel()
      this.state.isSpeaking = false
      this.state.isPaused = false
      this.state.currentText = ''
      this.state.progress = 0
      this.notifyListeners()
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.state.availableVoices
  }

  getState(): TTSState {
    return { ...this.state }
  }

  subscribe(listener: (state: TTSState) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.getState()))
  }

  // Utility method to check if TTS is supported
  static isSupported(): boolean {
    return typeof window !== 'undefined'
      && Boolean(window.speechSynthesis)
      && typeof window.SpeechSynthesisUtterance === 'function'
  }

  // Get default voice for the current language
  getDefaultVoice(): SpeechSynthesisVoice | null {
    const userLanguage = navigator.language || 'en-US'
    return this.state.availableVoices.find(voice => 
      voice.lang.startsWith(userLanguage.split('-')[0])
    ) || this.state.availableVoices[0] || null
  }
}

// Create singleton instance
export const ttsService = new TTSService()
