import Capacitor

final class HealthyFlowViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthyFlowWidgetPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(GoogleSignInPlugin())
        bridge?.registerPluginInstance(DeviceCalendarPlugin())
        bridge?.registerPluginInstance(NativeSpeechPlugin())
        bridge?.registerPluginInstance(DeviceIdentityPlugin())
        bridge?.registerPluginInstance(TalkAttachmentsPlugin())
#if HANDSFREE_PROBE
        bridge?.registerPluginInstance(HandsFreeTalkProbePlugin())
#endif
    }
}
