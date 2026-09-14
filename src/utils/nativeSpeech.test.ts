import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

describe('iOS 26 on-device Talk dictation', () => {
  const plugin = read('ios/App/App/NativeSpeechPlugin.swift')
  const controller = read('ios/App/App/HealthyFlowViewController.swift')
  const info = read('ios/App/App/Info.plist')
  const service = read('src/services/sttService.ts')
  const talk = read('src/pages/AssistantPage.tsx')

  it('uses SpeechAnalyzer and its on-device model without SFSpeechRecognizer', () => {
    assert.match(plugin, /SpeechAnalyzer/)
    assert.match(plugin, /SpeechTranscriber/)
    assert.match(plugin, /AssetInventory\.assetInstallationRequest/)
    assert.match(plugin, /\.progressiveTranscription/)
    assert.doesNotMatch(plugin, /SFSpeechRecognizer/)
  })

  it('captures microphone buffers and publishes volatile and final text', () => {
    assert.match(plugin, /AVAudioEngine/)
    assert.match(plugin, /installTap\(onBus: 0/)
    assert.match(plugin, /reportingOptions|progressiveTranscription/)
    assert.match(plugin, /result\.isFinal/)
    assert.match(plugin, /notifyListeners\("transcript"/)
  })

  it('uses an input-compatible audio session instead of the playback-only spoken-audio mode', () => {
    assert.match(plugin, /setCategory\(\.record, mode: \.measurement\)/)
    assert.doesNotMatch(plugin, /setCategory\(\.record, mode: \.spokenAudio\)/)
  })

  it('registers the native bridge and declares a focused microphone purpose', () => {
    assert.match(controller, /registerPluginInstance\(NativeSpeechPlugin\(\)\)/)
    assert.match(info, /NSMicrophoneUsageDescription/)
    assert.match(info, /turn what you say into text on this device/)
    assert.doesNotMatch(info, /NSSpeechRecognitionUsageDescription/)
  })

  it('never falls back to browser recognition inside the iOS app', () => {
    assert.match(service, /if \(isNativeIOS\)/)
    assert.match(service, /NativeSpeech\.start/)
    assert.match(service, /never falls back to Web Speech/)
  })

  it('shows the Talk microphone on native iOS with explicit progress and errors', () => {
    assert.doesNotMatch(talk, /!isNativeIOS &&/)
    assert.match(talk, /aria-label=\{isPreparing \? 'Preparing dictation'/)
    assert.match(talk, /dictationStatus/)
    assert.match(talk, /role="alert"/)
  })
})
