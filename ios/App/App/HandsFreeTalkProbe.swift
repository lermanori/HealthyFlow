// Opt-in #317 hands-free Talk adapter. Not included in ordinary builds.
#if HANDSFREE_PROBE
import ActivityKit
import AppIntents
@preconcurrency import AVFAudio
import Capacitor

private let entryKey = "healthyflow.handsFreeProbe.pending"
private let entryNotification = Notification.Name("HealthyFlowHandsFreeProbeEntry")
private let audioDiagnosticKey = "healthyflow.handsFreeProbe.lastAudioDiagnostic"
private let bridgeProbeNotification = Notification.Name("HealthyFlowLockedBridgeProbe")
private let bridgeProbeAckKey = "healthyflow.handsFreeProbe.bridgeAck"
private let lockedTaskDraftNotification = Notification.Name("HealthyFlowLockedTaskDraft")
private let lockedTaskDecisionNotification = Notification.Name("HealthyFlowLockedTaskDecision")
private let lockedTaskDiagnosticKey = "healthyflow.handsFreeProbe.lastTaskDiagnostic"

private func saveLockedTaskDiagnostic(_ stage: String, _ detail: String) {
    UserDefaults.standard.set([
        "stage": stage,
        "detail": detail,
        "at": Date().timeIntervalSince1970
    ] as [String: Any], forKey: lockedTaskDiagnosticKey)
}

@MainActor
private enum LockedTaskExchange {
    enum Reply {
        case ready(String)
        case clarification(String)
        case completed
        case failed(String)
    }

    static var activeId: String?
    static var reply: Reply?

    static func begin(_ id: String) -> Bool {
        guard activeId == nil else { return false }
        activeId = id
        reply = nil
        return true
    }

    static func accept(_ id: String, _ result: Reply) -> Bool {
        guard activeId == id, reply == nil else { return false }
        reply = result
        return true
    }

    static func wait(_ id: String, onTick: ((Int) -> Void)? = nil) async -> Reply {
        for tick in 0..<450 {
            if activeId != id { return .failed("The voice session changed before it finished.") }
            if let result = reply {
                reply = nil
                return result
            }
            if tick > 0 && tick % 50 == 0 { onTick?(tick / 10) }
            do { try await Task.sleep(nanoseconds: 100_000_000) }
            catch { return .failed("The voice session was interrupted.") }
        }
        return .failed("HealthyFlow did not respond within 45 seconds. Check Talk before trying again.")
    }

    static func end(_ id: String) {
        if activeId == id { activeId = nil; reply = nil }
    }
}

private func saveAudioDiagnostic(_ status: String, _ message: String) {
    UserDefaults.standard.set([
        "status": status,
        "message": message,
        "at": Date().timeIntervalSince1970
    ] as [String: Any], forKey: audioDiagnosticKey)
}

struct StartTalkProbeIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Talk"
    static var description = IntentDescription("Open HealthyFlow, speak a Task, and confirm it before saving.")
    static var supportedModes: IntentModes { .foreground(.immediate) }

    @MainActor
    func perform() async throws -> some IntentResult {
        UserDefaults.standard.set([
            "id": UUID().uuidString,
            "createdAt": Date().timeIntervalSince1970
        ], forKey: entryKey)
        NotificationCenter.default.post(name: entryNotification, object: nil)
        return .result()
    }
}

// #317: isolate locked Siri entry from the foreground Talk adapter. Siri owns
// this one-utterance test; it neither opens the web view nor writes a Task.
struct LockedTalkEntryProbeIntent: AppIntent {
    static var title: LocalizedStringResource = "Test Locked Talk"
    static var description = IntentDescription("Check whether Siri can hear an idea while the phone stays locked. Nothing is saved.")
    static var isDiscoverable: Bool { false }
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @Parameter(title: "Idea", requestValueDialog: "What would you like to remember?")
    var idea: String

    static var parameterSummary: some ParameterSummary {
        Summary("Test locked Talk with \(\.$idea)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        return .result(dialog: "I heard your idea. This was a test; no Task was saved.")
    }
}

// Siri owns both microphone turns. This checks whether a locked user can hear
// an idea read back and answer aloud before any HealthyFlow write is attempted.
struct LockedPlanConfirmationProbeIntent: AppIntent {
    static var title: LocalizedStringResource = "Test Locked Plan"
    static var description = IntentDescription("Dictate an idea and confirm its readback while locked. Nothing is saved.")
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @Parameter(title: "Idea", requestValueDialog: "What would you like to remember?")
    var idea: String

