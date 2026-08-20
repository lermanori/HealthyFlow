# HealthyFlow structural redesign proposals

These proposals preserve the product’s day-centric thesis, current entities, existing routes where practical, and the HealthyFlow cyan identity. They are structural recommendations, not production implementation. Tabs are proposed only where they represent distinct user modes or preserve comparison context—not simply to shorten pages.

## 1. Reframe global navigation around the product model

### Current structure

The desktop sidebar is one flat list: Today, Talk, Week View, optional Calories, Achievements, Workouts, then Settings. Mobile keeps Today and Talk in the bottom dock and puts the same flat list in a drawer. “Features” in Settings is the only place that hints that health tools are optional. Projects are assignable metadata but have no destination.

### Proposed structure

Keep Today and Talk as the primary day loop. Group planning and health destinations without changing their initial URLs. Treat Settings and developer connections as utility/advanced destinations.

```text
┌──────────────────────────────────────────────────────────────┐
│ HealthyFlow                                      Account     │
├──────────────────┬───────────────────────────────────────────┤
│ TODAY            │                                           │
│  Today           │ Current route content                     │
│  Talk            │                                           │
│                  │                                           │
│ PLAN             │                                           │
│  Week            │                                           │
│  Projects*       │                                           │
│                  │                                           │
│ HEALTH TOOLS     │                                           │
│  Nutrition       │                                           │
│  Workouts        │                                           │
│  Progress        │                                           │
│                  │                                           │
│ Settings         │                                           │
└──────────────────┴───────────────────────────────────────────┘
* Show Projects only after it has a retrievable project workflow.
```

“Nutrition” can continue to route to `/calories`; “Progress” can continue to route to `/achievements`. The labels should be validated against the founder’s vocabulary before route renames. If product language stays Calories/Achievements, grouping still creates the mental model.

### User reasoning

Users start with the day, deliberately plan a week, or enter a focused health loop. Group labels answer “where am I?” and “what kind of work happens here?” Optional tools stop competing with the daily loop as peers.

### Desktop behavior

- Persistent labelled groups in the sidebar.
- Active route plus active group are visible without glow-heavy decoration.
- Health tools can collapse as a group only if all destinations remain one click away at normal desktop widths.
- Keep a small contextual status area only when it communicates actionable status; remove the duplicated “Talk ready” promotional card.

### Mobile behavior

- Preserve the approved two-destination dock: Today and Talk.
- Drawer groups mirror desktop and behave as an accessible modal navigation dialog.
- Do not add five health icons to the bottom dock.
- Talk remains the quick-capture surface; explicit Add stays reachable from Today and contextual empty states.

### Preserved functionality

All existing routes, module gates, account/logout controls, and mobile dock destinations can remain during the first slice.

### Implementation implications

- Centralize route/nav metadata before changing visuals.
- Resolve settings before building navigation.
- Add group analytics without changing existing route pageviews.
- Decide whether Calories/Achievements are truly optional; the approved packaging document says Calories/Weight should be on by default.

## 2. Turn Today into a daily decision workspace

### Current structure

Today is a sequence of kickoff, Now/Next, a full hourly schedule, Anytime, and an AI rail. Calories appear as timeline rows, but totals, weight, workout/achievement progress, calendar obligation load, and available capacity are not summarized. On mobile the AI rail moves after the entire timeline.

### Proposed structure

