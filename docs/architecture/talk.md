# Talk surface

Talk (`/talk`, `src/pages/AssistantPage.tsx`) is the only user-facing free-form
AI composer. It owns typed text, dictation, file/photo attachments, model choice,
AI responses, action proposals and proposal confirmation. Other modules own their
records and deterministic forms; they do not own another AI prompt box.

User-facing Talk answers default to GPT-5.4 mini, the lowest selectable model.
The server also upgrades requests from older clients that still specify GPT-4o
mini or GPT-5 mini to GPT-5.4 mini; saved conversation records retain their
original model value until the client opens them. Internal task parsing and
context planning use their own model choices.

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

Talk also keeps a separate, short assistant-maintained memory on the device for
durable facts and response preferences explicitly stated by the user. After a
successful answer, a structured extraction call sees the latest user message and
current memory, but no assistant reply or Calendar/Today records. It may update
the memory only with an exact supporting quote from that message. The result is
included in later answer context as unverified personal context. The user can
inspect, edit, or clear it in Talk; it does not write Settings or Goals, and a
failed memory update is surfaced without removing the answer. Memory is local to
the device and account, not part of hosted conversation history. Deleting a chat
message does not silently erase a memory note; the user can remove it in Talk.
The admin testing reset clears both conversations and memory.

After AI consent, an ordinary Talk turn first calls `/ai/chat/context-plan` with
at most eight recent messages and the last validated read scope for that
conversation, when available. A server-keyed structured call selects the exact
local dates (up to seven) and needed sources, or asks for clarification. The
planner does not see Calendar events and does not spend a second user action;
its provider cost is logged separately. A failed plan surfaces as an error.
For an elliptical follow-up, the planner can explicitly continue the previous
scope; the server then carries its dates and sources unless the user named new
ones. The client keeps that compact scope on device for 24 hours.

For selected dates, the client reads Calendar from the same composed source as
Today, including EventKit on iPhone, and reads the local Day Summary only when
needed. Calendar and day reads fail independently. Each date preserves its
connected, empty, not connected, not entitled, or unavailable Calendar status;
an unrequested or failed date never becomes an empty calendar. Talk sends the
bounded evidence with its answer call. The server rejects missing planned
evidence before billing and omits broad `get_daily_context` and `get_today` reads
from all planned turns. When a turn needs only selected Calendar/day evidence,
or no source was selected, other read capabilities are not offered to the
answer model. Unrelated hosted records therefore cannot displace
the selected device evidence or appear after a planner omission.

Explicit Work workflows still use their durable workflow context. Older Talk
clients may still send the seven-date snapshot; `get_daily_context` reports
`calendar.status: not_read` for any date they did not supply. Talk treats event
titles and descriptions as the limits of Calendar evidence.
A generic holiday such as "National Day" is not translated into a specific
independence day or attributed to a country unless the record says so.

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

## Daily and weekly reviews

The former morning, midday, and weekly Planning Rhythm prompts are retired.
Settings → Notifications offers two separate opt-in invitations: an end-of-day
review (20:30 by default) and a weekly reflection (Sunday 19:00 by default).
Old `morning`, `midday`, and `weekly` values in `user_rhythm` do not enable the
new invitations. The server sends a generic push with a local date and no AI
call. It has no access to the iPhone's Local day, so a push never claims that a
check ran or that outcomes are missing. Notification delivery also is not
guaranteed merely because the schedule fired.

On opening an invitation, Talk reads the selected Local Day Summary on the device
and continues the existing conversation. The request sends bounded, typed review
evidence for that turn; the saved chat message contains only the short review
request and dates. An end-of-day review distinguishes
planned Items and Calendar events from recorded outcomes, and asks what happened
when no outcome is recorded in available sources. A weekly review reads the
seven days ending on the notification's date. It suggests one small experiment
only when at least two readable days have recorded outcomes. Failed date or
module reads are named as unavailable and never counted as empty days. A review
uses an AI action when the user starts it; sending the invitation does not.
Talk prepares any writes for explicit review and confirmation.

The current push scheduler cannot suppress an end-of-day invitation merely
because outcomes were recorded on the device. Conditional closed-app delivery
requires a device-owned scheduling mechanism, so the invitation asks neutrally
and Talk checks actual records after opening. Conflict alerts are not part of
these reviews.

## Short-lived Calendar diagnosis

The iPhone already sends its selected Calendar days in the ordinary `/ai/chat`
request. For an account-scoped investigation, the backend can emit a temporary
`[DEBUG-talk-calendar-v1]` trace for the planner result, the bounded Calendar
evidence received from the device, and the final answer. Set both
`TALK_CALENDAR_TRACE_USER_ID` and `TALK_CALENDAR_TRACE_UNTIL` (UTC ISO instant no
more than one hour ahead) on Railway. Without both fields, or after expiry, the
trace is off. It omits credentials, account id, event locations and descriptions;
it does include message text, event titles and times, so keep exported logs in
the ignored `.talk-debug/` directory and remove them after diagnosis.

Ask the question on the already-installed iPhone app, then collect the tagged
Railway logs and inspect the same turn locally:

```sh
mkdir -p .talk-debug
railway logs --lines 500 > .talk-debug/railway.log
node scripts/inspect-talk-calendar-trace.mjs .talk-debug/railway.log --dates 2026-10-25..2026-10-31 --event מילואים
```

The command separates missing planner dates, missing Calendar reads, and events
absent from a completed read. It prints the answer for comparison; it does not
call OpenAI or change user data. This is a diagnostic fixture, not the older
synthetic Prompt Lab and not a persistent chat-history feature. Only an EventKit
reader fix would require a new iPhone build.

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