    static var parameterSummary: some ParameterSummary {
        Summary("Test locked plan with \(\.$idea)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        try await requestConfirmation(
            actionName: .continue,
            dialog: "I heard: \(idea). Is that right?"
        )
        return .result(dialog: "Confirmed. This was a test; nothing was saved.")
    }
}

// Isolates Siri's open-ended second speech turn from Talk's network latency.
// This intent does not call HealthyFlow services or save anything.
struct LockedClarificationProbeIntent: AppIntent {
    static var title: LocalizedStringResource = "Test Locked Follow-up"
    static var description = IntentDescription("Check whether Siri asks for one more detail while locked. Nothing is saved.")
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @Parameter(title: "Idea", requestValueDialog: "What Task are you thinking about?")
    var idea: String

    @Parameter(title: "More detail")
    var moreDetail: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Test a follow-up for \(\.$idea)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        saveLockedTaskDiagnostic("follow_up_probe", "Asking Siri for another spoken detail without calling Talk.")
        do {
            let detail = try await $moreDetail.requestValue("What detail should I add?")
            saveLockedTaskDiagnostic("follow_up_probe_succeeded", "Siri returned the second spoken detail. Nothing was saved.")
            return .result(dialog: detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "I did not hear a detail. Nothing was saved."
                : "I heard the extra detail. Nothing was saved.")
        } catch {
            let failure = error as NSError
            saveLockedTaskDiagnostic("follow_up_probe_failed", "\(failure.domain) (\(failure.code)): \(failure.localizedDescription)")
            return .result(dialog: "Siri could not collect another detail. Nothing was saved.")
        }
    }
}

// No-save feasibility check for whether the existing WKWebView write path can
// respond while Siri is running an App Intent on a locked phone.
struct LockedWebBridgeProbeIntent: AppIntent {
    static var title: LocalizedStringResource = "Test Locked Bridge"
    static var description = IntentDescription("Check whether HealthyFlow's Local-day bridge is awake while locked. Nothing is saved.")
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let id = UUID().uuidString
        UserDefaults.standard.removeObject(forKey: bridgeProbeAckKey)
        NotificationCenter.default.post(name: bridgeProbeNotification, object: id)
        for _ in 0..<30 {
            if UserDefaults.standard.string(forKey: bridgeProbeAckKey) == id {
                return .result(dialog: "The Local-day web bridge responded while locked. No Task was saved.")
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        return .result(dialog: "The Local-day web bridge did not respond while locked. No Task was saved.")
    }
}

// This Debug slice delegates AI proposal, confirmation and Local-day persistence
// to the existing Talk web path. Swift owns only Siri's microphone/dialog turns.
struct LockedTaskSaveProbeIntent: AppIntent, ProgressReportingIntent {
    static var title: LocalizedStringResource = "Save One Task by Voice"
    static var description = IntentDescription("Dictate one Task, approve the plan aloud, and save it to HealthyFlow.")
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @Parameter(title: "Task idea", requestValueDialog: "What Task should I prepare?")
    var idea: String

    @Parameter(title: "More Task details")
    var moreDetails: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Prepare one Task from \(\.$idea)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        progress.totalUnitCount = 3
        progress.completedUnitCount = 1
        progress.localizedDescription = "Preparing a HealthyFlow Task"
        let id = UUID().uuidString
        saveLockedTaskDiagnostic("started", "Siri captured the first idea; waiting for Talk.")
        guard LockedTaskExchange.begin(id) else {
            return .result(dialog: "Another HealthyFlow voice Task is still running. Nothing was saved.")
        }
        defer { LockedTaskExchange.end(id) }

