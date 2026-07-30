import Capacitor

final class HealthyFlowViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthyFlowWidgetPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}