Use a task-oriented hierarchy: orient, decide, act, then inspect detail. Keep the timeline as the main artifact rather than converting everything to cards.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Sat 18 Jul     3 timed · 2 anytime     4h free     Talk / Add      │
│ Week ribbon                                                        │
├─────────────────────────────────────────────────────────────────────┤
│ FOCUS: Drink water at 07:30       NEXT: Walk at 13:15              │
│ Signal: 3 Habits at risk                     Review / Apply in Talk │
├───────────────────────────────┬─────────────────────────────────────┤
│ SCHEDULE + OBLIGATIONS        │ DAY CONTEXT                         │
│ 06:00                         │ Anytime (2)                         │
│ 07:30 Habit                   │ Habits 0/3                          │
│ 08:20 Meal                    │ Nutrition 870 kcal · 66g protein    │
│ 12:45 Meal                    │ Workout planned 18:00               │
│ 13:15 Habit                   │                                     │
│ 18:00 Task                    │ Advanced details / module widgets   │
└───────────────────────────────┴─────────────────────────────────────┘
```

This is not a marketing dashboard. The top band contains only information needed to choose the next action. “4h free” should appear only when capacity can be calculated from explicit calendar/timed obligations and a defined day range; otherwise show “Capacity unavailable,” not an estimate.

### User reasoning

The user needs the current focus, constraints, and remaining options together. Anytime tasks must stay visible while scheduling; health status should support the plan without pushing the schedule down; AI should point to affected records rather than occupy an isolated bright panel.

### Desktop behavior

- Above the fold: date/ribbon, focus/next, capacity/obligations, and the first schedule region.
- Timeline remains the wide primary column.
- A narrower sticky context column holds Anytime, Habit progress, compact health status, and expandable module widgets.
- AI signal appears as a restrained row near Focus; expanded rationale opens a drawer or Talk side panel while the day remains visible.
- Empty hour compaction stays; it must expand or clearly expose drop targets during drag.

### Mobile behavior

```text
┌──────────────────────────────┐
│ Sat 18 Jul       Talk / Add  │
│ Week ribbon                  │
├──────────────────────────────┤
│ Focus now                    │
│ Next · Capacity/obligations  │
│ 1 signal · Review            │
├──────────────────────────────┤
│ Anytime (2)          Expand  │
├──────────────────────────────┤
│ Schedule                     │
│ compacted hours + items      │
├──────────────────────────────┤
│ Habits · Health summary      │
└──────────────────────────────┘
```

- Keep the signal summary above the schedule; details are progressive disclosure.
- Place the Anytime shelf before the long hourly timeline, consistent with the approved packaging prototype verdict.
- Maintain 44×44 interaction areas without inflating visual rows.
- The fixed Today/Talk dock remains.

### Preserved functionality

Week ribbon, previous/next date, morning/midday/weekly kickoff, drag-and-drop, virtual Habit materialization, task completion/edit/delete, calendar rows, meal rows, Anytime ordering, AI signal dismissal, and module data remain.

### Implementation implications

- Introduce a composed day-summary view model; do not add ad hoc queries per widget.
- Define capacity inputs and failure states before displaying a number.
- Reuse existing query data to avoid another multi-query invalidation storm.
- Make layout container-aware at the content width left after the sidebar.

## 3. Make Week a planning master-detail view

### Current structure

Week combines a seven-day rail, weekly percentage, Up Next, a 16-row scheduled agenda, an 8-row Anytime agenda, a Habit consistency matrix, and a fixed five-category momentum summary. Day selection changes styling/streak context but not the task agenda.

### Proposed structure

Use the week rail as a real selection model. The left/primary area shows the selected day or All Week work; the secondary area keeps whole-week status and Habit cadence visible.

```text
┌─────────────────────────────────────────────────────────────────┐
│ My Week · Jul 13–19            ‹     All week / Today     ›     │
│ Mon 13  Tue 14  Wed 15  Thu 16  Fri 17  Sat 18  Sun 19          │
├───────────────────────────────────┬─────────────────────────────┤
│ SELECTED: SAT 18                  │ WEEK STATUS                 │
│ Obligations / timed work          │ 0/3 tasks · 0/21 Habits     │
│ 07:30 Drink water                 │ Capacity/load by day        │
│ 13:15 Walk                        │ Habit cadence matrix        │
│ 18:00 Upper body workout          │ Enabled health-tool status  │
│                                   │                             │
│ Anytime for Sat                   │                             │
│ Prep oats · Evening stretch       │                             │
└───────────────────────────────────┴─────────────────────────────┘
```

An “All week” mode shows one-time tasks and obligations grouped by day. Recurring Habits remain summarized in the matrix and expand only for a selected day or Habit. This preserves completion while avoiding 21 repeated cards.

### User reasoning

Week planning is about load, placement, and tradeoffs. A day selection must either filter the plan or be labelled as a different analytical control. The redesign keeps schedule and load comparable while preventing recurrence from dominating.

### Desktop behavior

- Two columns only when the content container can support them.
- Sticky week-status column; selected-day agenda is primary.
- Filters distinguish All, Tasks, Habits, Obligations, Completed and are reflected in the count.
- Drag between days is a later enhancement only if the data and error/undo behavior are robust.

### Mobile behavior

- Seven-day rail stays compact and horizontally stable.
- Selected day becomes the default agenda.
- “All week” is an explicit segmented option, not an implicit long list.
- Week status and Habit matrix follow the agenda or open from a sticky summary button; no dense 21-instance list.

### Preserved functionality

Week-start preference, date navigation, completion, Habit check-in, scheduled/Anytime distinction, progress counts, consistency, module status, and hidden-completed behavior remain.

### Implementation implications

- Make selected-day state drive selectors and accessible selected semantics.
- Deduplicate Habit-instance presentation without changing virtual-first storage.
- Derive module rows from the module manifest/settings.
- Use semantic theme tokens from the start.

## 4. Create one coherent daily Health workspace

### Current structure

Calories combines Weight, Entries, and Totals in one long page; Workouts and Achievements are separate top-level routes with their own date models. Health data appears in Today only as individual meal/task rows. Units are fixed and calorie/protein targets are absent.

### Proposed structure

Create a Health group/hub that shares a date navigator and summary, while preserving focused routes for detailed logging. Do not place every health datum in one screen.

```text
┌─────────────────────────────────────────────────────────────────┐
│ Health · Sat 18 Jul                     ‹  Today  ›   Quick log │
├─────────────────────────────────────────────────────────────────┤
│ Nutrition  870 kcal · 66g protein      Weight 70.9 kg · -0.3   │
│ Workout    Planned 18:00 / 1 logged    Progress 5K · improving │
├───────────────────────┬─────────────────────────────────────────┤
│ Nutrition day log     │ Quick repeat / Add entry               │
│ entries + totals      │ Weight today / recent trend            │
│                       │ Missing-data explanation                │
└───────────────────────┴─────────────────────────────────────────┘
  Local nav: Nutrition · Workouts · Progress
