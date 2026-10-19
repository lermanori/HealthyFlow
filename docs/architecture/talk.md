# Talk surface

Talk (`/talk`, `src/pages/AssistantPage.tsx`) is the only user-facing free-form
AI composer. It owns typed text, dictation, file/photo attachments, model choice,
AI responses, action proposals and proposal confirmation. Other modules own their
records and deterministic forms; they do not own another AI prompt box.

The surface has two explicit views over the same ongoing conversation. **Chat**
shows the thread and compact composer. **Voice** gives dictation the full capture
surface; sending returns to Chat for the response and proposal review. Talk waits
for saved history before choosing a view: an existing thread opens in Chat and an
empty thread opens in Voice. This prevents the Voice surface flashing while a
saved thread is still loading.

Conversation snapshots are mirrored to device storage as well as the server. A
failed server save remains visible after reopening on the same device and is
retried against the server on a later load. A pending save is flushed when the
user leaves Talk, and the newest `updatedAt` snapshot wins when device and server
hold the same conversation. Neither a failed save nor a failed read is presented
as an empty history.

Each consented Talk request also carries a bounded seven-date calendar snapshot
read through the same composed calendar source as Today. By default it covers
today and the following six days; a named date in the user's message is included
even when it falls outside that range, and a next-week question reads the following
week. This is how Device Calendar events that remain local to the iPhone can
ground Talk without being copied into the hosted calendar database. Each date
preserves connected, empty, not connected, not entitled, or unavailable status;
a failed or unrequested date never becomes an empty calendar.

When Talk calls `get_daily_context` for a date, its result includes that exact
date's client Calendar read alongside the hosted day records and Daily Signals.
An unrequested date has `calendar.status: not_read`, not an empty event list.
The tool omits raw habit, calorie and workout lookback rows; Daily Signals still
use those rows internally, and the `/ai/daily-context` endpoint keeps its full
contract for the Today surface.

The opt-in `HANDSFREE_PROBE` iPhone build can enter Talk through a Siri App
Shortcut. Siri owns microphone and dialog turns while locked; the foreground
native adapter handles speech in the unlocked test. Talk still sends the AI
turn, displays the pending action, and confirms or cancels the server's
proposal id. The first voice slice accepts one `add_task` proposal and exact
spoken yes/no only. Its locked Siri Debug path can request one additional
spoken detail when Talk asks a clarification question; whether Siri reliably
completes that turn on a locked pilot iPhone is still under test. Other or
multiple proposals remain for on-screen review.
AI consent and microphone setup must already be complete before hands-free use.
This adapter is absent from ordinary builds and does not connect to Salesforce.

## Contextual entry

A module that can use AI opens Talk with a closed `talkHandoffContext` router
state (`src/talkHandoff.ts`). The context carries enums and an optional ISO date,
never arbitrary or hidden user text. Talk converts it into a visible, editable
composer draft and a removable source badge. It consumes the router state once,
so refresh cannot replay it; replacing the current history entry preserves Back
navigation to the source page.

Work and Daily Signals predate the generic handoff and retain their deeper typed
contracts:

- Work supplies a bounded, user-owned Project snapshot and an optional verified
  `plan_work` workflow id through `src/workTalk.ts`.
- A Daily Signal supplies its date, type, summary and rationale. The signal is a
  read-only observation; Talk is where the user discusses or acts on it.

In every case the resulting prompt is visible before send. A module may not call
Talk with an invisible natural-language instruction.

## Input-surface inventory

| Surface | Decision |
|---|---|
| Talk composer | Keep. The sole free-form AI input, including dictation and attachments. |
| Today onboarding | “Open Talk” with `plan_day`, selected date and optional closed demo-persona id. Onboarding completes only after Talk returns successfully. |
| Legacy Today `?ai=true` deep link | Replace the URL entry with a one-shot `plan_day` Talk handoff. |
| Add · Today | “Open Talk” with selected Item type and scheduled date. The manual form and field dictation remain. |
| Add · Nutrition | “Open Talk” with `log_nutrition` and selected date. The manual Calorie-entry form remains. |
| Nutrition | “Open Talk” with `log_nutrition` and selected date; photos are attached in Talk. Quick insert, search and edit forms remain deterministic. |
| Workout plan editor | Remove its AI-intent textarea and generator button. “Open Talk” carries `draft_workout_plan`; the reusable-plan editor remains deterministic. |
| Admin meal-photo lab | Remove the separate UI. Its old route redirects to a Nutrition Talk handoff. |
| Demo and acquisition pages | No composer. Their closed persona id may shape the visible onboarding draft after entry into the real workspace. |
| Daily Signals | Keep read-only result/proposal UI. Follow-up opens Talk with typed signal context. |
| Work | Keep deterministic Project/Focus block/Work session forms. “Discuss in Talk” and “Plan in Talk” remain contextual handoffs. |
| Goals and Goal context | Keep direct free-speech record editing. These are user-owned deterministic records, not AI prompts; Talk may separately prepare confirmed proposals. |
| Pending-action cards | Keep proposal review/edit controls. They edit the proposed write and do not send a new free-form AI turn. |
| Settings | Keep ordinary settings and read-only connection text. No AI composer exists there. |
| `VoiceInput` in Add | Keep. Speech recognition fills a named deterministic field and does not call an AI endpoint. |

The old frontend `AITextAnalyzer`, `MealAnalyzer`, parse hooks and admin lab page
are deleted. Server routes and capabilities for task parsing, Meal parsing and
Workout-plan generation remain available: consolidating UI must not remove the
backend behavior Talk uses or may deliberately absorb.

## Analytics and regression boundary

Every accepted send from Talk captures `ai_question_asked` with `surface: talk`,
the structured entry point, model and attachment presence. It never captures the
message or draft. Token accounting is server-side and identifies the endpoint as
`ai-chat` (or a more specific Talk capability endpoint such as
`ai-chat-parse-meals`); usage rows do not depend on a frontend composer name.

`src/utils/talkOnlyAiInput.test.ts` guards the shipped entry surfaces, the legacy
admin route, deterministic controls and the sole composer. Handoff parsing and
prompt derivation are covered by `src/utils/talkHandoff.test.ts`.