        let tick: (Int) -> Void = { seconds in
            progress.localizedAdditionalDescription = "Waiting for Talk: \(seconds) seconds"
        }
        NotificationCenter.default.post(name: lockedTaskDraftNotification, object: ["id": id, "idea": idea, "turn": "1"])
        var draft = await LockedTaskExchange.wait(id, onTick: tick)
        if case .clarification(let question) = draft {
            saveLockedTaskDiagnostic("awaiting_spoken_clarification", "Talk asked a question; Siri is requesting another spoken value.")
            let details: String
            do {
                details = try await $moreDetails.requestValue("\(question)")
            } catch {
                let failure = error as NSError
                saveLockedTaskDiagnostic("spoken_clarification_failed", "\(failure.domain) (\(failure.code)): \(failure.localizedDescription)")
                return .result(dialog: "No Task was saved. Talk still needs more details.")
            }
            saveLockedTaskDiagnostic("spoken_clarification_received", "Siri returned the second spoken detail; waiting for Talk again.")
            guard !details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return .result(dialog: "I did not hear more details. No Task was saved.")
            }
            NotificationCenter.default.post(name: lockedTaskDraftNotification, object: ["id": id, "idea": details, "turn": "2"])
            draft = await LockedTaskExchange.wait(id, onTick: tick)
        }
        let summary: String
        switch draft {
        case .ready(let text):
            summary = text
            saveLockedTaskDiagnostic("proposal_ready", "Talk returned a Task proposal; Siri is asking for confirmation.")
            progress.completedUnitCount = 2
            progress.localizedDescription = "Confirm the HealthyFlow Task"
        case .clarification(let question): return .result(dialog: "Talk still needs more details: \(question) No Task was saved.")
        case .failed(let message): return .result(dialog: "I could not prepare the Task: \(message) Nothing was saved.")
        case .completed: return .result(dialog: "HealthyFlow returned an invalid Task proposal. Nothing was saved.")
        }

        let approved: Bool
        do {
            try await requestConfirmation(actionName: .continue, dialog: "\(summary)")
            approved = true
        } catch {
            approved = false
        }
        NotificationCenter.default.post(name: lockedTaskDecisionNotification, object: ["id": id, "decision": approved ? "save" : "cancel"])
        let completion = await LockedTaskExchange.wait(id)
        switch completion {
        case .completed:
            progress.completedUnitCount = 3
            saveLockedTaskDiagnostic(approved ? "saved" : "canceled", approved ? "Task write was verified on this iPhone." : "Task proposal was canceled.")
            return .result(dialog: approved ? "Task saved in HealthyFlow." : "Canceled. No Task was saved.")
        case .failed(let message):
            return .result(dialog: approved
                ? "I could not verify the Task on this iPhone: \(message) Check Talk before trying again."
                : "Nothing was saved, but Talk could not confirm cancellation: \(message)")
        case .ready:
            return .result(dialog: "HealthyFlow returned an invalid Task result. Check Talk before trying again.")
        case .clarification:
            return .result(dialog: "HealthyFlow returned an invalid Task result. Check Talk before trying again.")
        }
    }
}

// No transcript or audio file is retained. This only measures whether a native
// input/output audio session survives a locked, background Siri invocation.
private final class AudioProbeCounts: @unchecked Sendable {
    private let lock = NSLock()
    private var total = 0
    private var withSignal = 0

    func accept(_ buffer: AVAudioPCMBuffer) {
        let samples = Int(buffer.frameLength)
        guard samples > 0 else { return }
        var peak: Float = 0
        if let channel = buffer.floatChannelData?[0] {
            for index in 0..<samples { peak = max(peak, abs(channel[index])) }
        }
        lock.lock()
        total += 1
        if peak > 0.02 { withSignal += 1 }
        lock.unlock()
    }

    var result: (total: Int, withSignal: Int) {
        lock.lock()
        defer { lock.unlock() }
        return (total, withSignal)
    }
}

