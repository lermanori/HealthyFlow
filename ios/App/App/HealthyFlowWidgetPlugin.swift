import Capacitor
import Foundation
import WidgetKit

@objc(HealthyFlowWidgetPlugin)
public class HealthyFlowWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthyFlowWidgetPlugin"
    public let jsName = "HealthyFlowWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let suiteName = "group.app.healthyflow.mobile"
    private let summaryKey = "healthyflow.widget.summary"

    @objc func update(_ call: CAPPluginCall) {
        guard
            let date = call.getString("date"),
            let addressed = call.getInt("addressed"),
            let total = call.getInt("total"),
            let remaining = call.getInt("remaining"),
            let deepLink = call.getString("deepLink")
        else {
            call.reject("Invalid Today widget summary")
            return
        }

        var summary: [String: Any] = [
            "date": date,
            "addressed": addressed,
            "total": total,
            "remaining": remaining,
            "deepLink": deepLink
        ]
        if let percent = call.getDouble("percent") {
            summary["percent"] = percent
        }
        if let nextTitle = call.getString("nextTitle") {
            summary["nextTitle"] = nextTitle
        }
        if let nextTime = call.getString("nextTime") {
            summary["nextTime"] = nextTime
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: summary)
            guard let defaults = UserDefaults(suiteName: suiteName) else {
                call.reject("Could not open the HealthyFlow App Group")
                return
            }
            defaults.set(data, forKey: summaryKey)
            WidgetCenter.shared.reloadTimelines(ofKind: "HealthyFlowTodayWidget")
            call.resolve()
        } catch {
            call.reject("Could not encode the Today widget summary", nil, error)
        }
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            call.reject("Could not open the HealthyFlow App Group")
            return
        }
        defaults.removeObject(forKey: summaryKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "HealthyFlowTodayWidget")
        call.resolve()
    }
}
