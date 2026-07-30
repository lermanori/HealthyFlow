import SwiftUI
import WidgetKit

private struct TodaySummary: Codable {
    let date: String
    let addressed: Int
    let total: Int
    let remaining: Int
    let percent: Double?
    let nextTitle: String?
    let nextTime: String?
    let deepLink: String

    static let placeholder = TodaySummary(
        date: "2026-07-30",
        addressed: 3,
        total: 5,
        remaining: 2,
        percent: 60,
        nextTitle: "Next item",
        nextTime: "09:00",
        deepLink: "healthyflow://app"
    )

    static let empty = TodaySummary(
        date: "",
        addressed: 0,
        total: 0,
        remaining: 0,
        percent: nil,
        nextTitle: nil,
        nextTime: nil,
        deepLink: "healthyflow://app"
    )
}

private struct TodayEntry: TimelineEntry {
    let date: Date
    let summary: TodaySummary
}

private struct TodayProvider: TimelineProvider {
    private let suiteName = "group.app.healthyflow.mobile"
    private let summaryKey = "healthyflow.widget.summary"

    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), summary: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let fallback: TodaySummary = context.isPreview ? .placeholder : .empty
        completion(TodayEntry(date: Date(), summary: readSummary() ?? fallback))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: Date(), summary: readSummary() ?? .empty)
        let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date())
            ?? Date().addingTimeInterval(15 * 60)
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func readSummary() -> TodaySummary? {
        guard
            let defaults = UserDefaults(suiteName: suiteName),
            let data = defaults.data(forKey: summaryKey)
        else {
            return nil
        }
        return try? JSONDecoder().decode(TodaySummary.self, from: data)
    }
}

private struct ProgressRing: View {
    let percent: Double?

    private var progress: Double {
        min(1, max(0, (percent ?? 0) / 100))
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(red: 0.42, green: 0.52, blue: 0.47).opacity(0.22), lineWidth: 7)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    Color(red: 0.66, green: 0.78, blue: 0.71),
                    style: StrokeStyle(lineWidth: 7, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            Text(percent.map { "\(Int($0))%" } ?? "—")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
        }
        .frame(width: 54, height: 54)
        .accessibilityLabel(percent.map { "\(Int($0)) percent addressed" } ?? "No progress yet")
    }
}

private struct HealthyFlowWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    private var deepLink: URL {
        URL(string: entry.summary.deepLink) ?? URL(string: "healthyflow://app")!
    }

    var body: some View {
        Link(destination: deepLink) {
            if family == .systemSmall {
                small
            } else {
                medium
            }
        }
        .containerBackground(for: .widget) {
            Color(red: 0.09, green: 0.10, blue: 0.11)
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("TODAY")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(Color(red: 0.66, green: 0.78, blue: 0.71))
                Spacer()
                ProgressRing(percent: entry.summary.percent)
            }
            Spacer(minLength: 0)
            Text(entry.summary.total == 0 ? "A clear day" : "\(entry.summary.remaining) remaining")
                .font(.headline)
                .foregroundStyle(.white)
            Text(entry.summary.total == 0
                 ? "Open HealthyFlow to shape it."
                 : "\(entry.summary.addressed) of \(entry.summary.total) addressed")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.62))
        }
        .padding(4)
    }

    private var medium: some View {
        HStack(spacing: 16) {
            ProgressRing(percent: entry.summary.percent)
            VStack(alignment: .leading, spacing: 5) {
                Text("TODAY")
                    .font(.caption2.weight(.bold))
                    .tracking(1.2)
                    .foregroundStyle(Color(red: 0.66, green: 0.78, blue: 0.71))
                Text(entry.summary.total == 0
                     ? "A clear day"
                     : "\(entry.summary.addressed) of \(entry.summary.total) addressed")
                    .font(.headline)
                    .foregroundStyle(.white)
                if let nextTitle = entry.summary.nextTitle {
                    HStack(spacing: 5) {
                        if let nextTime = entry.summary.nextTime {
                            Text(nextTime)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Color(red: 0.66, green: 0.78, blue: 0.71))
                        }
                        Text(nextTitle)
                            .font(.caption)
                            .lineLimit(1)
                            .foregroundStyle(.white.opacity(0.68))
                            .privacySensitive()
                    }
                } else {
                    Text("Open HealthyFlow to shape the day.")
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.62))
                }
            }
            Spacer(minLength: 0)
        }
        .padding(4)
    }
}

@main
struct HealthyFlowTodayWidget: Widget {
    let kind = "HealthyFlowTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) { entry in
            HealthyFlowWidgetView(entry: entry)
        }
        .configurationDisplayName("HealthyFlow Today")
        .description("See today’s progress and next obligation.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
