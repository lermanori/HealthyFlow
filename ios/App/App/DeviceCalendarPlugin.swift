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
        CAPPluginMethod(name: "upsertItemEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteItemEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    private let eventStore = EKEventStore()

    override public func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(eventStoreChanged),
            name: Notification.Name.EKEventStoreChanged,
            object: eventStore
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func eventStoreChanged() {
        notifyListeners("eventsChanged", data: [:])
    }

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
        let events = eventStore.events(matching: predicate)
            .filter { !isHealthyFlowItemEvent($0) }
            .sorted { left, right in left.startDate < right.startDate }

        do {
            call.resolve(["events": try events.map(eventPayload)])
        } catch {
            call.reject("Device Calendar returned an event without a stable identifier", nil, error)
        }
    }

    @objc func upsertItemEvent(_ call: CAPPluginCall) {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
            call.reject("Full Device Calendar access has not been granted")
            return
        }
        guard
            let itemId = call.getString("itemId"), !itemId.isEmpty,
            let title = call.getString("title"), !title.isEmpty,
            let scheduledDate = call.getString("scheduledDate"),
            let startTime = call.getString("startTime"),
            let durationMinutes = call.getInt("durationMinutes"), durationMinutes > 0,
            let startDate = localDate(scheduledDate, startTime),
            let endDate = Calendar.current.date(byAdding: .minute, value: durationMinutes, to: startDate)
        else {
            call.reject("A Device Calendar Item needs a title, date, start time, and positive duration")
            return
        }

        let existingIdentifier = call.getString("eventIdentifier")
        let event: EKEvent
        if
            let existingIdentifier,
            let existing = eventStore.event(withIdentifier: existingIdentifier),
            existing.url == itemURL(itemId)
        {
            event = existing
        } else if let existing = findHealthyFlowItemEvent(itemId, around: startDate) {
            // A native save can succeed immediately before the Local link is
            // persisted. Recover the marked event on retry instead of creating
            // a duplicate.
            event = existing
        } else {
            guard let calendar = eventStore.defaultCalendarForNewEvents else {
                call.reject("No writable default Device Calendar is available")
                return
            }
            event = EKEvent(eventStore: eventStore)
            event.calendar = calendar
        }

        event.title = title
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = false
        event.location = call.getString("location")
        event.url = URL(string: "healthyflow://item/\(itemId)")

        do {
            try eventStore.save(event, span: .thisEvent, commit: true)
            guard let identifier = event.eventIdentifier, !identifier.isEmpty else {
                call.reject("Device Calendar saved the Item without a stable identifier")
                return
            }
            call.resolve(["eventIdentifier": identifier])
        } catch {
            call.reject("Device Calendar could not save this Item", nil, error)
        }
    }

    @objc func deleteItemEvent(_ call: CAPPluginCall) {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else {
            call.reject("Full Device Calendar access has not been granted")
            return
        }
        guard let identifier = call.getString("eventIdentifier"), !identifier.isEmpty else {
            call.reject("A Device Calendar event identifier is required")
            return
        }
        guard let event = eventStore.event(withIdentifier: identifier) else {
            call.resolve(["deleted": false])
            return
        }
        guard isHealthyFlowItemEvent(event) else {
            call.reject("The linked event is not owned by HealthyFlow")
            return
        }

        do {
            try eventStore.remove(event, span: .thisEvent, commit: true)
            call.resolve(["deleted": true])
        } catch {
            call.reject("Device Calendar could not remove this Item", nil, error)
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

    private func localDate(_ dateText: String, _ timeText: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.isLenient = false
        return formatter.date(from: "\(dateText) \(timeText)")
    }

    private func isHealthyFlowItemEvent(_ event: EKEvent) -> Bool {
        event.url?.scheme == "healthyflow" && event.url?.host == "item"
    }

    private func itemURL(_ itemId: String) -> URL? {
        URL(string: "healthyflow://item/\(itemId)")
    }

    private func findHealthyFlowItemEvent(_ itemId: String, around date: Date) -> EKEvent? {
        let calendar = Calendar.current
        let start = calendar.startOfDay(for: date)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else { return nil }
        let target = itemURL(itemId)
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        return eventStore.events(matching: predicate).first { $0.url == target }
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
