import AVFAudio
import Capacitor
import Speech

@objc(NativeSpeechPlugin)
public final class NativeSpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeSpeechPlugin"
    public let jsName = "NativeSpeech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private let audioEngine = AVAudioEngine()
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var analyzerFormat: AVAudioFormat?
    private var audioConverter: AVAudioConverter?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var resultTask: Task<Void, Never>?
    private var tapInstalled = false
    private var preparing = false
    private var active = false
    private var finalizedTranscript = ""
    private var volatileTranscript = ""

    @objc func getAvailability(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard SpeechTranscriber.isAvailable else {
                call.resolve([
                    "available": false,
                    "reason": "Apple on-device transcription is not available on this device."
                ])
                return
            }

            let requestedLocale = self.requestedLocale(call.getString("locale"))
            guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
                call.resolve([
                    "available": false,
                    "reason": "On-device transcription does not support this language."
                ])
                return
            }

            let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
            let modelStatus = await AssetInventory.status(forModules: [transcriber])
            guard modelStatus != .unsupported else {
                call.resolve([
                    "available": false,
                    "reason": "Apple's on-device language model is unavailable."
                ])
                return
            }
            call.resolve([
                "available": true,
                "locale": locale.identifier,
                "modelStatus": self.modelStatusName(modelStatus),
                "permission": self.permissionStatusName(AVAudioApplication.shared.recordPermission)
            ])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard !self.active, !self.preparing else {
                call.reject("Voice input is already listening.", "speech_already_listening")
                return
            }

            self.preparing = true
            self.emitState("preparing", message: "Preparing on-device voice input…")

            guard await self.requestMicrophonePermission() else {
                self.preparing = false
                self.emitState("error", message: "Microphone access is off. Enable it in iOS Settings.")
                call.reject(
                    "Microphone access is off. Enable it in iOS Settings.",
                    "microphone_permission_denied"
                )
                return
            }

            do {
                let locale = try await self.startSession(localeIdentifier: call.getString("locale"))
                call.resolve(["locale": locale.identifier])
            } catch let error as NativeSpeechError {
                await self.cancelSession(clearTranscript: false)
                self.emitState("error", message: error.errorDescription ?? "Voice input failed.")
                call.reject(error.errorDescription ?? "Voice input failed.", error.code, error)
            } catch {
                await self.cancelSession(clearTranscript: false)
                self.emitState("error", message: "Voice input could not start.")
                call.reject("Voice input could not start.", "speech_start_failed", error)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            guard self.active else {
                call.resolve(["text": self.combinedTranscript])
                return
            }

            do {
                try await self.finishSession()
                call.resolve(["text": self.combinedTranscript])
            } catch {
                await self.cancelSession(clearTranscript: false)
                self.emitState("error", message: "Voice input could not finish cleanly.")
                call.reject("Voice input could not finish cleanly.", "speech_stop_failed", error)
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.cancelSession(clearTranscript: true)
            call.resolve()
        }
    }

    @MainActor
    private func startSession(localeIdentifier: String?) async throws -> Locale {
        guard SpeechTranscriber.isAvailable else {
            throw NativeSpeechError.transcriberUnavailable
        }

        let requested = requestedLocale(localeIdentifier)
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
            throw NativeSpeechError.localeUnsupported
        }

        let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
            throw NativeSpeechError.audioFormatUnavailable
        }

        let modelStatus = await AssetInventory.status(forModules: [transcriber])
        if modelStatus != .installed {
            emitState("downloading", message: "Downloading Apple’s on-device language model…")
            guard let installation = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) else {
                throw NativeSpeechError.modelUnavailable
            }
            try await installation.downloadAndInstall()
        }

        let stream = AsyncStream<AnalyzerInput>.makeStream()
        self.transcriber = transcriber
        self.analyzer = analyzer
        self.analyzerFormat = analyzerFormat
        self.inputBuilder = stream.continuation
        self.finalizedTranscript = ""
        self.volatileTranscript = ""

        resultTask = Task { @MainActor [weak self, transcriber] in
            do {
                for try await result in transcriber.results {
                    guard let self else { return }
                    let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                    if result.isFinal {
                        self.finalizedTranscript = Self.join(self.finalizedTranscript, text)
                        self.volatileTranscript = ""
                    } else {
                        self.volatileTranscript = text
                    }
                    self.emitTranscript(isFinal: result.isFinal)
                }
            } catch is CancellationError {
                return
            } catch {
                guard let self else { return }
                Task { @MainActor in
                    await self.cancelSession(clearTranscript: false)
                    self.emitState("error", message: "Apple’s on-device transcription stopped unexpectedly.")
                }
            }
        }

        try await analyzer.start(inputSequence: stream.stream)
        try startAudioCapture(analyzerFormat: analyzerFormat)
        preparing = false
        active = true
        emitState("listening", message: "Listening on this device…")
        return locale
    }

    @MainActor
    private func startAudioCapture(analyzerFormat: AVAudioFormat) throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw NativeSpeechError.microphoneUnavailable
        }
        guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
            throw NativeSpeechError.audioFormatUnavailable
        }
        audioConverter = converter

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            do {
                let converted = try self.convert(buffer, with: converter, to: analyzerFormat)
                self.inputBuilder?.yield(AnalyzerInput(buffer: converted))
            } catch {
                DispatchQueue.main.async { [weak self] in
                    guard let self else { return }
                    Task { @MainActor in
                        await self.cancelSession(clearTranscript: false)
                        self.emitState("error", message: "Microphone audio could not be transcribed.")
                    }
                }
            }
        }
        tapInstalled = true
        audioEngine.prepare()
        try audioEngine.start()
    }

    private func convert(
        _ buffer: AVAudioPCMBuffer,
        with converter: AVAudioConverter,
        to outputFormat: AVAudioFormat
    ) throws -> AVAudioPCMBuffer {
        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
        guard let output = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else {
            throw NativeSpeechError.audioConversionFailed
        }

        var suppliedInput = false
        var conversionError: NSError?
        let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
            if suppliedInput {
                inputStatus.pointee = .noDataNow
                return nil
            }
            suppliedInput = true
            inputStatus.pointee = .haveData
            return buffer
        }

        if status == .error {
            throw conversionError ?? NativeSpeechError.audioConversionFailed
        }
        return output
    }

    @MainActor
    private func finishSession() async throws {
        stopAudioCapture()
        try await analyzer?.finalizeAndFinishThroughEndOfInput()
        await resultTask?.value
        resultTask = nil
        preparing = false
        active = false
        emitTranscript(isFinal: true)
        emitState("idle", message: nil)
        releaseSessionObjects()
    }

    @MainActor
    private func cancelSession(clearTranscript: Bool) async {
        stopAudioCapture()
        await analyzer?.cancelAndFinishNow()
        resultTask?.cancel()
        resultTask = nil
        preparing = false
        active = false
        if clearTranscript {
            finalizedTranscript = ""
            volatileTranscript = ""
            emitTranscript(isFinal: true)
        }
        emitState("idle", message: nil)
        releaseSessionObjects()
    }

    @MainActor
    private func stopAudioCapture() {
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        audioEngine.stop()
        inputBuilder?.finish()
        inputBuilder = nil
        audioConverter = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    @MainActor
    private func releaseSessionObjects() {
        analyzer = nil
        transcriber = nil
        analyzerFormat = nil
    }

    private func requestMicrophonePermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return true
        case .denied:
            return false
        case .undetermined:
            return await withCheckedContinuation { continuation in
                AVAudioApplication.requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        @unknown default:
            return false
        }
    }

    private func requestedLocale(_ identifier: String?) -> Locale {
        guard let identifier, !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return Locale.current
        }
        return Locale(identifier: identifier)
    }

    private var combinedTranscript: String {
        Self.join(finalizedTranscript, volatileTranscript)
    }

    private static func join(_ left: String, _ right: String) -> String {
        [left.trimmingCharacters(in: .whitespacesAndNewlines), right.trimmingCharacters(in: .whitespacesAndNewlines)]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func emitTranscript(isFinal: Bool) {
        notifyListeners("transcript", data: [
            "text": combinedTranscript,
            "finalized": finalizedTranscript,
            "volatile": volatileTranscript,
            "isFinal": isFinal
        ])
    }

    private func emitState(_ state: String, message: String?) {
        var data: [String: Any] = ["state": state]
        if let message {
            data["message"] = message
        }
        notifyListeners("stateChanged", data: data)
    }

    private func modelStatusName(_ status: AssetInventory.Status) -> String {
        switch status {
        case .unsupported: return "unsupported"
        case .supported: return "supported"
        case .downloading: return "downloading"
        case .installed: return "installed"
        @unknown default: return "unknown"
        }
    }

    private func permissionStatusName(_ permission: AVAudioApplication.recordPermission) -> String {
        switch permission {
        case .undetermined: return "notDetermined"
        case .denied: return "denied"
        case .granted: return "granted"
        @unknown default: return "unknown"
        }
    }
}

private enum NativeSpeechError: LocalizedError {
    case transcriberUnavailable
    case localeUnsupported
    case modelUnavailable
    case audioFormatUnavailable
    case microphoneUnavailable
    case audioConversionFailed

    var code: String {
        switch self {
        case .transcriberUnavailable: return "speech_transcriber_unavailable"
        case .localeUnsupported: return "speech_locale_unsupported"
        case .modelUnavailable: return "speech_model_unavailable"
        case .audioFormatUnavailable: return "speech_audio_format_unavailable"
        case .microphoneUnavailable: return "microphone_unavailable"
        case .audioConversionFailed: return "speech_audio_conversion_failed"
        }
    }

    var errorDescription: String? {
        switch self {
        case .transcriberUnavailable:
            return "Apple on-device transcription is not available on this device."
        case .localeUnsupported:
            return "On-device transcription does not support this language."
        case .modelUnavailable:
            return "The on-device language model could not be installed."
        case .audioFormatUnavailable:
            return "The microphone audio format is not supported for transcription."
        case .microphoneUnavailable:
            return "The microphone is not available."
        case .audioConversionFailed:
            return "Microphone audio could not be prepared for transcription."
        }
    }
}