@MainActor
private enum LockedAudioProbe {
    static func run() async throws -> (total: Int, withSignal: Int) {
        guard AVAudioApplication.shared.recordPermission == .granted else {
            throw NSError(domain: "HealthyFlowAudioProbe", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Microphone permission must be prepared in HealthyFlow before the locked test."])
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP, .mixWithOthers])
        } catch {
            let failure = error as NSError
            throw NSError(domain: "HealthyFlowAudioProbe.category", code: failure.code,
                          userInfo: [NSLocalizedDescriptionKey: "Category setup failed (\(failure.domain) \(failure.code)): \(failure.localizedDescription)"])
        }
        do {
            try session.setActive(true)
        } catch {
            let failure = error as NSError
            throw NSError(domain: "HealthyFlowAudioProbe.activation", code: failure.code,
                          userInfo: [NSLocalizedDescriptionKey: "Session activation failed (\(failure.domain) \(failure.code)): \(failure.localizedDescription)"])
        }

        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let counts = AudioProbeCounts()
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) { buffer, _ in
            counts.accept(buffer)
        }
        engine.attach(player)
        let toneFormat = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        engine.connect(player, to: engine.mainMixerNode, format: toneFormat)

        do {
            try engine.start()
            guard let tone = AVAudioPCMBuffer(pcmFormat: toneFormat, frameCapacity: 8_820),
                  let channel = tone.floatChannelData?[0] else {
                throw NSError(domain: "HealthyFlowAudioProbe", code: 2,
                              userInfo: [NSLocalizedDescriptionKey: "Could not make the audio-test ready tone."])
            }
            tone.frameLength = 8_820
            for index in 0..<Int(tone.frameLength) {
                channel[index] = 0.16 * sin(Float(index) * 2 * .pi * 660 / 44_100)
            }
            player.scheduleBuffer(tone, completionHandler: nil)
            player.play()
            try await Task.sleep(nanoseconds: 12_000_000_000)
            player.stop()
            input.removeTap(onBus: 0)
            engine.stop()
            try session.setActive(false, options: .notifyOthersOnDeactivation)
            return counts.result
        } catch {
            let primary = error
            player.stop()
            input.removeTap(onBus: 0)
            engine.stop()
            do {
                try session.setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                let cleanup = error as NSError
                throw NSError(domain: "HealthyFlowAudioProbe.cleanup", code: cleanup.code,
                              userInfo: [NSLocalizedDescriptionKey: "\(primary.localizedDescription); session cleanup also failed (\(cleanup.domain) \(cleanup.code))."])
            }
            throw primary
        }
    }
}

struct LockedAudioProbeIntent: AudioRecordingIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Test Locked Audio"
    static var description = IntentDescription("Check native recording and a ready tone while the phone stays locked. Nothing is saved.")
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        saveAudioDiagnostic("running", "The locked-audio test started; waiting for its result.")
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            saveAudioDiagnostic("failed", "Live Activities are off.")
            return .result(dialog: "Live Activities are off. Enable them for HealthyFlow before this audio test.")
        }

        let activity: Activity<HandsFreeAudioProbeActivity>
        do {
            activity = try Activity.request(
                attributes: HandsFreeAudioProbeActivity(startedAt: Date()),
                content: ActivityContent(state: .init(phase: "Listening"), staleDate: Date().addingTimeInterval(30)),
                pushType: nil
            )
        } catch {
            saveAudioDiagnostic("failed", "Recording indicator: \(error.localizedDescription)")
            return .result(dialog: "The locked audio test could not start its recording indicator: \(error.localizedDescription). Nothing was saved.")
        }

        do {
            let result = try await LockedAudioProbe.run()
            await activity.end(ActivityContent(state: .init(phase: "Finished"), staleDate: nil), dismissalPolicy: .immediate)
            if result.total == 0 {
                saveAudioDiagnostic("finished", "The microphone delivered no audio buffers.")
                return .result(dialog: "The audio test finished, but the microphone delivered no audio. Nothing was saved.")
            }
            if result.withSignal == 0 {
                saveAudioDiagnostic("finished", "The microphone ran, but no speech-level signal was detected in \(result.total) buffers.")
                return .result(dialog: "The microphone ran, but I detected no speech-level sound. Did you hear the ready tone? Nothing was saved.")
            }
            saveAudioDiagnostic("finished", "Sound detected in \(result.withSignal) of \(result.total) microphone buffers.")
            return .result(dialog: "The locked audio test finished. I detected sound in \(result.withSignal) microphone buffers. No audio or Task was saved.")
        } catch {
            await activity.end(ActivityContent(state: .init(phase: "Failed"), staleDate: nil), dismissalPolicy: .immediate)
            saveAudioDiagnostic("failed", error.localizedDescription)
            return .result(dialog: "The locked audio test failed: \(error.localizedDescription). Nothing was saved.")
        }
    }
}

