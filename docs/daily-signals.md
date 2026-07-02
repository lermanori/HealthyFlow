# Daily Signals

Daily signals are deterministic, read-only observations derived from an anchored daily context.

`DailyContext` means "context for this date", not "only data from this date". It contains:

- `day`: bounded state for the anchor date, such as Tasks, Habit instances, Calorie entries, Weight entry, Achievements, Workout sessions, and Calendar events when available.
- `lookback`: bounded historical windows used for trends.
- `signals`: derived observations from closed-list detector rules.

The signal layer is the foundation for proactive features such as #119. It does not send notifications, write data, or ask AI to invent insights.

## V1 Signal Types

- `schedule_overload`: too many scheduled Items are packed into one part of the day.
- `habit_risk`: a Habit is due today after being missed on recent days.
- `missing_calorie_log`: recent history suggests a Calorie entry is usually logged by now, but none is present today.

Each signal includes:

- `type`: stable enum used by UI and assistant behavior.
- `severity`: `info`, `low`, `medium`, or `high`.
- `confidence`: `low`, `medium`, or `high`.
- `summary`: display copy only.
- `evidence`: bounded structured facts that explain why the signal fired.
- `suggestedAction`: optional structured next action.

Consumers must switch on `type`, not parse `summary`.

## Adding a Signal

1. Add a new value to `DailySignalTypeSchema` in `backend/src/daily-context.ts`.
2. Add one `SignalDetector` to the detector registry.
3. Add only the bounded context data the detector needs.
4. Keep detector logic deterministic and testable.
5. Add firing and non-firing unit tests.
6. Document the signal type, threshold, evidence, and suggested action here.

Detector shape:

```ts
type SignalDetector = {
  type: DailySignalType
  version: number
  enabledByDefault: boolean
  evaluate: (context: DailyContext) => DailySignal[]
}
```

## Guardrails

- No writes from detectors.
- No unbounded account history.
- No AI-invented signal types.
- No notification behavior in this layer.
- No generic "interesting insight" signal.
- Keep thresholds explicit so product tuning is a code review, not prompt archaeology.

## Ranking

Signals are ranked deterministically:

1. Higher severity.
2. Higher confidence.
3. Detector registry order.

The V1 output is capped at three signals. This prevents the app from turning a normal day into a performance review.