```

The summary uses neutral language. Targets appear only when configured. Missing data says “Nothing logged” and offers an action; it does not imply failure.

### User reasoning

Logging is frequent and date-based; comparing totals, target, recent items, and mistakes should not require three global navigation jumps. Workouts and achievements remain distinct tasks, but they share the same day and units/preferences.

### Desktop behavior

- Health local navigation or subroutes; current routes can redirect/alias during migration.
- Shared date/capacity context remains visible.
- Nutrition: totals/targets at top, entry list as primary, Weight in a secondary panel.
- Workouts: plan list plus active session workspace; History is subordinate.
- Progress: retain the strong achievement master-detail layout.

### Mobile behavior

- Compact summary plus a single Quick log action.
- Nutrition entry, Weight, Workout, or Result is chosen in a bottom sheet/quick-add flow.
- Focused detail routes avoid loading every health tool into one long page.
- Previous/Today/Next remains consistent everywhere.

### Preserved functionality

Calorie AI/manual/quick repeat, macro editing, one Weight entry per date, trend, workout plans/sessions/exercises/history, achievement definitions/results/trends, and Today meal rows remain.

### Implementation implications

- Add a shared HealthDayContext and day navigator rather than synchronizing independent local states manually.
- Keep canonical storage units and add display conversion at the view/form boundary.
- Product decision required for calorie/protein targets and opt-out behavior.
- Route migration must keep bookmarks and analytics meaningful.

## 5. Restructure long vertical workflows by user mode

### Current structure

Workouts and Settings are the clearest long-stack failures. Workouts shows plan management, blank session composition, and history at once. Settings mixes seven unrelated categories in a single narrow column. Add is long but remains one coherent creation form and does not need arbitrary tabs beyond its real domains.

### Proposed structure

Use modes when the user goal changes; use progressive disclosure when the goal is the same but details are advanced.

#### Workouts

```text
Desktop
┌──────────────┬──────────────────────────────────────┐
│ Plans        │ Active session / selected plan       │
│ + New plan   │ Exercises, metrics, notes, Save      │
│ Recent       │                                      │
├──────────────┴──────────────────────────────────────┤
│ History (collapsed preview → dedicated mode)        │
└─────────────────────────────────────────────────────┘

