# HealthyFlow UX/UI review

Review date: 18 July 2026  
Application: local Vite frontend plus local Express backend, using the existing Supabase-backed Lina demo persona  
Viewports: 1440×900, 1024×768, 390×844  
Method: repository and data-flow inspection, live Playwright walkthroughs, screenshots, DOM/accessibility snapshots, keyboard and touch-target checks, focused E2E validation, heuristics, information architecture, interaction design, accessibility, responsive behavior, design-system consistency, and visual hierarchy.

The visual review explicitly applied the user-provided [Taste Skill](https://github.com/Leonxlnx/taste-skill), especially its redesign scan/diagnose guidance. Taste was used as the art-direction and visual-quality layer only. Product conclusions are grounded separately in the code, HealthyFlow’s domain documentation, live workflows, usability heuristics, and accessibility evidence. No production UI code was changed.

## 1. Executive summary

HealthyFlow already has the right product center: the day. The strongest parts of the application—Today’s mixed timeline, virtual Habit instances, the Habit outcome sheet, the Talk pending-action flow, and health quick-repeat patterns—support the internal product thesis that tasks, food, training, and health occur inside the same day.

The current interface does not yet turn those parts into one legible personal operating system. The user can see data, but must assemble the decision themselves. Today shows Now/Next, a long schedule, Anytime, and AI signals, yet does not summarize calendar load, available capacity, Habit progress, nutrition status, workout state, or the consequence of AI advice as one plan. This is most damaging on mobile, where recommendations appear after the entire hourly timeline.

The highest-risk verified defects are more concrete than visual polish:

1. **White-theme Week View is seriously unreadable.** Hard-coded dark-theme styles cause key content to disappear on pale surfaces. This is Critical because it compromises a central screen and violates contrast requirements. See [HF-003](UX_FINDINGS.md#healthyflow-ux-findings).
2. **Enabled health routes redirect on cold deep links.** Calories and Achievements evaluate module settings before the settings query resolves, so refresh/bookmark navigation returns to Today. See HF-001.
3. **The module contract is inconsistent.** A disabled Calorie module remains available in Add; a user can create data and then be redirected away from its destination. Module behavior is separately encoded in routing, navigation, Add, Week, Today, and Settings. See HF-002 and HF-026.
4. **Daily decision hierarchy breaks at compact and mobile sizes.** At 1024 px the AI rail becomes a narrow text column; at 390 px it moves below the long timeline. See HF-006 and HF-041.
5. **Several frequent controls fail accessibility basics.** The mobile Habit check-in is 16×16 px, Settings switches and multiple icon actions are unnamed, the mobile drawer lacks modal behavior, and focus escapes the calorie dialog. See HF-007 through HF-010, HF-016, HF-017, and HF-035.

The recommended first redesign target is **Today as a daily decision workspace**, preceded by two enabling fixes: resolve the route/module contract and create container-aware layout rules. Today is the highest-frequency screen, the approved product thesis names it as the hero, and improving it creates the structure into which calendar obligations, capacity, Habits, health status, and AI proposals can connect without becoming a collection of equal cards.

## 2. Product model discovered from the code

### Product thesis and core loop

The current approved packaging document says HealthyFlow’s unit is the day, not an isolated task, meal, streak, or workout. The code largely supports that thesis:

- Today queries Items, calendar events, calorie entries, rhythm, and daily signals for one selected date.
- Timed Tasks/Habits, external calendar events, and calorie entries render on one timeline.
- Untimed Items live in the Anytime backlog.
- Rollover carries incomplete untimed Tasks across days.
- Habit instances are virtual until completed or dragged/materialized.
- Week View provides a deliberate planning and progress surface.
- Talk can read and propose writes across product areas using typed pending actions.

The practical loop is:

```text
Capture → place in a day → see in Today/Week → complete or log → review progress
   │                                                ▲
   └──────────── Talk/manual Add/quick repeat ──────┘
```

### Frontend, routing, and shared layout

- **Framework:** React 18, TypeScript, Vite 4, React Router 6.
- **Styling:** Tailwind CSS plus global CSS utilities and a substantial inline-style implementation in Week View.
- **State/data:** TanStack Query; API service definitions in `src/services/api.ts`.
- **Interaction:** Framer Motion; `@hello-pangea/dnd`; Lucide icons.
- **Authentication:** `AuthContext` with a local token and server verification.
- **Shared shell:** `src/components/Layout.tsx` provides desktop header/sidebar, mobile header/drawer, Today/Talk bottom dock, footer, PWA prompt, and ambient visual effects.
- **Responsive boundary:** JavaScript treats widths below 1024 px as mobile. Exactly 1024 px retains the 256 px desktop sidebar.

### Major entities and their UI representation

| Entity | Model discovered | Current representation |
|---|---|---|
| Item | Union of Task, Habit, Grocery, Meal, Workout item types | Today timeline/backlog and Add/Edit; UI creation currently exposes Task/Habit only |
| Task | One-time Item, timed or untimed, date-scoped | Today, Week, Add/Edit, Talk actions |
| Habit | Recurring Item with virtual per-day instances | Today/Week cards and Habit outcome sheet |
| Habit outcome/progress | Pending, partial, completed, failed; optional minutes/reps/count target; progress chunks | Habit outcome sheet; target flow covered by source and passing E2E test |
| Anytime backlog | Dated untimed ordered Items | Today shelf and Week Anytime section |
| Project | Name/color/archive plus Item relationship | Project selector in Add/Edit and badge on Task; no project destination |
| External calendar event | Timed obligation with completion state | Today timeline and Week counts/agenda when connected |
| Calorie entry/item | Date/time, quantity, calories/macros; reusable recent/most-used item | Today meal rows and Calories page/quick insert |
| Weight entry/trend | One entry per date, canonical kilograms | Calories page Weight section |
| Workout plan | Reusable exercise template | Workouts plan editor |
| Workout session/exercise | Date/title/notes plus set/reps/weight/time/distance exercises | Workouts composer and History |
| Achievement definition/entry | Metric, direction, target, dated results | Achievements master-detail, trend, history, log form |
| Assistant conversation | Messages, attachments, model, tool events | Talk history and chat |
| Pending AI action | Typed proposal with preview/edit/confirm/cancel | Talk response cards |
| User settings | Notifications, feature flags, week start, theme, onboarding | Settings and route/nav gating |
| Planning rhythm | Morning, midday, weekly touchpoints plus timezone | Settings and kickoff cards linking to Talk |

### Modules as implemented

There is no general module registry or extension contract. “Modules” currently means three settings booleans—Calorie Intake, Achievement Tracker, Workout Tracker—plus conditionals in `App`, `Layout`, Add, Week, Settings, and analytics. A module does not declare its routes, navigation, widgets, quick actions, empty states, or permissions in one place. This is already producing observable divergence: cold-route redirects, Add ignoring disabled state, and Week showing static module rows.

Projects are a complete backend/API entity but only a selector in the UI. Notes/reflections, available-capacity calculation, a dedicated Projects screen, and event-derived follow-up workflows were not found as current user-facing product surfaces.

### States discovered

- **Loading:** shared unlabelled spinner; page-specific text/spinners; Query loading states.
- **Empty:** Today schedule/Anytime, saved chats, Workout plans/session/history, health lists, Achievement creation.
- **Error:** inline login error; toasts; AI Signals unavailable; AI calls explicitly surface failures.
- **Disabled:** Add Result, feature controls, notification states; Workout Save Session does not disable when predictably invalid.
- **Completed:** Task checked state and completion effects; Habit terminal outcomes; Week completion status.
- **Expanded/collapsed:** mobile drawer, task action menu, Habit outcome sheet, calorie quick insert, workout plan editor, Achievement extra fields, Talk reasoning/action details.
- **Destructive:** native confirm, custom Habit modal, and several immediate-delete actions without confirmation/Undo.

### Tests and design documentation

The repository has broad backend/unit coverage and Playwright E2E coverage for auth, onboarding, Add, Item lifecycle, Habit progress, Week, calories, workouts, Talk, and Settings/subscription. During this review, `tests/e2e/habit-progress.spec.ts` passed, validating the mobile duration-target Habit sheet, partial progress chunks, completion, failed outcome, and touch sizing for tested controls. The Lina demo does not seed a duration-target Habit, so that exact state was not captured as a baseline screenshot.

Relevant current documentation includes:

- `CONTEXT.md` for canonical domain vocabulary.
- `docs/adr/0001-...` through `0004-...` for materialization, scheduling, AI data access, and Habit outcomes.
- `docs/superpowers/specs/2026-07-05-product-packaging-design.md` for the day-centric product thesis.
- `docs/superpowers/specs/2026-07-09-proactivity-rhythm-design.md` for planning touchpoints.
- `docs/analytics/STRATEGY.md` for the core loop and health side loops.
- `docs/fixes/redesign-v2-review/` for prior targeted engineering review notes; current findings were re-verified rather than copied.

## 3. Current navigation and screen map

### Navigation model

Desktop uses a persistent flat sidebar. Mobile uses two unnamed header buttons that open a drawer and a fixed two-item Today/Talk bottom dock. The drawer repeats the desktop list. Optional health routes appear when settings load. The shell correctly exposes banner, navigation, and main landmarks on the standard page, but the drawer itself is not a modal landmark.

### Screen map

| Screen or route | Main user goal | Primary action | Secondary actions | Main information shown |
|---|---|---|---|---|
| Unauthenticated `*` | Sign in or create an account | Login/Create Account | Guided demo, privacy, terms, public landing link | Credentials, auth mode, inline errors, prominent demo credentials |
| `/demo` | Choose a representative product story | Select persona/start demo | Sign in, narration controls | Persona goals, seeded day preview, guided story |
| `/` | Understand and execute the selected day | Complete/check in/drag the next Item | Date navigation, Talk, Add, edit/delete, dismiss signal, kickoff | Date/ribbon, completion/load counts, Now/Next, schedule, Anytime, meals, AI signals |
| `/talk` | Ask about or change the day with AI | Send message | Starter prompt, new chat, history, model, attachment, dictation, edit/confirm/cancel action | Conversation, tool/reasoning stages, pending actions, result status |
| `/week` | Review and plan the current week | Complete/check in an Item | Week navigation, Today, day selection, hide completed | Weekly completion, Up Next, full agenda, Habit consistency, category momentum |
| `/add` | Add a Task, Habit, calorie/weight entry, or Achievement result | Submit selected form | Switch domain/type, AI/Talk, project creation, quick dates | Creation fields and domain-specific options |
| `/calories` | Log and review daily nutrition and Weight | Add Entry | Add with AI, Edit Day, date jump, edit/delete entries | Weight latest/trend, time-grouped entries, macros, daily totals |
| `/achievements` | Track a personal metric over time | Add Result | New definition, select, edit, archive, delete, extra fields | Latest/best/change/target, trend, log form, history |
| `/workouts` | Create plans and record sessions | Save Session or Start plan | New/AI plan, quick repeat exercise, edit/delete history, date jump | Plans, session composer, exercises, history |
| `/settings` | Configure account, rhythm, features, appearance, connections, privacy | Change a setting | Start kickoff, connect calendar, billing intent, token creation, data actions | Profile, AI credits, notifications, rhythm, feature toggles, token scopes, theme/week start, privacy |
| `/assistant` | Legacy assistant entry | Redirect to `/talk` | Preserve query string | No independent UI |
| `/privacy`, `/terms` | Read policy documents | Read | Navigate back via shell/browser | Legal content |
| `/token-manager` | Administer users/credits | Admin actions | Filters/details | Admin-only; code-inspected, not live-inspected |
| `/meal-ocr-lab` | Test meal parsing | Parse/review | Admin diagnostics | Admin-only; code-inspected, not live-inspected |

There is no `/projects`, `/notes`, `/health`, or `/modules` route.

## 4. What already works well

### Day-centric mixed timeline

Today renders Tasks, Habit instances, external obligations, and meals in time order, with Anytime kept distinct. Empty-hour compaction reduces some timeline waste. The user can complete, check in, edit, delete, or drag without leaving the day. This is a differentiated product structure, not a generic dashboard.

### Habit outcome sheet

`HabitOutcomeSheet` is the strongest interaction pattern in the app. It uses a labelled dialog, focus trap, Escape, focus restoration, body-scroll lock, binary outcomes, target progress chunks, custom amounts, notes, and terminal outcomes. The passing E2E target-Habit flow confirms partial and completed states. It should be treated as the baseline for other overlays.

### Human-in-the-loop Talk actions

Talk separates assistant messages from typed pending actions and supports preview, edit, confirm, cancel, explicit error, and post-confirmation invalidation. This respects the server-keyed/no-silent-fallback architecture and is a credible foundation for AI-assisted planning.

### Quick-repeat health logging

Calories and Workout plan creation both expose recent/most-used items and search. Calorie quick insert auto-focuses search and supports arrows/Home/End/Enter. These are appropriate productivity patterns for repetitive logging.

### Achievement master-detail structure

Achievements uses the available desktop width well: selected metric and trend remain beside a sticky Log Result panel; the mobile transformation puts a coherent metric summary before logging and history. It is the most structurally mature analytics screen.

### Explicit product/domain documentation and demos

The day-centric packaging spec, ADRs, domain vocabulary, stable demo personas, and growing E2E suite make the product intent inspectable. That reduces the risk of redesigning around screenshots alone.

## 5. Top UX problems

### 5.1 Route and module state are not reliable

HF-001 and HF-002 are not edge-case polish. A user who refreshes Calories or follows a direct Achievement link can be sent to Today. A user who disables Calories can still create a calorie entry in Add. The product cannot explain core versus module while the same flag means different things across surfaces.

### 5.2 Theme support breaks a central workflow

HF-003 is the only Critical finding. White theme is an advertised preference, but Week’s inline colors cause major text and state loss. This should block broader visual redesign work until fixed.

### 5.3 Today displays data without fully supporting the decision

Today contains useful parts, but they do not answer the five target questions as one hierarchy:

- Attention now: Now/Next helps, but does not incorporate conflicts, capacity, or consequence.
- Planned today: timeline is clear, but long and separated from Anytime on mobile.
- Progress: header count is Task-centric; Habits/health/workout progress are dispersed.
- What next: AI signals are separated from the affected plan and are dismiss-only.
- Connections: meals appear in the timeline, but route-level totals and longer-term progress remain disconnected.

### 5.4 Week is repetition-heavy and selection is misleading

The 21 repeated Habit instances dominate Week. Selecting a day looks like a filter but leaves the full agenda unchanged. The page is long on every viewport and especially inefficient on mobile.

### 5.5 Accessibility failures affect frequent and destructive work

The issues are not limited to decorative contrast. They affect completion, module settings, record editing/deletion, health dates, mobile navigation, dialogs, progress, and loading feedback. Accessibility violations are separated in section 10.

### 5.6 Long stacks flatten user modes

Settings and Workouts render different user goals as equal cards in one scroll. Calories places status after history. These are structural hierarchy problems; reducing padding alone will not fix them.

### 5.7 Visual emphasis is too abundant

Cyan/blue gradients, neon/glow, purple AI cards, pulsing dots, floating icons, and rounded bordered surfaces are each viable in isolation. Used nearly everywhere, they make current focus, status, warning, and action harder to distinguish and move HealthyFlow toward a generic AI-dashboard aesthetic.

## 6. Information architecture findings

### Region classification

Importance uses Primary, Secondary, or Advanced. Frequency is expected usage for an active user, inferred from the product loop and code—not analytics results.

| Route / region | User purpose | Importance / frequency | Must remain visible with | Summary or detail | Structural direction |
|---|---|---|---|---|---|
| Today: date and week ribbon | Orient and move across days | Primary / daily | Day status and plan | Summary/control | Keep sticky or near top; honor week-start preference |
| Today: kickoff | Enter morning/midday/weekly planning | Secondary / scheduled | Current day context | Action summary | Compact contextual row; do not outrank Focus every day |
| Today: Now/Next | Choose immediate action | Primary / daily | Capacity/obligations and signal summary | Summary | Lead the decision hierarchy |
| Today: schedule | Execute timed plan and see obligations | Primary / daily | Date, Anytime, affected recommendation | Detail | Wide primary region; compact empty runs; expand drop affordances during drag |
| Today: Anytime | See and place flexible work | Primary / daily | Schedule/capacity | Detail/action | Desktop side context; mobile before the long timeline |
| Today: AI Insights | Understand risk and proposed next step | Secondary / situational | Affected Item and plan | Summary → detail | One-line signal near Focus; drawer/Talk for rationale and confirmation |
| Week: rail | Select date/range | Primary / weekly | Agenda and week status | Control | Make selection drive content or label its analytical role |
| Week: completion/Up Next | Orient to weekly load | Primary / weekly | Agenda | Summary/action | Keep above agenda, reduce decorative hero weight |
| Week: scheduled/Anytime | Place and complete work | Primary / weekly | Day rail and load summary | Detail | Default to selected day; All Week for deliberate scan |
| Week: Habit matrix | Review cadence without repeated cards | Secondary / weekly | Habit aggregate/selected day | Summary → detail | Retain as recurrence overview; disclose instances on selection |
| Week: momentum | Compare enabled areas | Secondary / weekly | Weekly status | Summary | Show only enabled/populated contributions |
| Add: domain tabs | Choose what is being created | Primary / frequent | Form title and module state | Control | Derive from enabled/core domains; support keyboard tab behavior |
| Add: Task/Habit form | Create a day Item | Primary / frequent | Date/type/project | Detail/action | One coherent form; progressive Habit target fields |
| Add: AI/Talk entry | Parse a messy day | Secondary / frequent | Review form/results | Alternate capture mode | Keep context and allow returning without losing draft |
| Calories: date/status | Choose day and decide what remains | Primary / daily for users of tool | Add Entry and totals/targets | Summary/control | Move totals/remaining beside date; add previous/today/next |
| Calories: Weight | Record/review body trend | Secondary / periodic | Date and recent history | Summary → detail | Secondary desktop panel; collapsible/route detail on mobile |
| Calories: Entries | Log, repeat, edit, and correct meals | Primary / daily | Daily total | Detail/action | Primary list; quick insert stays close to total |
| Calories: Daily Totals | Understand intake | Primary / daily | Add/entry list | Summary | Move before history; include configured targets only |
| Achievements: selector | Choose metric | Primary / periodic | Detail and log form | Control/summary | Retain master control; add selected semantics |
| Achievements: current metric | Understand latest/best/change/target | Primary / periodic | Log Result | Summary | Retain; reduce nested card treatment |
| Achievements: trend/history | Compare progress and edit mistakes | Secondary / periodic | Selected metric | Detail | Trend plus accessible data history |
| Achievements: Log Result | Record progress | Primary / periodic | Metric target/history | Action/detail | Sticky desktop panel; follows summary on mobile |
| Workouts: plans | Reuse structure and start a session | Primary / per workout | Active session | Master/action | Plan list in a master-detail workspace |
| Workouts: plan editor/AI | Build reusable plan | Advanced / occasional | Existing plan/exercise history | Detail/action | Dedicated editor mode; do not stack with blank session by default |
| Workouts: session composer | Log current workout | Primary / per workout | Selected plan and date | Detail/action | Appear after Start Session or Log without plan |
| Workouts: history | Review/edit past sessions | Secondary / periodic | Date/selected session | Detail | Preview or dedicated History mode |
| Talk: conversation history | Resume prior context | Secondary / periodic | Current conversation | Master | Desktop side rail; mobile selector/drawer |
| Talk: starter prompts | Teach capability | Secondary / first/empty use | Composer | Empty-state action | Add scope/boundary explanation; hide after conversation starts |
| Talk: messages/action cards | Understand and confirm AI work | Primary / per AI use | Composer and affected records | Detail/action | Keep; summarize rationale before tool trace |
| Talk: composer/model | Ask or capture | Primary / frequent | Conversation | Action | Keep sticky; move model choice to Advanced/default language |
| Settings: Profile/Billing | Understand account and credits | Primary / occasional | Account category | Summary/detail | Separate Account & Billing category; read-only fields should look read-only |
| Settings: Notifications/Rhythm | Configure planning cadence | Primary / occasional | Permission status | Detail/action | Planning and Notifications categories; keep Start now contextual |
| Settings: Features | Enable product areas | Primary / occasional | Module explanation | Control | Rename/group as Health tools or Modules after contract exists |
| Settings: Connections | Configure calendar/API access | Advanced / rare | Permissions and revoke state | Detail/action | Advanced category; separate calendar from API token scopes |
| Settings: Preferences | Theme/week behavior | Secondary / occasional | Immediate preview | Control | Appearance/Regional category |
| Settings: Privacy | Export, clear, delete | Primary but rare/high-risk | Consequence and confirmation | Action/detail | Dedicated Data & Privacy category with complete workflows |

### IA conclusions

- **Closely related but fragmented:** Calories/Weight, Workouts, and Achievements share date/units/progress concepts but lack a Health group or shared day navigator.
- **Unrelated but mixed:** Settings places billing, planning rhythm, developer token scopes, modules, appearance, and destructive account actions at equal depth.
- **Write-only concept:** Projects can be assigned but not revisited.
- **Ambiguous concepts:** “Features,” optional routes, and future “Modules” are not one mental model.
- **Duplicated status:** The sidebar “Talk ready” card repeats the persistent Talk destination without conveying actionable state.
- **Missing landmarks:** Long pages have headings but no local navigation or structural modes, forcing scroll-memory.

Recommended grouping and structural proposals are detailed in [UX_STRUCTURAL_REDESIGNS.md](UX_STRUCTURAL_REDESIGNS.md).

## 7. Daily workflow findings

| User task | Verified path and steps | What works | Friction / next action clarity |
|---|---|---|---|
| 1. Open and understand today | Login/demo → Today | Date, 0/5 count, timed/untimed count, Now/Next, visible timeline | No capacity/obligation summary; health and Habit progress are dispersed; AI advice is distant on mobile |
| 2. Identify highest-priority action | Read Now/Next | Immediate timed Item is explicit | It is chronological rather than a transparent priority decision; no conflict/capacity reasoning; “Focus” is not linked to an actionable recommendation |
| 3. Review calendar obligations | Connected events render in Today/Week | Events share the schedule model | Demo had no connected calendar; connection lives deep in Settings; no top-level obligation/load summary; OAuth state not live-tested |
| 4. Add or complete a Task | Today Add → Today form → Add Task; complete inline | One-click Add, quick dates, project, time/duration, inline completion, Undo possible by uncheck | Long form; native/toast validation inconsistency; 16×16 mobile Habit check target; action menus lack menu semantics; completion feedback is over-celebratory |
| 5. Review Habits for today | Habit rows in schedule/Anytime; open sheet | Habit outcome sheet is excellent; pending status visible | No compact Habit summary above the timeline; Week repeats every instance; binary Lina demo does not show duration progress until another data set is used |
| 6. Record duration-goal progress | Open target Habit → quick/custom chunk → save/terminal outcome | Existing E2E passed for 20/45, +20, +5, completed, failed, and clear outcomes | Target/progress is mostly hidden until the sheet opens; delete-progress recovery is weak; target Habit was not available in Lina screenshots |
| 7. Log calories/protein | Calories → Add Entry → recent item or form → Save | Strong quick repeat/search and editable macros; Today meal rows connect to schedule | Daily total/target is not visible before logging; dialog focus escapes; no calorie/protein goals; icon actions unnamed |
| 8. Record Weight | Calories → Edit Day | Latest, delta, and trend are prominent | Weight is bundled above nutrition, kg-only, date navigation is slow, historical points are not screen-reader accessible |
| 9. Review workout progress | Today workout Task → Workouts | Separate plans, sessions, exercise history, quick repeat, AI draft review | Planned Item and logged session relationship is unclear; blank composer is always active; no active-session/resume mode; three workflows stack vertically |
| 10. Move between days | Today arrows/ribbon; Week arrows; health date fields | Today is fast and preserves selected-day data | Today ribbon ignores week-start setting; health routes have no adjacent-day controls; DayTimeline says Today on other dates |
| 11. Understand achievements/long-term progress | Achievements selector → summary/trend/log/history | Clear latest/best/change/target and strong desktop master-detail | Selector is color-dependent; history icon actions unnamed; deletes lack recovery |
| 12. Enter a Project or module | Project chosen in Add/Edit; health tool from sidebar | Project badges and module-specific screens exist | Project has no destination; module behavior is inconsistent; navigation does not explain core vs optional |
| 13. Understand and act on AI advice | Today signal or Talk starter → response/action | Talk pending action has edit/preview/confirm/cancel and explicit failure | Today signals are dismiss-only; model/tool details are technical; no concise rationale/assumption layer; live AI send was blocked by Lina’s 0-credit state |

### Continuity and cognitive load

- The best continuity is inline: Task completion, Habit outcome, calorie quick repeat, and Achievement logging keep the relevant record visible.
- The weakest continuity crosses routes: a workout Task does not visibly become a Workout session; a Project assignment cannot be reopened as a project; a Today AI signal cannot apply its own suggested change.
- Information disappears when comparing: mobile Today separates AI from the affected schedule; health totals follow the entry history; Week day selection does not isolate that day.
- Error prevention is uneven: typed AI actions require confirmation, while many health-record deletes are immediate and Workout Save remains enabled when invalid.

## 8. Screen-by-screen review

### Login and Demo

Login is functional and labels its two fields. The prominent demo credentials and guided demo are useful for evaluation, but the language and visual treatment are the most generic-AI part of the product: “Neural networks ready to optimize your life” is less credible than the actual day-centric value. Sign-in/Create account selection lacks tab/pressed semantics; auth errors are not clearly announced as alerts. The demo picker is much stronger: it describes concrete user stories and stable seeded workspaces.

### Today `/`

Today is the correct hero screen. The date ribbon, load counts, Now/Next, mixed schedule, and Anytime backlog are useful. Desktop at 1440 uses space reasonably, but the bright AI column competes with the schedule. Exactly 1024 severely compresses it. Mobile preserves functions but makes the page very long and moves signals after the timeline. Rename non-today schedule context, honor week-start preference, move Anytime earlier on mobile, and redesign the top as a decision band rather than adding more equal cards.

Verified states: default populated, mobile/desktop/tablet, Habit sheet, completed Task (reverted), task delete confirmation (cancelled), AI loaded and unavailable states, compact schedule, mobile action targets.

### Talk `/talk`

Desktop master/conversation layout and mobile fixed composer are appropriate. Starter prompts reveal cross-module reading. Pending actions are the model to reuse elsewhere. The empty state needs a brief capability/boundary explanation; the model selector and raw tool JSON are advanced controls; progress/messages need live-region semantics. AI generation was not sent during the review because Lina had no credits, so live response latency and failure copy beyond source/tests were not exercised.

### Week `/week`

The page has useful primitives—rail, completion, Up Next, Habit consistency—but combines all of them with a repeated weekly agenda. The selected day is visually strong yet not a filter. White theme is critically broken. At mobile, summaries appear only after a very long list. Week should become selected-day/All-Week master-detail, with Habit cadence summarized instead of repeated.

Verified states: all three viewports, dark default, White theme, no completed content, selected-day visuals.

### Add `/add`

The form supports Task/Habit, categories, Project, location, date/time, duration, Habit targets, calorie/weight, Achievement result, and AI entry. Domain tabs are a legitimate mode switch, but do not respect module state. Type/category controls look like segmented controls without full selection semantics. Browser-native and toast validation diverge. Add should remain a focused form; it does not need more cards or tabs.

Verified states: default Task, mobile stacking, disabled-calorie module with visible Calories tab, empty-title validation.

### Calories `/calories`

Quick insert is strong. Weight trend and entry grouping are clear on desktop. The hierarchy is backward for decision-making: Weight first, then entries, then totals. Mobile turns each meal into a large macro card and puts totals far below. There are no targets, unit preference, adjacent-day controls, Undo, or accessible chart history. Dialog focus containment and icon naming require immediate fixes.

Verified states: populated default at all viewports, quick-insert modal, focus sequence, entries/totals, Weight trend.

### Achievements `/achievements`

This is the strongest desktop layout. Summary, trend, sticky logging, and history form one coherent workflow; mobile reflows intentionally. Add selected semantics, accessible history controls, progressbar semantics, and recovery for deletion. “New” appears both as a top action and a toggled editor header in source, so the create state should have one clear owner.

Verified states: populated metric at all viewports, disabled Add Result, mobile master-detail transformation.

### Workouts `/workouts`

Exercise metrics and history are flexible; plan AI generation explicitly creates an editable draft; quick repeat is useful. Default “Review session” is misleading when nothing has been started. New Plan expands into another large editor while blank session and history remain visible. Use distinct Plan/Session/History modes and show the session composer only after intent. Keep manual logging and AI generation as alternate starts to the same plan editor.

Verified states: empty Plans plus populated History at all viewports, New Plan editor, AI draft input (not sent), empty session validation presentation.

### Settings `/settings`

Settings contains real product depth—billing, notifications, rhythm, modules, calendar, tokens, appearance, and data controls—but presents it as one narrow, equal stack. It needs categorical IA before visual polish. The highest-risk local issues are unnamed switches, dead Export/Delete Account, stale API-key copy, broad Clear Cache behavior, and advanced token scopes mixed with routine preferences.

Verified states: all viewports, Midnight and White theme change (reverted), Calorie module toggle off/on (reverted), feature/nav response, controls and accessibility snapshot.

## 9. Responsive findings

Responsive verification used full-page baselines and viewport interaction at 1440×900, 1024×768, and 390×844. Mobile stacking alone was not treated as success.

| Screen | Desktop 1440 | Compact desktop/tablet 1024 | Mobile 390 | Recommended transformation |
|---|---|---|---|---|
| Today | Timeline plus AI rail; very tall but usable | Sidebar remains; AI rail too narrow | Intentional header/dock, but very long schedule and AI at end | Container-aware rail collapse; mobile Focus/signal/Anytime before timeline |
| Week | Two-column overview/agenda; long repeated list | Content is cramped after sidebar; truncation increases | Single column, but Habit repetitions dominate and summaries are late | Selected-day default; All Week mode; sticky/early summary; recurrence matrix instead of repeated cards |
| Add | Centered coherent form | Uses content width adequately | Correct stacking, but long and fixed dock overlays the current viewport | Keep one column; sticky/visible form state; module-aware domains; no arbitrary extra tabs |
| Talk | History plus chat uses width well | Narrower but workable | Purpose-built chat height/composer; large empty canvas is appropriate | Retain; accessible conversation selector; keep safe areas and keyboard behavior tested |
| Calories | Page is unnecessarily narrow for summary/detail | Similar single column | Large Weight and macro cards create long scroll | Desktop summary + entry/secondary split; compact mobile totals and quick log before list |
| Achievements | Strong master-detail | Summary/log panel begins to compress | Deliberate single-column sequence | Retain pattern; ensure selected/log state stays visible and controls named |
| Workouts | Wide page still stacks three modes | Editor/composer become dense | Very long stacked forms/history | Desktop master-detail; mobile Plans/Session/History modes |
| Settings | Large unused side area around narrow 2xl column | Same long column | Extremely long stack and tiny dense subsections | Desktop local category nav; mobile drill-down routes |
| Login | Centered panel with excessive decorative space | Stable | Fits, but visual hierarchy remains promotional | Keep responsive form; reduce ambient decoration and improve semantic mode/error state |
| Mobile drawer | N/A | N/A below 1024 | Width is appropriate; semantics/focus are not; status card can be obscured near footer | Accessible modal navigation, grouped destinations, scroll-safe account footer |

No major horizontal document overflow was visible in the captured default mobile pages, but some content is protected by truncation rather than adapted structure. The fixed bottom dock consumes a meaningful part of the 844 px viewport; page padding prevents final content from being unreachable, but frequent content passes behind the dock while scrolling.

## 10. Accessibility findings

### Verified violations or failures

These are separate from general usability suggestions:

| Finding | Evidence | Relevant WCAG concern |
|---|---|---|
| White-theme Week contrast failure | Live screenshot; core text disappears | 1.4.3 Contrast Minimum, 1.4.11 Non-text Contrast |
| 16×16 Habit check-in target | Playwright bounding box | 2.5.8 Target Size Minimum; also motor usability |
| Calorie dialog focus escapes and lacks name | Tab sequence reached footer/body; snapshot shows unnamed dialog | 2.4.3 Focus Order, 4.1.2 Name/Role/Value, modal dialog pattern |
| Mobile drawer lacks modal semantics/focus management | Snapshot exposes generic drawer plus background main; open/close unnamed | 2.4.3, 2.4.11, 4.1.2 |
| Settings switches unnamed/state not exposed | Snapshot lists unnamed buttons | 1.3.1, 4.1.2 |
| Calories and Achievement history actions unnamed | Snapshot lists unnamed edit/delete buttons | 2.5.3 Label in Name, 4.1.2 |
| Calories/Workouts header dates unnamed | Calories snapshot exposes unnamed date textbox | 1.3.1, 3.3.2, 4.1.2 |
| Loading spinner silent | Shared spinner is an unlabelled `div` | 4.1.3 Status Messages |
| Talk progress/new content not announced | No status/live region | 4.1.3 Status Messages |
| Progress visuals lack semantics | Bars/donuts have no progress role/value | 1.3.1, 4.1.2 |
| Achievement selection relies on color/dot | No pressed/tab selected semantics | 1.4.1 Use of Color, 4.1.2 |

### Accessibility-positive patterns

- Standard authenticated shell has banner, nav, and main landmarks.
- Most form fields have visible labels.
- HabitOutcomeSheet has strong dialog/focus behavior.
- Reduced-motion CSS stops major animations.
- Representative navigation links retain visible browser focus under reduced-motion emulation.
- Most mobile links/buttons receive global 44 px sizing, though compact overrides create exceptions.
- Text equivalents accompany many visual statistics, limiting—but not eliminating—chart/progress gaps.

### General accessibility improvements, not confirmed violations

- Permit text selection globally.
- Add a skip-to-main link for the persistent desktop shell.
- Use consistent menu semantics or simple popovers with Escape/outside-click and focus return for task action menus.
- Provide text data tables for charts.
- Test with VoiceOver/Safari and a hardware keyboard; this review inspected the accessibility tree and keyboard behavior but did not run a full screen-reader session.
- Keep status icons paired with text and do not use cyan/purple/red alone.

## 11. Design-system findings

### Product-level IA problems

- Core versus optional module contract is undefined and divergent.
- Global navigation is flat and lacks Plan/Health grouping.
- Projects are write-only metadata.
- Today does not yet compose day status into a decision model.
- Health routes lack shared date/units/status context.

### Design-system problems

- Week bypasses semantic tokens with a large inline dark-only system.
- No reusable accessible Switch is used for Settings.
- IconButton naming/target/recovery patterns diverge.
- Dialog behavior ranges from strong (Habit sheet) to partial (Calories) to native confirm.
- Delete/recovery policy differs by entity.
- Categories are duplicated and inconsistent between Add and Edit.
- Surface hierarchy is under-specified: many containers share similar radius, border, shadow, and glow.
- Status color semantics vary across cyan, purple, green, amber, rose, and hard-coded inline palettes.
- Global text selection is disabled.
- Custom focus styling is wrapped in `prefers-reduced-motion: no-preference`; the browser default remains visible in tested navigation, but branded focus treatment is inconsistent.

### Local screen problems

- Today/Week compact-width layout and hierarchy.
- Calories ordering and dialog implementation.
- Workouts always-visible composer and enabled invalid Save.
- Settings long stack and dead controls.
- Achievement history control names.
- Add module visibility and validation.

### Token and component recommendations

1. Define semantic surface levels: canvas, section, interactive row, selected/focus, overlay.
2. Define semantic text levels: primary, secondary, muted, disabled, inverse.
3. Define status tokens by meaning, not module color.
4. Define compact/comfortable density and touch-target rules separately.
5. Define radius tiers and stop choosing per screen.
6. Define motion tokens: immediate feedback, layout continuity, overlay; no ambient default motion.
7. Build accessible Dialog, Drawer, Switch, IconButton, DayNavigator, Progress, EmptyState, and destructive/Undo patterns.
8. Keep domain-specific components—timeline rows, Habit sheet, calorie quick insert—deep and purposeful rather than forcing everything into a generic Card.

## 12. Taste Skill visual review

### Design read

The applied Taste brief was: **a redesign-preserve audit of a personal productivity/health operating system for recurring daily use, with calm structured utilitarian product language; preserve HealthyFlow’s cyan identity while retiring generic AI-futurist excess.**

Target visual dials:

- **Design variance 4/10:** recognizable, not ornamental.
- **Motion intensity 3/10:** feedback and continuity, not constant activity.
- **Visual density 7/10:** information-rich but strongly aligned.

### What is deliberate today

- Dark midnight palette and cyan identity are consistent across most screens.
- Space Grotesk creates a recognizable voice.
- Selected navigation, primary actions, and health metric accents are recognizable.
- Timeline and Habit card forms are product-specific rather than generic component-library tables.
- Achievement layout shows that the visual system can support serious data without becoming sterile.

### Where the interface feels assembled/default

- The shell relies on the common AI-dashboard bundle: cyan/blue gradient, purple AI card, glass/backdrop blur, neon text, pulsing status dots, floating brand icon, and blurred background orbs.
- Nearly every section is a rounded bordered card, so a primary workspace, an empty state, a status summary, and an advanced editor can feel equally important.
- Pills are frequent for type, category, status, cadence, and filters; compact rows become tag-heavy.
- Week is visually bespoke through inline styles rather than intentionally distinct through shared tokens.
- Login’s “neural networks” copy makes the product sound more generic than the actual connected-day model.

### Typography, spacing, density, and shape

- Heading scale is generally clear, but neon/glow often carries hierarchy that should come from placement, size, and weight.
- Settings is dense inside cards but sparse across the page; the result is both cramped controls and excessive scroll.
- Today’s desktop schedule has useful density; mobile keeps density but loses hierarchy as sections stack.
- Radius usage ranges from small controls to large cards without a clear tier system.
- Full-width gradient buttons are overused for routine save actions, reducing the distinctiveness of the most important action.

### Color and motion discipline

- Cyan should remain the brand/current-focus color.
- Purple can identify Habit or AI only if it is semantic and not a default “AI look.”
- Red/amber signals need text/icon labels and gentler health language.
- Perpetual pulse/float/flicker/background motion should be removed from the daily shell. Keep motion for opening a sheet, applying a plan, dragging, completion, and state continuity.
- Confetti, sound, vibration, rocket copy, and glow should not all fire for routine completion. Milestone celebration can remain opt-in or occasional.

### Taste conclusion

HealthyFlow does not need a new unrelated aesthetic. It needs stronger hierarchy, fewer simultaneous effects, denser alignment, and product language centered on the day. The most distinctive future screen will be a well-composed day workspace—not a more decorative AI panel.

## 13. Recommended future experience

The future experience should let the user read one sentence from the UI: “Here is the shape of today, here is the next useful action, here is what can still fit, and here is the evidence behind any recommendation.”

### Recommended shell

- Today and Talk stay primary.
- Plan groups Week and a future real Projects destination.
- Health tools group Nutrition/Weight, Workouts, and Progress.
- Settings becomes categorical; developer connections are Advanced.
- A frontend module manifest makes route/nav/Add/widget/settings behavior agree.

### Recommended Today experience

- Date/week ribbon plus compact load/capacity status.
- Focus and Next connected to timed Items and obligations.
- One restrained AI signal summary with evidence and Apply/Edit/Dismiss through pending actions.
- Timeline as primary plan.
- Anytime visible alongside it on desktop and before it on mobile.
- Compact Habit and health summaries that link to focused workflows.

### Recommended planning experience

- Week selection filters the agenda or exposes an explicit All Week mode.
- Habit cadence stays aggregate until a day/Habit is selected.
- Calendar obligations and capacity are visible as constraints, not another widget.
- Moving or shortening an Item is explicit, confirmable, and undoable when safe.

### Recommended health experience

- Shared date navigator and units preference.
- Nutrition totals/targets before history; quick repeat remains central.
- Weight is accessible as a trend plus history.
- Workout plan/session/history become separate modes.
- Achievement master-detail pattern is retained and made accessible.
- Missing-data language remains neutral; no guilt or manipulative streak pressure.

### Recommended AI experience

- Keep typed pending actions and explicit failure.
- Explain evidence, assumptions, affected records, and expected outcome before confirmation.
- Move model IDs and raw tool traces to Advanced.
- Reuse the same proposal pattern for Today signals, calendar follow-ups, calorie review, scheduling, and project assignment.

See [UX_STRUCTURAL_REDESIGNS.md](UX_STRUCTURAL_REDESIGNS.md) for wireframes and desktop/mobile behavior.

## 14. Prioritized roadmap

### P0 — restore reliability, access, and trust

| Outcome | Findings | Effort |
|---|---|---|
| Make White-theme Week legible | HF-003 | Medium |
| Fix cold deep links and module-aware Add | HF-001, HF-002 | Small–Medium |
| Repair frequent accessibility controls | HF-007, HF-010, HF-016, HF-017, HF-035 | Small–Medium |
| Complete calorie-dialog focus behavior | HF-008 | Medium |
| Make mobile drawer accessible | HF-009 | Medium |
| Disable or implement dead privacy actions; correct Clear Cache | HF-011, HF-038 | Small |

### P1 — clarify the daily loop

| Outcome | Findings | Effort |
|---|---|---|
| Redesign Today’s decision band and mobile ordering | HF-004, HF-006, HF-041 | Large |
| Make Today/Week date behavior consistent | HF-019, HF-020 | Small |
| Convert Today signals into transparent proposals | HF-027, HF-034 | Medium |
| Put health status before logging history; add day navigation | HF-013, HF-014 | Medium |
| Make Week selection real and reduce repeated Habit rows | HF-005, HF-021, HF-022 | Large |

### P2 — establish scalable product structure

| Outcome | Findings | Effort |
|---|---|---|
| Group global navigation and define module manifest | HF-026, HF-043 | Large |
| Restructure Settings categories | HF-012 | Large |
| Restructure Workouts into Plan/Session/History | HF-023, HF-024 | Large |
| Add shared Health context/units/accessibility | HF-015, HF-036, HF-037 | Medium–Large |
| Add a real Projects destination if product scope supports it | HF-025 | Large |
| Normalize visual hierarchy and motion after structure | HF-030, HF-031, HF-032, HF-044 | Medium |

### Recommended first redesign target

**Today’s daily decision workspace** should be the first structural redesign. Before visual exploration, complete HF-001/HF-002 and agree on the module/navigation contract so Today does not inherit more conditionals. Prototype Today at all three target widths with real dense Lina/Maya/Amir days, not empty mock cards. Validate these five outcomes:

1. The next action is identifiable in under a few seconds.
2. Calendar obligations and capacity are understood together.
3. Schedule and Anytime can be compared while planning.
4. Habit/health progress is visible but does not compete with the plan.
5. An AI proposal states why, what changes, and how to edit/dismiss it.

## 15. Limitations of the review

- The live authenticated review used the existing Lina Health Tracker demo persona. The demo picker was inspected, but Maya, Noam, and Amir were not walked screen by screen.
- No demo calendar connection was available. Calendar placement was inspected in code; Google OAuth, real obligation density, sync conflict/error, and disconnect behavior were not live-tested.
- Lina had zero AI credits. Starter prompts, empty Talk, composer, source, pending-action components, and existing tests were inspected, but a new live AI response was not purchased or sent.
- Lina did not seed a duration-target Habit. The sheet implementation and data flow were inspected, and the existing mobile target-Habit E2E test passed; no target-Habit screenshot was captured.
- Admin-only Token Manager and Meal OCR Lab were code-inspected but not opened because the demo user is not an admin.
- PWA standalone mode, install prompt completion, notification permission, push delivery, offline behavior, audio narration, dictation permission, and actual screen-reader output were not fully exercised.
- Privacy and Terms routes were mapped but not treated as major workflow screens.
- Destructive confirmations were opened only when they could be cancelled. One Task native confirm was verified and dismissed. No real record or account was intentionally deleted.
- White theme and the Calorie module flag were changed in the Lina demo only long enough to validate behavior, then restored.
- Accessibility findings are based on code, accessibility snapshots, keyboard sequences, measured targets, and visual inspection. No automated axe suite exists in the repository, and no full VoiceOver/NVDA audit was performed.
- Full-page screenshots can place fixed mobile chrome at its viewport position within a tall capture. Interaction checks were also performed at the actual viewport, so findings do not rely only on full-page composition.
- Planned concepts not present in the current UI—Notes/reflections, available-capacity calculation, a module catalog/registry, event-derived follow-ups, and a Projects workspace—are reported as current gaps, not evaluated as implemented workflows.

