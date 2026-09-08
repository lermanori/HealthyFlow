import Capacitor
import EventKit
import Foundation
import UIKit

@objc(DeviceCalendarPlugin)
public final class DeviceCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeviceCalendarPlugin"
    public let jsName = "DeviceCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFullAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let eventStore = EKEventStore()

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": authorizationStatusValue()])
    }

    @objc func requestFullAccess(_ call: CAPPluginCall) {
        eventStore.requestFullAccessToEvents { [weak self] _, error in
            if let error {
                call.reject("Device Calendar permission request failed", nil, error)
                return
            }
            guard let self else {
                call.reject("Device Calendar permission result is unavailable")
                return
            }
            call.resolve(["status": self.authorizationStatusValue()])
        }
    }

    @objc func getEvents(_ call: CAPPluginCall) {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
            call.reject("Full Device Calendar access has not been granted")
            return
        }
        guard
            let dateText = call.getString("date"),
            let (start, end) = dayBounds(dateText)
        else {
            call.reject("Device Calendar date must be YYYY-MM-DD")
            return
        }

        let predicate = eventStore.predicateForEvents(
            withStart: start,
            end: end,
            calendars: nil
        )
        let events = eventStore.events(matching: predicate).sorted { left, right in
            left.startDate < right.startDate
        }

        do {
            call.resolve(["events": try events.map(eventPayload)])
        } catch {
            call.reject("Device Calendar returned an event without a stable identifier", nil, error)
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("The HealthyFlow settings URL is unavailable")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened {
                    call.resolve()
                } else {
                    call.reject("Could not open iOS Settings")
                }
            }
        }
    }

    private func authorizationStatusValue() -> String {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized:
            return "full_access"
        case .notDetermined:
            return "not_determined"
        case .restricted:
            return "restricted"
        case .denied, .writeOnly:
            return "denied"
        @unknown default:
            return "restricted"
        }
    }

    private func dayBounds(_ dateText: String) -> (Date, Date)? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false

        guard let start = formatter.date(from: dateText) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { return nil }
        return (start, end)
    }

    private func eventPayload(_ event: EKEvent) throws -> [String: Any] {
        guard let identifier = event.eventIdentifier, !identifier.isEmpty else {
            throw DeviceCalendarError.missingIdentifier
        }

        let allDay = event.isAllDay
        return [
            "id": "device:\(identifier)",
            "provider": "device",
            "calendarId": event.calendar.calendarIdentifier,
            "externalEventId": identifier,
            "title": event.title?.isEmpty == false ? event.title! : "(No title)",
            "description": event.notes ?? NSNull(),
            "location": event.location ?? NSNull(),
            "startAt": isoDate(event.startDate),
            "endAt": isoDate(event.endDate),
            "localStartTime": allDay ? NSNull() : localTime(event.startDate),
            "localEndTime": allDay ? NSNull() : localTime(event.endDate),
            "allDay": allDay,
            "status": eventStatus(event.status),
            "htmlLink": NSNull(),
            "completed": false,
            "completedAt": NSNull()
        ]
    }

    private func isoDate(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func localTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private func eventStatus(_ status: EKEventStatus) -> String {
        switch status {
        case .none:
            return "none"
        case .confirmed:
            return "confirmed"
        case .tentative:
            return "tentative"
        case .canceled:
            return "cancelled"
        @unknown default:
            return "unknown"
        }
    }
}

private enum DeviceCalendarError: Error {
    case missingIdentifier
}