// Siri only wakes the app. The microphone attempt starts after the intent has
// returned its dialog, so Siri should no longer own the audio session.
// No transcript, recording, or Task is saved.
struct LockedAudioHandoffProbeIntent: AudioRecordingIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Test Siri Audio Handoff"
    static var description = IntentDescription("After Siri finishes, try HealthyFlow's microphone while locked. Nothing is saved.")
    static var supportedModes: IntentModes { .background }
    static var authenticationPolicy: IntentAuthenticationPolicy { .alwaysAllowed }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            saveAudioDiagnostic("failed", "Siri handoff: Live Activities are off.")
            return .result(dialog: "Live Activities are off. Nothing was saved.")
        }
        let activity: Activity<HandsFreeAudioProbeActivity>
        do {
            activity = try Activity.request(
                attributes: HandsFreeAudioProbeActivity(startedAt: Date()),
                content: ActivityContent(state: .init(phase: "Waiting for Siri"), staleDate: Date().addingTimeInterval(30)),
                pushType: nil
            )
        } catch {
            saveAudioDiagnostic("failed", "Siri handoff: recording indicator failed: \(error.localizedDescription)")
            return .result(dialog: "HealthyFlow could not prepare the recording indicator. Nothing was saved.")
        }

        let backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "HealthyFlow Siri audio handoff") {
            saveAudioDiagnostic("failed", "Siri handoff: iOS ended background time before the microphone test finished.")
        }
        guard backgroundTask != .invalid else {
            await activity.end(ActivityContent(state: .init(phase: "Failed"), staleDate: nil), dismissalPolicy: .immediate)
            saveAudioDiagnostic("failed", "Siri handoff: iOS did not grant background time.")
            return .result(dialog: "HealthyFlow could not continue after Siri. Nothing was saved.")
        }

        saveAudioDiagnostic("running", "Siri handoff: waiting four seconds for Siri to finish before starting HealthyFlow audio.")
        Task { @MainActor in
            defer { UIApplication.shared.endBackgroundTask(backgroundTask) }
            do {
                try await Task.sleep(nanoseconds: 4_000_000_000)
                let result = try await LockedAudioProbe.run()
                await activity.end(ActivityContent(state: .init(phase: "Finished"), staleDate: nil), dismissalPolicy: .immediate)
                if result.withSignal > 0 {
                    saveAudioDiagnostic("finished", "Siri handoff: HealthyFlow heard sound in \(result.withSignal) of \(result.total) microphone buffers while locked. No audio or Task was saved.")
                } else {
                    saveAudioDiagnostic("finished", "Siri handoff: microphone started but heard no speech-level sound in \(result.total) buffers. No audio or Task was saved.")
                }
            } catch {
                await activity.end(ActivityContent(state: .init(phase: "Failed"), staleDate: nil), dismissalPolicy: .immediate)
                saveAudioDiagnostic("failed", "Siri handoff: \(error.localizedDescription)")
            }
        }
        return .result(dialog: "Siri is done. Listen for HealthyFlow's tone, then speak for twelve seconds. Nothing will be saved.")
    }
}

struct HealthyFlowProbeShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartTalkProbeIntent(),
            phrases: ["Start Talk in \(.applicationName)", "Test voice in \(.applicationName)"],
            shortTitle: "Start Talk",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: LockedPlanConfirmationProbeIntent(),
            phrases: ["Test locked plan in \(.applicationName)"],
            shortTitle: "Locked plan test",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: LockedClarificationProbeIntent(),
            phrases: ["Test locked follow-up in \(.applicationName)"],
            shortTitle: "Locked follow-up test",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: LockedWebBridgeProbeIntent(),
            phrases: ["Ping \(.applicationName) bridge"],
            shortTitle: "Ping web bridge",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: LockedTaskSaveProbeIntent(),
            phrases: ["Capture a Task in \(.applicationName)"],
            shortTitle: "Capture one Task",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: LockedAudioProbeIntent(),
            phrases: ["Test locked audio in \(.applicationName)"],
            shortTitle: "Locked audio test",
            systemImageName: "waveform"
        )
        AppShortcut(
            intent: LockedAudioHandoffProbeIntent(),
            phrases: ["Wake \(.applicationName)", "Test Siri audio handoff in \(.applicationName)"],
            shortTitle: "Wake test",
            systemImageName: "waveform"
        )
    }
}

