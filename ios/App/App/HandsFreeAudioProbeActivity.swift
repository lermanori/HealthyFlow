// Shared by the app and widget only in the opt-in #317 probe build.
#if HANDSFREE_PROBE
import ActivityKit
import Foundation

struct HandsFreeAudioProbeActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let phase: String
    }

    let startedAt: Date
}
#endif