Mobile: [Plans] [Session] [History]
```

Plans, Session, and History are legitimate modes because each has a different primary action and object. The blank session editor appears only after Log without plan or Start Session.

#### Settings

```text
┌──────────────────┬──────────────────────────────────┐
│ Account & Billing│ Selected settings category       │
│ Planning         │                                  │
│ Notifications    │ Controls with inline save/status │
│ Health tools     │                                  │
│ Appearance       │                                  │
│ Connections      │                                  │
│ Data & Privacy   │                                  │
└──────────────────┴──────────────────────────────────┘
```

On mobile each row drills into a dedicated category route with a Back to Settings link. Connections/API token scopes are marked Advanced.

### User reasoning

The layouts stop forcing unrelated decisions into one scroll. They preserve context within a mode and keep primary actions adjacent to the content they change.

### Desktop behavior

- Master-detail or local sidebar at wide sizes.
- Sticky local navigation only when it does not compete with global navigation.
- Advanced fields disclose in place; destructive actions remain in Data & Privacy.

### Mobile behavior

- One mode/category per screen.
- Back navigation preserves unsaved state or explicitly confirms discard.
- No desktop two-column form squeezed into the mobile viewport.

### Preserved functionality

All existing form fields, AI workout generation, quick repeat, planning rhythm, module toggles, billing, calendar connection, tokens, theme, and privacy actions remain.

### Implementation implications

- Route or query-param state should be shareable and back-button safe.
- Extract settings sections without duplicating fetch/mutation logic.
- Add unsaved-change handling for editors.

## 6. Formalize the frontend module contract

### Current structure

Calories, Achievements, and Workouts are toggles with conditionals spread through App, Layout, Add, Week, Settings, and analytics. The planned module concept—screens, data, widgets, and actions—is not represented as an explicit frontend contract.

### Proposed structure

Create a presentation manifest, not a new business-logic layer. Domain logic stays in the existing deep services.

```text
Module manifest
├─ id / label / description
├─ enabled(settings) / availability
├─ routes
├─ navigation group + order
├─ quick-add domains/actions
├─ Today summary/widget contribution
├─ Week status contribution
├─ empty/loading/error copy
├─ permissions / data sensitivity
└─ analytics key

           ┌──────── App routes
manifest ──┼──────── Navigation
           ├──────── Add / quick actions
           ├──────── Today / Week slots
           └──────── Settings catalog
```

### User reasoning

Users should be able to answer what a tool adds and what happens when it is hidden. The same module should not be enabled in navigation but absent in Add, or counted in Week while disabled.

### Desktop behavior

- Health tools can contribute compact Today/Week status only when enabled and useful.
- Settings shows what each tool adds: destination, quick action, and Today/Week contribution.
- Module empty states link to configuration or first action.

### Mobile behavior

- Modules do not automatically earn bottom-dock space.
- Drawer/Health local navigation is derived from the manifest.
- Quick actions appear in Talk/Add based on enabled modules.

### Preserved functionality

Existing domain services, routes, settings fields, analytics names, and module-specific screens remain. This proposal centralizes presentation registration only.

### Implementation implications

- Resolve loading/error/disabled separately; `undefined` must never mean disabled.
- Define behavior for hidden existing data.
- Add manifest contract tests: enabled route, nav, Add, Today, Week, and Settings must agree.
- Avoid a plugin runtime until real external modules require one.

## 7. Unify cross-feature planning and AI actions

### Current structure

Today signals are dismiss-only. Talk can create/edit records through pending actions with confirm/cancel. Add has separate manual and AI modes. Projects can be attached during creation but not revisited. Calendar obligations, capacity, health status, and follow-up tasks do not form one visible planning transaction.

### Proposed structure

Use the existing pending-action model as the single confirmation pattern for cross-feature changes. Every proposal states evidence, records affected, and outcome before applying.

```text
Signal / user request
        │
        ▼