@objc(HandsFreeTalkProbePlugin)
// Capacitor and speech delegate callbacks touch mutable state only on the main queue.
public final class HandsFreeTalkProbePlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    public let identifier = "HandsFreeTalkProbePlugin"
    public let jsName = "HandsFreeTalkProbe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takeEntry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ackLockedBridgeProbe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replyLockedTaskDraft", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replyLockedTaskDecision", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastAudioDiagnostic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastLockedTaskDiagnostic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVoices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "speak", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private let synthesizer = AVSpeechSynthesizer()
    private var speechCall: CAPPluginCall?
    private var speechUtterance: AVSpeechUtterance?
    private var observer: NSObjectProtocol?
    private var bridgeObserver: NSObjectProtocol?
    private var lockedTaskDraftObserver: NSObjectProtocol?
    private var lockedTaskDecisionObserver: NSObjectProtocol?

    override public func load() {
        synthesizer.delegate = self
        observer = NotificationCenter.default.addObserver(forName: entryNotification, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("entryAvailable", data: [:])
        }
        bridgeObserver = NotificationCenter.default.addObserver(forName: bridgeProbeNotification, object: nil, queue: .main) { [weak self] notification in
            guard let id = notification.object as? String else { return }
            self?.notifyListeners("lockedBridgeProbe", data: ["id": id])
        }
        lockedTaskDraftObserver = NotificationCenter.default.addObserver(forName: lockedTaskDraftNotification, object: nil, queue: .main) { [weak self] notification in
            guard let payload = notification.object as? [String: String] else { return }
            self?.notifyListeners("lockedTaskDraft", data: payload)
        }
        lockedTaskDecisionObserver = NotificationCenter.default.addObserver(forName: lockedTaskDecisionNotification, object: nil, queue: .main) { [weak self] notification in
            guard let payload = notification.object as? [String: String] else { return }
            self?.notifyListeners("lockedTaskDecision", data: payload)
        }
        HealthyFlowProbeShortcuts.updateAppShortcutParameters()
    }

    deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
        if let bridgeObserver { NotificationCenter.default.removeObserver(bridgeObserver) }
        if let lockedTaskDraftObserver { NotificationCenter.default.removeObserver(lockedTaskDraftObserver) }
        if let lockedTaskDecisionObserver { NotificationCenter.default.removeObserver(lockedTaskDecisionObserver) }
    }

    @objc func takeEntry(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else {
                call.resolve(["entry": NSNull()]); return
            }
            guard let pending = UserDefaults.standard.dictionary(forKey: entryKey) else {
                call.resolve(["entry": NSNull()]); return
            }
            UserDefaults.standard.removeObject(forKey: entryKey)
            guard let id = pending["id"] as? String,
                  let created = pending["createdAt"] as? Double,
                  Date().timeIntervalSince1970 - created >= 0,
                  Date().timeIntervalSince1970 - created < 60 else {
                call.reject("The voice-test entry expired. Invoke Siri again.", "entry_expired"); return
            }
            call.resolve(["entry": ["id": id]])
        }
    }

    @objc func getLastAudioDiagnostic(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let stored = UserDefaults.standard.object(forKey: audioDiagnosticKey) else {
                call.resolve(["diagnostic": NSNull()]); return
            }
            guard let diagnostic = stored as? [String: Any],
                  let status = diagnostic["status"] as? String,
                  let message = diagnostic["message"] as? String,
                  let at = diagnostic["at"] as? Double else {
                call.reject("The saved audio-test diagnostic could not be read.", "probe_diagnostic_invalid"); return
            }
            call.resolve(["diagnostic": ["status": status, "message": message, "at": at]])
        }
    }

    @objc func getLastLockedTaskDiagnostic(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let stored = UserDefaults.standard.object(forKey: lockedTaskDiagnosticKey) else {
                call.resolve(["diagnostic": NSNull()]); return
            }
            guard let diagnostic = stored as? [String: Any],
                  let stage = diagnostic["stage"] as? String,
                  let detail = diagnostic["detail"] as? String,
                  let at = diagnostic["at"] as? Double else {
                call.reject("The saved voice Task diagnostic could not be read.", "probe_task_diagnostic_invalid"); return
            }
            call.resolve(["diagnostic": ["stage": stage, "detail": detail, "at": at]])
        }
    }

    @objc func ackLockedBridgeProbe(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), UUID(uuidString: id) != nil else {
            call.reject("The bridge probe id is invalid.", "probe_bridge_id_invalid"); return
        }
        UserDefaults.standard.set(id, forKey: bridgeProbeAckKey)
        call.resolve()
    }

    @objc func replyLockedTaskDraft(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), UUID(uuidString: id) != nil else {
                call.reject("The voice Task request id is invalid.", "probe_task_id_invalid"); return
            }
            let reply: LockedTaskExchange.Reply
            if let summary = call.getString("summary"), !summary.isEmpty {
                reply = .ready(summary)
            } else if let question = call.getString("question"), !question.isEmpty {
                reply = .clarification(question)
            } else if let error = call.getString("error"), !error.isEmpty {
                reply = .failed(error)
            } else {
                call.reject("The voice Task draft reply is invalid.", "probe_task_reply_invalid"); return
            }
            guard LockedTaskExchange.accept(id, reply) else {
                call.reject("The voice Task request expired or already received a reply.", "probe_task_reply_expired"); return
            }
            call.resolve()
        }
    }

    @objc func replyLockedTaskDecision(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), UUID(uuidString: id) != nil else {
                call.reject("The voice Task request id is invalid.", "probe_task_id_invalid"); return
            }
            let reply: LockedTaskExchange.Reply
            if call.getBool("completed") == true {
                reply = .completed
            } else if let error = call.getString("error"), !error.isEmpty {
                reply = .failed(error)
            } else {
                call.reject("The voice Task completion reply is invalid.", "probe_task_reply_invalid"); return
            }
            guard LockedTaskExchange.accept(id, reply) else {
                call.reject("The voice Task request expired or already received a reply.", "probe_task_reply_expired"); return
            }
            call.resolve()
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard UIApplication.shared.applicationState == .active else {
                call.reject("The voice test paused because the app is not active."); return
            }
            guard self.speechCall == nil else {
                call.reject("The voice test is already speaking."); return
            }
            guard let text = call.getString("text"), !text.isEmpty,
                  let language = call.getString("locale") else {
                call.reject("No installed voice supports the selected test language."); return
            }
            let voices = Self.voices(for: language)
            let voice: AVSpeechSynthesisVoice?
            if let identifier = call.getString("voiceId") {
                voice = voices.first { $0.identifier == identifier }
            } else {
                voice = voices.first
            }
            guard let voice else {
                call.reject("The selected voice is not installed for this language.", "probe_voice_unavailable"); return
            }
            do {
                let audio = AVAudioSession.sharedInstance()
                try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
                try audio.setActive(true)
                let utterance = AVSpeechUtterance(string: text)
                utterance.voice = voice
                self.speechCall = call
                self.speechUtterance = utterance
                self.synthesizer.speak(utterance)
            } catch {
                call.reject("The voice test could not start playback.", nil, error)
            }
        }
    }

    @objc func getVoices(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let language = call.getString("locale") else {
                call.reject("Choose a voice-test language first."); return
            }
            let voices = Self.voices(for: language)
            call.resolve(["voices": voices.map { voice in
                ["id": voice.identifier, "name": voice.name, "quality": Self.qualityName(voice.quality)]
            }])
        }
    }

    private static func voices(for language: String) -> [AVSpeechSynthesisVoice] {
        AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.caseInsensitiveCompare(language) == .orderedSame }
            .sorted {
                if $0.quality != $1.quality { return $0.quality.rawValue > $1.quality.rawValue }
                return $0.name.localizedStandardCompare($1.name) == .orderedAscending
            }
    }

    private static func qualityName(_ quality: AVSpeechSynthesisVoiceQuality) -> String {
        switch quality {
        case .premium: return "premium"
        case .enhanced: return "enhanced"
        case .default: return "standard"
        @unknown default: return "unknown"
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let pending = self.speechCall
            self.speechCall = nil
            self.speechUtterance = nil
            self.synthesizer.stopSpeaking(at: .immediate)
            pending?.reject("Voice test stopped.", "probe_stopped")
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                call.resolve()
            } catch { call.reject("Could not release voice-test playback.", nil, error) }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.speechUtterance === utterance else { return }
            let call = self.speechCall
            self.speechCall = nil
            self.speechUtterance = nil
            do {
                try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                call?.resolve()
            } catch { call?.reject("Could not finish voice-test playback.", nil, error) }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.speechUtterance === utterance else { return }
            self.speechCall?.reject("Voice test playback was interrupted.", "probe_interrupted")
            self.speechCall = nil
            self.speechUtterance = nil
        }
    }
}
#endif
