# HealthyFlow UX quick wins

These items have high user value and appear achievable with Small or Medium effort. They do not replace the structural redesigns.

## 1. Stop enabled health routes redirecting on refresh

- **Current problem:** `/calories` and `/achievements` redirect to Today while settings are still undefined, even when the modules are enabled.
- **Proposed change:** Show a short settings-resolution state, preserve the requested URL, and decide enablement only after the query settles.
- **Affected components:** `src/App.tsx`, `src/hooks/useSettings.ts`, `src/components/LoadingSpinner.tsx`.
- **Expected result:** Bookmarks, refresh, notifications, and deep links open the intended screen.
- **Risk:** Low. Test enabled, disabled, slow, error, and cached settings paths.

## 2. Repair Week View in White theme

- **Current problem:** Hard-coded dark-page colors make task titles, summary copy, and cards disappear in White theme.
- **Proposed change:** Map Week surfaces, text, borders, statuses, and selection to existing semantic tokens. Add screenshot/contrast coverage for both themes.
- **Affected components:** `src/pages/WeekViewPage.tsx`, `src/index.css`, `tailwind.config.js`.
- **Expected result:** Weekly planning is legible in every advertised theme.
- **Risk:** Medium. Week contains many inline styles; verify every selected, completed, hover, and empty state.

## 3. Make mobile completion controls tappable

- **Current problem:** A compact Habit check-in target measured 16×16 px on mobile.
- **Proposed change:** Keep the glyph size but wrap it in a 44×44 interactive area; retain row density by using negative visual space rather than shrinking the hit box.
- **Affected components:** `src/components/TaskCard.tsx`, `src/components/DayTimeline.tsx`, `src/index.css`.
- **Expected result:** Fewer missed taps on the most frequent daily action.
- **Risk:** Low. Check that the larger target does not collide with drag or row navigation.

## 4. Complete the calorie-dialog accessibility pattern

- **Current problem:** The quick-insert dialog is unnamed and keyboard focus escapes to footer links.
- **Proposed change:** Add `aria-labelledby`, a focus trap, inert background, Escape/backdrop behavior, and focus restoration to Add Entry.
- **Affected components:** `src/pages/CaloriesPage.tsx`; optionally extract the already stronger pattern from `src/components/HabitOutcomeSheet.tsx`.
- **Expected result:** Keyboard and screen-reader users can complete fast logging without losing context.
- **Risk:** Medium. Test nested search/list keyboard behavior and mobile virtual keyboards.

## 5. Name every icon control and settings switch

- **Current problem:** Mobile navigation controls, Settings toggles, calorie row actions, achievement-history actions, and health header dates lack accessible names or states.
- **Proposed change:** Introduce named IconButton and Switch primitives; add entry-specific labels, `role="switch"`, `aria-checked`, and labelled dates.
- **Affected components:** `src/components/Layout.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/CaloriesPage.tsx`, `src/pages/AchievementsPage.tsx`, `src/pages/WorkoutsPage.tsx`.
- **Expected result:** Removes several high-severity accessibility failures with one reusable pattern.
- **Risk:** Low. Avoid duplicating visible text in screen-reader output.

## 6. Hide or honestly disable dead privacy actions

- **Current problem:** Export Data and Delete Account look active but do nothing.
- **Proposed change:** Until complete workflows exist, render them disabled with concise availability copy. Do not show destructive styling for a nonfunctional action.
- **Affected components:** `src/pages/SettingsPage.tsx`.
- **Expected result:** Restores trust around data ownership and account controls.
- **Risk:** Low. Confirm whether support currently handles either operation manually and provide the correct contact path if so.

## 7. Make all week calculations use the user preference

- **Current problem:** Week View honors First Day of Week, while Today’s ribbon is hard-coded to Monday.
- **Proposed change:** Centralize week-start calculation and use it for Today, Week, weekly range labels, and quick-date helpers.
- **Affected components:** `src/pages/TodayPage.tsx`, `src/pages/WeekViewPage.tsx`, `src/utils/dateHelpers.ts`, `src/hooks/useSettings.ts`.
- **Expected result:** Date navigation stops changing its model between screens.
- **Risk:** Medium. Date boundaries and cached query keys need Sunday-, Monday-, and nonstandard-start regression tests.

## 8. Put calorie/protein status before the entry history

- **Current problem:** Daily totals are below Weight and the full meal list; there are no target or remaining values.
- **Proposed change:** Move a compact daily summary beside the date and Add Entry. If no targets exist, label values as totals rather than showing empty warnings.
- **Affected components:** `src/pages/CaloriesPage.tsx`; target fields/settings if product-approved.
- **Expected result:** Users know what to log next before scanning history.
- **Risk:** Medium. Introducing targets requires product/data decisions; moving the existing totals does not.

## 9. Add consistent previous/today/next health navigation

- **Current problem:** Calories and Workouts require repeated native date-picker use for adjacent days.
- **Proposed change:** Reuse one labelled day-navigation control with previous, Today/current label, next, and optional date jump.
- **Affected components:** `src/pages/CaloriesPage.tsx`, `src/pages/WorkoutsPage.tsx`, `src/utils/dateHelpers.ts`.
- **Expected result:** Faster correction and comparison across daily logs.
- **Risk:** Low. Define whether future dates are allowed per log type.

## 10. Prevent empty workout-session submission

- **Current problem:** Save Session remains bright and enabled with no title or exercise even though the empty state says an exercise is required.
- **Proposed change:** Disable Save Session until minimum requirements are met; keep requirements inline and focus the first invalid field on any failed submit.
- **Affected components:** `src/pages/WorkoutsPage.tsx`.
- **Expected result:** Removes a predictable validation failure and clarifies the session flow.
- **Risk:** Low. Preserve editing of partially populated sessions and any valid title-default behavior.

## 11. Add recovery to Daily Signals

- **Current problem:** An AI Signals failure shows “Could not load” without Retry; actionable suggestions only offer Dismiss.
- **Proposed change:** Add Retry and Open Talk to the error state. For actionable signals, add a link to the affected item and an Apply/Edit entry point using the existing pending-action model.
- **Affected components:** `src/components/AIRecommendationsBox.tsx`, `src/pages/AssistantPage.tsx`.
- **Expected result:** AI failure is recoverable and AI advice can affect the plan transparently.
- **Risk:** Medium. Do not let a dashboard shortcut bypass pending-action confirmation.

## 12. Use one category definition everywhere

- **Current problem:** Add offers Grocery and Nutrition, but Edit does not.
- **Proposed change:** Define category labels, colors, availability, and order once and reuse them in Add, Edit, AI mapping, and badges.
- **Affected components:** `src/pages/AddItemPage.tsx`, `src/components/TaskEditModal.tsx`, `src/components/TaskCard.tsx`, shared domain UI metadata.
- **Expected result:** Records remain editable and category language stops drifting.
- **Risk:** Medium. First decide how Grocery/Nutrition fit the approved “hide until wired” packaging decision.

## 13. Make Add respect enabled domains

- **Current problem:** A disabled Calorie module still appears in Add and can create data the user cannot then view.
- **Proposed change:** Render Add tabs from resolved settings, or remove the module gate consistently if Calories/Achievements are being promoted to core.
- **Affected components:** `src/pages/AddItemPage.tsx`, `src/hooks/useSettings.ts`, `src/App.tsx`.
- **Expected result:** No dead-end create flow; module visibility has one meaning.
- **Risk:** Medium. Preserve direct links to the current tab and decide what happens to existing hidden data.