┌────────────────────────────────────────────┐
│ Proposal                                   │
│ “Move Upper body workout to 19:00”         │
│ Why: calendar obligation ends at 18:30     │
│ Affects: Task · Sat 18 Jul · 45 min        │
│ [Edit] [Apply] [Dismiss]                    │
└────────────────────────────────────────────┘
        │ confirmed
        ▼
Update record → invalidate day/week/health → Undo when safe
```

Examples that fit the current concepts:

- Calendar event ends → propose a follow-up Task with source event shown.
- Capacity conflict → propose moving or shortening an Item; never silently rewrite.
- Habit target progress → log a chunk from Today and reflect it in Week.
- Workout session → optionally link completion back to a planned workout Item without conflating the two entities.
- Meal logged in Talk → show the same calorie review form before confirmation.
- Project context → suggested Task carries a visible project assignment that can be edited.

### User reasoning

The product becomes a personal operating system when actions across areas feel like one accountable plan, not when every datum is placed on one dashboard. A shared proposal pattern gives continuity and trust.

### Desktop behavior

- Proposal can open in a side panel while Today/Week remains visible for comparison.
- Affected records link to their detail/edit context.
- Applied changes show concise result plus Undo where technically safe.

### Mobile behavior

- Proposal is a focused sheet with summary first and advanced rationale collapsed.
- Apply/Edit/Dismiss stay within thumb reach and do not hide the affected date/item.
- Returning from Talk restores the prior Today/Week scroll and selection.

### Preserved functionality

Talk conversations, tool events, pending actions, Add forms, task/habit/calendar/calorie/workout/achievement entities, explicit AI failure, and server-keyed AI remain.

### Implementation implications

- Reuse typed pending-action schemas and confirmation endpoints.
- Add source/relationship metadata only where the domain model can support it; do not infer event follow-ups silently.
- Define idempotency and undo per action.
- Keep raw tool traces available only as Advanced diagnostics.

## 8. Establish a calmer, denser visual direction after structure is fixed

### Current structure

HealthyFlow has a recognizable dark cyan identity, but neon headings, gradient primary controls, purple AI surfaces, animated glows, floating icons, pulsing status dots, rounded cards, and blurred background orbs are applied broadly. Week also has a separate inline visual language.

### Proposed structure

Taste dials for this product:

- **Design variance:** 4/10 — recognizable but stable across daily repetition.
- **Motion intensity:** 3/10 — feedback and continuity, not ambient activity.
- **Visual density:** 7/10 — information-rich, with compact rows and deliberate whitespace.

Visual rules:

- Preserve cyan as the action/current-focus color; use neutral ink/surfaces for most content.
- One dominant emphasis per viewport: current focus, active editor, or primary confirmation.
- Reserve gradients/glow for rare emphasis; remove perpetual animation from brand, active nav, and background.
- Use three surface levels at most: canvas, section, overlay. Interactive rows need not each be cards.
- Use shape consistently: smaller row radius, medium section radius, larger overlay radius.
- Use status color plus icon/text; never status color alone.
- Retain Space Grotesk only if local/offline loading and body readability are acceptable; otherwise pair a restrained display face with a high-legibility UI face.

### User reasoning

The product should feel calm and credible over hundreds of daily opens. Distinction should come from the connected-day model, timeline, and interaction quality—not generic AI decoration.

### Desktop behavior

Higher information density, fewer nested borders, stronger alignment, and more space devoted to the plan rather than surface chrome.

### Mobile behavior

Compact rows with full touch targets, fewer full-width promotional cards, restrained sticky chrome, and progressive disclosure for secondary metrics.

### Preserved functionality

Dark and White themes, cyan identity, icons, motion for direct feedback, and current component behavior remain; the change is hierarchy and discipline.

### Implementation implications

- Tokenize Week before restyling it.
- Create surface, radius, status, focus, and motion tokens with usage guidance.
- Audit contrast and reduced motion in both themes.
- Roll out screen by screen after the navigation and Today architecture are agreed.

