export interface TTSOptions {
  voice?: string
  rate?: number
  pitch?: number
  volume?: number
}

export interface TTSState {
  isSpeaking: boolean
  currentText: string
  progress: number
  availableVoices: SpeechSynthesisVoice[]
}

export class TTSService {
  private speechSynthesis: SpeechSynthesis
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private state: TTSState = {
    isSpeaking: false,
    currentText: '',
    progress: 0,
    availableVoices: []
  }
  private listeners: ((state: TTSState) => void)[] = []

  constructor() {
    this.speechSynthesis = window.speechSynthesis
    this.initializeVoices()
  }

  private initializeVoices() {
    // Load voices when they become available
    const loadVoices = () => {
      this.state.availableVoices = this.speechSynthesis.getVoices()
      this.notifyListeners()
    }

    // Handle voice loading
    if (this.speechSynthesis.onvoiceschanged !== undefined) {
      this.speechSynthesis.onvoiceschanged = loadVoices
    }
    
    // Initial load
    loadVoices()
  }

  speak(text: string, options: TTSOptions = {}) {
    // Stop any current speech
    this.stop()

    const utterance = new SpeechSynthesisUtterance(text)
    
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
      this.state.isSpeaking = true
      this.state.currentText = text
      this.state.progress = 0
      this.currentUtterance = utterance
      this.notifyListeners()
    }

    utterance.onend = () => {
      this.state.isSpeaking = false
      this.state.currentText = ''
      this.state.progress = 100
      this.currentUtterance = null
      this.notifyListeners()
    }

    utterance.onpause = () => {
      this.state.isSpeaking = false
      this.notifyListeners()
    }

    utterance.onresume = () => {
      this.state.isSpeaking = true
      this.notifyListeners()
    }

    utterance.onerror = (event) => {
      console.error('TTS Error:', event)
      this.state.isSpeaking = false
      this.state.currentText = ''
      this.currentUtterance = null
      this.notifyListeners()
    }

    // Start speaking
    this.speechSynthesis.speak(utterance)
  }

  pause() {
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.pause()
    }
  }

  resume() {
    if (this.speechSynthesis.paused) {
      this.speechSynthesis.resume()
    }
  }

  stop() {
    if (this.speechSynthesis.speaking || this.speechSynthesis.paused) {
      this.speechSynthesis.cancel()
      this.state.isSpeaking = false
      this.state.currentText = ''
      this.state.progress = 0
      this.currentUtterance = null
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
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
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