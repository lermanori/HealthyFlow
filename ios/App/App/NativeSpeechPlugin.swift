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
    private let readyCueNode = AVAudioPlayerNode()
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var dictationTranscriber: DictationTranscriber?
    private var analyzerFormat: AVAudioFormat?
    private var audioConverter: AVAudioConverter?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var resultTask: Task<Void, Never>?
    private var tapInstalled = false
    private var preparing = false
    private var active = false
    private var finalizedTranscript = ""
    private var volatileTranscript = ""
    private var sessionGeneration = 0

    private enum TranscriptionEngine {
        case speech(Locale)
        case dictation(Locale)

        var locale: Locale {
            switch self {
            case .speech(let locale), .dictation(let locale): return locale
            }
        }
    }

    private func transcriptionEngine(for requested: Locale) async -> TranscriptionEngine? {
        if SpeechTranscriber.isAvailable,
           let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) {
            return .speech(locale)
        }
        if let locale = await DictationTranscriber.supportedLocale(equivalentTo: requested) {
            return .dictation(locale)
        }
        return nil
    }

    @objc func getAvailability(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            let requestedLocale = self.requestedLocale(call.getString("locale"))
            guard let engine = await self.transcriptionEngine(for: requestedLocale) else {
                call.resolve([
                    "available": false,
                    "reason": "Neither Apple on-device transcription engine supports this language on this device."
                ])
                return
            }
            let modelStatus: AssetInventory.Status
            let engineName: String
            switch engine {
            case .speech(let locale):
                let module = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
                modelStatus = await AssetInventory.status(forModules: [module])
                engineName = "speechTranscriber"
            case .dictation(let locale):
                let module = DictationTranscriber(locale: locale, preset: .progressiveShortDictation)
                modelStatus = await AssetInventory.status(forModules: [module])
                engineName = "dictationTranscriber"
            }
            guard modelStatus != .unsupported else {
                call.resolve([
                    "available": false,
                    "engine": engineName,
                    "reason": "Apple's on-device language model is unavailable."
                ])
                return
            }
            call.resolve([
                "available": true,
                "locale": engine.locale.identifier,
                "engine": engineName,
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
            self.sessionGeneration += 1
            let generation = self.sessionGeneration
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

            guard generation == self.sessionGeneration else {
                call.reject("Voice input was cancelled before listening started.", "speech_cancelled")
                return
            }

            do {
#if HANDSFREE_PROBE
                let readyCue = call.getBool("readyCue") ?? false
#else
                let readyCue = false
#endif
                let locale = try await self.startSession(localeIdentifier: call.getString("locale"), generation: generation, readyCue: readyCue)
                call.resolve(["locale": locale.identifier])
            } catch is CancellationError {
                call.reject("Voice input was cancelled before listening started.", "speech_cancelled")
            } catch let error as NativeSpeechError {
                guard generation == self.sessionGeneration else {
                    call.reject("Voice input was cancelled before listening started.", "speech_cancelled")
                    return
                }
                await self.cancelSession(clearTranscript: false)
                self.emitState("error", message: error.errorDescription ?? "Voice input failed.")
                call.reject(error.errorDescription ?? "Voice input failed.", error.code, error)
            } catch {
                guard generation == self.sessionGeneration else {
                    call.reject("Voice input was cancelled before listening started.", "speech_cancelled")
                    return
                }
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
    private func startSession(localeIdentifier: String?, generation: Int, readyCue: Bool) async throws -> Locale {
        let requested = requestedLocale(localeIdentifier)
        guard let engine = await transcriptionEngine(for: requested) else {
            throw NativeSpeechError.localeUnsupported
        }
        try checkGeneration(generation)

        let analyzer: SpeechAnalyzer
        let analyzerFormat: AVAudioFormat
        switch engine {
        case .speech(let locale):
            let module = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
            analyzer = SpeechAnalyzer(modules: [module])
            guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module]) else {
                throw NativeSpeechError.audioFormatUnavailable
            }
            analyzerFormat = format
            try checkGeneration(generation)
            let status = await AssetInventory.status(forModules: [module])
            try checkGeneration(generation)
            guard status != .unsupported else { throw NativeSpeechError.modelUnavailable }
            if status != .installed {
                emitState("downloading", message: "Downloading Apple’s on-device language model…")
                guard let installation = try await AssetInventory.assetInstallationRequest(supporting: [module]) else {
                    throw NativeSpeechError.modelUnavailable
                }
                try checkGeneration(generation)
                try await installation.downloadAndInstall()
                try checkGeneration(generation)
            }
            transcriber = module
        case .dictation(let locale):
            let module = DictationTranscriber(locale: locale, preset: .progressiveShortDictation)
            analyzer = SpeechAnalyzer(modules: [module])
            guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module]) else {
                throw NativeSpeechError.audioFormatUnavailable
            }
            analyzerFormat = format
            try checkGeneration(generation)
            let status = await AssetInventory.status(forModules: [module])
            try checkGeneration(generation)
            guard status != .unsupported else { throw NativeSpeechError.modelUnavailable }
            if status != .installed {
                emitState("downloading", message: "Downloading Apple’s on-device dictation model…")
                guard let installation = try await AssetInventory.assetInstallationRequest(supporting: [module]) else {
                    throw NativeSpeechError.modelUnavailable
                }
                try checkGeneration(generation)
                try await installation.downloadAndInstall()
                try checkGeneration(generation)
            }
            dictationTranscriber = module
        }

        let stream = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzer = analyzer
        self.analyzerFormat = analyzerFormat
        self.inputBuilder = stream.continuation
        self.finalizedTranscript = ""
        self.volatileTranscript = ""

        resultTask = Task { @MainActor [weak self] in
            do {
                switch engine {
                case .speech:
                    guard let module = self?.transcriber else { return }
                    for try await result in module.results {
                        guard let self, generation == self.sessionGeneration else { return }
                        self.acceptResult(String(result.text.characters), isFinal: result.isFinal)
                    }
                case .dictation:
                    guard let module = self?.dictationTranscriber else { return }
                    for try await result in module.results {
                        guard let self, generation == self.sessionGeneration else { return }
                        self.acceptResult(String(result.text.characters), isFinal: result.isFinal)
                    }
                }
            } catch is CancellationError {
                return
            } catch {
                guard let self, generation == self.sessionGeneration else { return }
                Task { @MainActor in
                    guard generation == self.sessionGeneration else { return }
                    await self.cancelSession(clearTranscript: false)
                    self.emitState("error", message: "Apple’s on-device transcription stopped unexpectedly.")
                }
            }
        }

        try await analyzer.start(inputSequence: stream.stream)
        try checkGeneration(generation)
        try startAudioCapture(analyzerFormat: analyzerFormat, readyCue: readyCue)
        preparing = false
        active = true
        if readyCue { try playReadyCue() }
        emitState("listening", message: "Listening on this device…")
        return engine.locale
    }

    @MainActor
    private func acceptResult(_ rawText: String, isFinal: Bool) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        if isFinal {
            finalizedTranscript = Self.join(finalizedTranscript, text)
            volatileTranscript = ""
        } else {
            volatileTranscript = text
        }
        emitTranscript(isFinal: isFinal)
    }

    @MainActor
    private func playReadyCue() throws {
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 6_615),
              let samples = buffer.floatChannelData?[0] else {
            throw NativeSpeechError.audioFormatUnavailable
        }
        buffer.frameLength = 6_615
        for index in 0..<Int(buffer.frameLength) {
            let progress = Float(index) / Float(buffer.frameLength)
            let envelope = min(1, progress * 25, (1 - progress) * 25)
            let seconds = Float(index) / 44_100
            samples[index] = 0.18 * envelope * sin(2 * .pi * 880 * seconds)
        }
        readyCueNode.scheduleBuffer(buffer, completionHandler: nil)
        readyCueNode.play()
    }

    @MainActor
    private func checkGeneration(_ generation: Int) throws {
        guard generation == sessionGeneration else { throw CancellationError() }
    }

    @MainActor
    private func startAudioCapture(analyzerFormat: AVAudioFormat, readyCue: Bool) throws {
        let audioSession = AVAudioSession.sharedInstance()
        if readyCue {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
        } else {
            try audioSession.setCategory(.record, mode: .measurement)
        }
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
        if readyCue {
            guard let cueFormat = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1) else {
                throw NativeSpeechError.audioFormatUnavailable
            }
            if !audioEngine.attachedNodes.contains(readyCueNode) {
                audioEngine.attach(readyCueNode)
            }
            audioEngine.connect(readyCueNode, to: audioEngine.mainMixerNode, format: cueFormat)
        }
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
        sessionGeneration += 1
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
        readyCueNode.stop()
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
        dictationTranscriber = nil
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
    case localeUnsupported
    case modelUnavailable
    case audioFormatUnavailable
    case microphoneUnavailable
    case audioConversionFailed

    var code: String {
        switch self {
        case .localeUnsupported: return "speech_locale_unsupported"
        case .modelUnavailable: return "speech_model_unavailable"
        case .audioFormatUnavailable: return "speech_audio_format_unavailable"
        case .microphoneUnavailable: return "microphone_unavailable"
        case .audioConversionFailed: return "speech_audio_conversion_failed"
        }
    }

    var errorDescription: String? {
        switch self {
        case .localeUnsupported:
            return "Neither Apple on-device transcription engine supports this language on this device."
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
