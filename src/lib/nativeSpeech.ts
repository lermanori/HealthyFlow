import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export type NativeSpeechAvailability = {
  available: boolean
  locale?: string
  modelStatus?: 'unsupported' | 'supported' | 'downloading' | 'installed' | 'unknown'
  permission?: 'notDetermined' | 'denied' | 'granted' | 'unknown'
  reason?: string
}

export type NativeSpeechTranscriptEvent = {
  text: string
  finalized: string
  volatile: string
  isFinal: boolean
}

export type NativeSpeechStateEvent = {
  state: 'preparing' | 'downloading' | 'listening' | 'idle' | 'error'
  message?: string
}

interface NativeSpeechPlugin {
  getAvailability(options?: { locale?: string }): Promise<NativeSpeechAvailability>
  start(options?: { locale?: string }): Promise<{ locale: string }>
  stop(): Promise<{ text: string }>
  cancel(): Promise<void>
  addListener(
    eventName: 'transcript',
    listener: (event: NativeSpeechTranscriptEvent) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'stateChanged',
    listener: (event: NativeSpeechStateEvent) => void,
  ): Promise<PluginListenerHandle>
}

export const NativeSpeech = registerPlugin<NativeSpeechPlugin>('NativeSpeech')
