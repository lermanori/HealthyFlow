# Talk surface

Talk (`/talk`, `src/pages/AssistantPage.tsx`) is the only user-facing free-form
AI composer. It owns typed text, dictation, file/photo attachments, model choice,
AI responses, action proposals and proposal confirmation. Other modules own their
records and deterministic forms; they do not own another AI prompt box.

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
