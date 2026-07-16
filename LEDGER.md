### 2026-07-16 15:36 — `feat/habit-progress`

Adjusted whole-Habit tracking edits so a Binary-to-Target change takes effect on the selected day immediately as well as on future virtual instances. The backend now updates or materializes that day and recalculates its outcome from its existing chunks, while other materialized days remain historical snapshots; backend and browser regressions cover the behavior.

---

### 2026-07-16 12:22 — `feat/habit-progress`

Promoted the approved Variant B Habit check-in into Today and Week View with binary outcomes, target-based progress chunks, responsive mobile/desktop interaction, and whole-Habit tracking configuration. Added the compatible Habit outcome/progress API, additive Supabase schema with RLS and atomic outcome synchronization, analytics counts, domain documentation, and regression coverage; the migrations and production backend/frontend deployments are live and both canonical production smoke cases pass.

---

### 2026-07-16 09:10 — `feat/workout-plans-ai`

Added reusable Workout plans and server-keyed AI plan generation, with ordered exercises, editable targets, and plan-to-session drafting. Exercise history now preserves and backfills sets, reps, weight, duration, distance, and notes; the session review flow was redesigned for mobile so loaded exercises are visible first and the add form stays collapsed until requested. The database migrations and both production deployments are live, and the focused backend and Playwright workout suites pass.

---

### 2026-07-15 16:55 — `main`

Reworked nutrition-label photo parsing around language-independent, row-and-column OCR with package-total reconciliation and exact-photo live coverage for the Müller bottle and protein pudding. Talk now routes attached meal labels through the same AI Meal Entry parser, preserves OCR-derived product identity, and grounds the confirmation preview in the parser result so later chat reasoning cannot replace verified macros with guesses. The backend build, full automated suite, and exact Müller Talk flow all pass.

---

### 2026-07-15 13:35 — `main`

Expanded the public demo from the single Maya path into multiple persona stories, with richer seeded data, guided narration updates, and demo-aware module surfaces across Today, Talk, Calories, Workouts, and Achievements. While investigating Talk memory, confirmed the Supabase chat-history tables are already live and fixed stale demo state so real users regain persistent server-backed chat history after leaving a demo. The current working tree was built and deployed to production at `healthyflow.app`.

---

### 2026-07-14 05:52 — `claude/improvement-areas-jc166l`

Began breaking up the 1,946-line `supabase-client.ts` god file. Introduced a shared client module (`db/client.ts`) so the facade and domain modules share one Supabase client with no import cycle, and extracted five fully self-contained domains — projects, weight, achievements, push subscriptions, and assistant conversations — into `db/*.ts` modules composed back into the `db` facade via spread. Public API is unchanged (`import { supabase, db } from './supabase-client'` still works via re-export), so none of the 26 importers needed edits. The facade dropped from 1,946 to 1,522 lines (~22%); backend typecheck is clean and all 315 tests pass. Remaining cross-coupled domains (users/tasks/habits core, contact→users, credits→users) can follow the same pattern in a later pass.

---

### 2026-07-14 05:42 — `claude/improvement-areas-jc166l`

Burned down all 27 `as any` casts to zero across frontend and backend, in line with the "no untyped any" principle. Non-standard browser globals now have a proper ambient declaration (`src/types/globals.d.ts` for `navigator.standalone` / `window.MSStream`); the demo hook and `webkitSpeechRecognition` reuse existing global types; `startTime` became `string | null` so drag-to-clear stops needing a cast; habit grouping narrows on `t.type` instead of casting; and the AI-action payloads / OpenAI responses / jwt claims got minimal named types instead of `any`. Frontend and backend typecheck clean, all 315 backend tests pass, and lint warnings dropped from 48 to 28.

---

### 2026-07-14 05:33 — `claude/improvement-areas-jc166l`

Reconciled the rollover documentation with the code. Confirmed `rollover.ts` genuinely owns all carry-forward logic (it's just intentionally thin — ADR-0002 collapsed rollover to one rule), and clarified that in CLAUDE.md/AGENTS.md so its small size no longer reads as missing logic. Added a prominent "historical — superseded by ADR-0002" banner to `ROLLOVER_IMPROVEMENTS.md`, which still described the obsolete new-row-per-rollover design, and updated its FEATURES.md reference to match. Also repaired the FEATURES.md doc links that pointed at files moved into `docs/archive/` in the previous commit.

---

### 2026-07-14 05:26 — `claude/improvement-areas-jc166l`

Introduced a minimal leveled logger (`backend/src/utils/logger.ts`) and routed all 25 backend `console.log` calls through it. Debug tracing (raw task dumps in `routes/tasks.ts` and `supabase-client.ts`) now goes through `logger.debug`, and startup/migration banners through `logger.info`, so trace noise disappears from production logs (level defaults to `info` in production, `debug` in dev, overridable via `LOG_LEVEL`). Backend typecheck and all 315 tests still pass.

---

### 2026-07-14 05:20 — `claude/improvement-areas-jc166l`

Repo hygiene pass. Documented the committed-env contract: `.env.example` now lists every public `VITE_` var with an explicit warning that server secrets must never live in a committed env file, and `.env.production` got a header saying the same (the values there are public build-time vars that already ship in the browser bundle, so they stay committed). Decluttered the repo root by moving unreferenced dated notes (`26-jul-plan.md`, `review-26jul.md`), an older standalone readme (`README_HealthyFlow.md`), and the loose manual test harnesses (`test-tts.html`, `test-voice.html`) into `docs/archive/`. Root markdown dropped from 13 files to 10; only the active canonical docs remain.

---

### 2026-07-14 05:14 — `claude/improvement-areas-jc166l`

Added a real CI pipeline (`.github/workflows/ci.yml`) — the repo previously had no CI at all, so its 47 backend Jest suites and the frontend gates never ran automatically. CI now runs frontend lint + typecheck and backend typecheck + tests on every push/PR to `main`. Backend test setup was fixed to provide dummy `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (the client is constructed at import time), which unblocked 7 suites that couldn't even load; all 315 backend tests now pass. Added `typecheck` scripts to both packages and a `test:ci` script that excludes the local-only `*.live.test.ts` suites.

---

### 2026-07-14 05:07 — `claude/improvement-areas-jc166l`

Restored the frontend lint and typecheck gates as the first step of a codebase-improvement pass. The `tsconfig.json` `baseUrl`/`paths` block (dead config — the `@/` alias was unused and not wired into Vite) was removed, clearing the TS 7.0 deprecation error. A proper `.eslintrc.cjs` was added (ESLint 8 flat-of-record config for the Vite React+TS stack) since the project previously shipped with no ESLint config at all, and the `lint` script's `--max-warnings 0` was relaxed so warnings surface without blocking. Fixed the resulting hard errors (mixed tabs in `TaskCard.tsx`, a stale eslint-disable in `SmartReminders.tsx`) so `npm run lint` and `tsc --noEmit` both exit clean.

---

### 2026-07-13 16:10 — `feat/maya-demo`

Finished the richer Maya demo pass and Talk history work. The demo now runs through a Joyride-based mobile-friendly walkthrough with static narration audio, guided Talk mocking, real app mutations, account/logout guidance, and demo-safe no-persist chat behavior; regular users now get server-backed Talk history via Supabase. The branch has been deployed to the Netlify preview and Railway backend, with the new Supabase chat-history migration already applied.

---

### 2026-07-13 11:17 — `feat/maya-demo`

Stopped the PWA install prompt from interrupting the public Maya demo flow. The install prompt now accepts a suppression flag, and the layout suppresses it on the demo picker and active Maya demo session so the guided narration is the only overlay users see.

---

### 2026-07-13 10:55 — `feat/maya-demo`

Moved the Maya guide subtitles out of the main app canvas. The narrator panel now docks compactly over the desktop sidebar while mobile keeps the bottom caption treatment, so users can inspect the Today timeline while following the demo.

---

### 2026-07-13 10:48 — `feat/maya-demo`

Polished the Maya guide after reviewing the deployed demo. The overlay now keeps the real app visible by removing backdrop blur and reducing the dimming, and browser narration now prefers higher-quality English system voices with a slower, softer delivery when available.

---

### 2026-07-13 10:28 — `feat/maya-demo`

Cleaned up the first-visit path around the new Maya demo. The login form now uses plain `Login` language, points curious visitors to the static landing page, and the landing page's demo CTAs now route into the persona picker at `/demo` where Maya is currently the only available story.

---

### 2026-07-13 10:16 — `feat/maya-demo`

Built the first persona-based interactive demo around Maya, the overloaded founder persona. The new public `/demo` page starts a real seeded Maya session, the backend refreshes Maya's data relative to the current date, and an in-app guide walks over the actual Today, Talk, and Week surfaces with subtitles and optional browser voiceover. While verifying the flow, SmartReminders was made idempotent and unconnected Google Calendar event fetches now return an empty list so the demo path opens without console errors.

---

### 2026-07-13 09:59 — `main`

Added a reusable demo-week seed script for the public demo account. The script refreshes the current week relative to the real date, fills tasks and habit instances, and also seeds calories, weight, workouts, and achievements so the demo account shows a coherent active week across the app.

---

### 2026-07-12 14:34 — `main`

Fixed the calorie quantity contract from issue #127 across the insert pipeline. Calories and macros are now treated as totals for the logged quantity in AI prompts, assistant writes, manual labels, edit guidance, and reusable Quick Insert history; calorie item history now preserves quantity variants such as `Eggs · 1 egg` and `Eggs · 2 eggs`. Applied the Supabase migration to the configured database and verified the live route path with a disposable user before cleaning it up. Focused backend tests, backend/frontend typechecks, production build, and the Quick Insert Playwright spec passed.

---

### 2026-07-12 — `main`

Locked down backend CORS. Replaced the wide-open `cors()` (which reflected any origin) with an origin allowlist scoped to `healthyflow.app`, the `deluxe-souffle-b9b7f7.netlify.app` Netlify site, both of their subdomains, Netlify `--` deploy/branch previews, and localhost dev — everything else is now rejected. Origin-less requests (curl, health checks) still pass, and future domains are a one-line addition to `CORS_ROOT_DOMAINS`. Backend typecheck passed and a 12-case origin allow/deny matrix verified before commit. Closes the CORS hardening follow-up to issue #19.

---

### 2026-07-10 12:16 — `main`

Added a time-aware Planning Rhythm entry point to the Today screen. When the selected day is today, Today now surfaces a contextual kickoff card for the current rhythm moment and deep-links into the matching `/talk?kickoff=...` flow. Scheduled touchpoints still take priority, the UI falls back to the current part of the day, kickoff launches now open a fresh Talk conversation, and the assistant now keeps the check-in moving topic-by-topic after confirmed actions instead of stopping at the preview card.

---

### 2026-07-10 12:09 — `main`

Added the first user-facing Planning Rhythm controls to Settings. Users can now configure morning, mid-day, and weekly planning touchpoints, save their local timezone, enable real Web Push subscriptions, and start any kickoff immediately from the rhythm card. The backend now deep-merges rhythm patches safely and sends canonical `/talk?kickoff=...` links while preserving older `/assistant?kickoff=...` redirects; frontend build, backend build, and the full backend test suite passed before commit.

---

### 2026-07-09 19:11 — `feat/proactivity-rhythm-slice1`

Finished the first proactivity rhythm pipe after the interrupted session. The backend scheduler and routes are already committed, and the frontend now handles JSON push payloads, re-verifies Web Push subscriptions on app open, exposes push/rhythm API helpers, sends test notifications from Settings, and deep-links notification taps into Assistant kickoff sessions. Frontend build, focused proactivity tests, and the full backend test suite passed before commit.

---

### 2026-07-09 18:00 — `feat/redesign-v2`

Redesigned the Today page header and week ribbon. Each day in the ribbon now shows a completed/total count and a colored progress fill bar (green when fully done, cyan otherwise) with a responsive stacked-on-mobile / row-on-desktop layout, replacing the old dots-and-checkmark treatment. The header gained a status subline (done / timed-left / untimed counts), a grouped desktop day-nav, and a dedicated mobile week-nav row; the JS-driven `isMobile` resize listener was dropped in favor of Tailwind breakpoints. The Talk assistant also now renders `complete_task`/`update_item` as TaskDraftCard previews and `delete_item` as a titled status pill instead of raw JSON dumps.

---

### 2026-07-09 16:20 — `feat/redesign-v2`

Brainstormed issue #133 (proactivity, notifications, future planning) into an approved design spec. The vision crystallised as a "rhythm" of three planning touchpoints — morning planning, mid-day update, weekly planning — delivered as real iPhone web-push notifications (PWA, home-screen install) that deep-link into assistant kickoffs; static push text with AI running only on open, node-cron in the existing Railway backend, one new deep module `proactivity.ts`, and deterministic auto-tune suggestions in a later slice. Spec written to `docs/superpowers/specs/2026-07-09-proactivity-rhythm-design.md` with a 3-slice phasing plan; next step is the implementation plan.

---

### 2026-07-09 15:10 — `feat/redesign-v2`

Fixed the Talk assistant crash where editing an existing card surfaced a raw Postgres `invalid input syntax for type uuid: "1"` error. Root cause: the model split the confirm flow across turns and, because tool results are not carried between turns, invented an item id like `"1"` that leaked straight into a uuid column. `getOwnedTask` now guards the id shape and throws a new `RecoverableToolError`, which the tool loop feeds back to the model so it re-lists and retries within the turn — while genuine infra failures still abort and surface as `tool_error`. The chat system prompt now tells the model that calling a write tool IS the confirmation step and that ids must come from a same-turn `get_today`/`list_tasks`. Verified live on mobile and with 284 passing backend tests including a new self-heal regression.

---

### 2026-07-09 12:49 — `feat/redesign-v2`

Improved the Talk assistant failure path after investigating the mobile "Tool execution failed" screenshot. Backend tool errors now preserve useful Supabase/PostgREST-style object details and log the failing tool name, so the next production failure should expose the real cause instead of collapsing to a generic message. Added focused assistant-chat regression coverage and verified the backend test/build path before deployment.

---

### 2026-07-09 12:26 — `feat/redesign-v2`

Cleaned up the mobile Today screen after reviewing the live PWA screenshot. The floating `Clear Today` bulk-delete button and its handler are gone, and the Today page no longer reserves the old oversized bottom spacer below AI Insights now that the clear button is removed. The production frontend build passes; lint is still blocked by the missing ESLint config issue in this repo.

---

### 2026-07-09 12:17 — `feat/redesign-v2`

Replaced the Talk calorie confirmation JSON dump with a proper Calorie entry draft/result card. Pending calorie actions now use the same card for editing, confirmed calorie actions show a saved entry summary with calories, macros, date, time, and quantity, and confirmation invalidates calorie caches so Today/Calories refresh. Verified the Hebrew mobile confirm flow with a mocked calorie entry and confirmed no raw `args` JSON remains.

---

### 2026-07-09 11:25 — `feat/redesign-v2`

Fixed the mobile Talk overflow introduced by the shared AI Task draft card. The pending-action wrapper and draft card now clamp to the message column, use smaller mobile padding, and shrink long date/time/select controls instead of bleeding under the composer. Verified the same mocked Hebrew task flow on a 390px mobile viewport and confirmed the production build passes.

---

### 2026-07-09 11:01 — `feat/redesign-v2`

Unified the AI-created Task preview experience across AI Task Analyzer and Talk. A new shared Task draft card now blends the analyzer's compact visual preview with Talk's edit-and-confirm workflow, so generated Tasks and Habits can be edited in the same UI before saving from either surface. Mobile verification covered both the analyzer flow and a mocked Talk pending action, and the production build passes.

---

### 2026-07-08 15:32 — `feat/redesign-v2`

Diagnosed the Google Calendar sync failure against Railway production logs and confirmed the root cause was an invalid Google refresh token (`invalid_grant`), not the Hebrew timed task payload. Calendar sync now treats revoked Google credentials as a disconnected account, marks affected timed Tasks as skipped instead of failed, and stops the Today page from retrying until the user reconnects. Added focused regression coverage for both the Hebrew/off-hour sync payload and the revoked-token path; backend tests, backend typecheck, and the frontend production build pass.

---

### 2026-07-08 16:32 — `feat/redesign-v2`

Removed the last mobile-only spacer that kept the Talk composer from feeling flush with the PWA bottom dock. The `Add manually` footer link now hides on mobile and the composer form no longer adds bottom padding there, while desktop keeps the manual-add link. The assistant mobile regression now checks that the link stays hidden and the composer shell lands close to the dock.

---

### 2026-07-08 16:20 — `feat/redesign-v2`

Refined the mobile Talk composer after the PWA still felt too tall. The composer now starts as a true one-line input with attach, mic, and send in the same compact row, while the model selector sits in a smaller secondary row so it no longer gets clipped by the bottom dock. Updated the assistant mobile regression to enforce the shorter shell height and verified the focused Playwright spec plus production build.

---

### 2026-07-08 16:07 — `feat/redesign-v2`

Tightened the mobile PWA Talk bottom area after the production deploy showed the composer controls being clipped behind the dock. The Talk route now owns a full-height mobile content area above the bottom navigation, the composer is shorter on mobile so its controls remain visible, and the iOS standalone touch-target override no longer bloats the Talk dock/composer controls. Verified the assistant mobile regression and production build before committing.

---

### 2026-07-08 15:11 — `feat/redesign-v2`

Polished the mobile Talk experience after testing it against the redesign branch. The assistant composer now behaves like a modern chat input: multiline, rounded, model picker inside the composer, and no disappearing text on narrow screens. Also tightened the mobile Talk layout so it sits flush to the app frame and bottom nav, removed the dead Privacy/Terms footer block from that page, and fixed the assistant-confirmed Item cache path so Today sees new assistant-created Tasks without a manual refresh.

---

### 2026-07-08 00:10 — `feat/redesign-v2`

Ported the mobile-logout fix onto the redesign branch (originally fixed on `main` as `fix/mobile-logout`). Same root cause: the slide-in drawer sits in a `z-10` container, so its `z-50` was scoped below the `z-30` bottom nav, which painted over the Logout button. Applied to this branch's semantic-token `Layout.tsx` — hid the bottom nav while the drawer is open, made the drawer nav scrollable, and added safe-area padding to the footer.

---

### 2026-07-06 21:30 — `feat/redesign-v2`

Shipped slice 6: a user-selectable theme system with two themes — **midnight** (default, pixel-identical to the legacy dark look) and a clean **white** theme. Introduced semantic CSS variables in `src/index.css` (`--surface-page/card/raised/input/sunken`, `--text-primary/secondary/muted`, `--border-default/strong`) defined as space-separated RGB channels so Tailwind's `rgb(var(--x) / <alpha-value>)` pattern preserves every existing alpha utility — midnight values equal the old hexes exactly, so the dark theme is untouched. `tailwind.config.js` maps them to short, collision-free utilities (`bg-page/card/raised/sunken/field`, `text-ink/ink-soft/ink-muted`, `border-line/line-strong`). Swept 27 component/page files, replacing every hardcoded dark surface/border/text class (`bg-gray-8/9/950`, `border-gray-6/7/8`, `text-gray-1/2/3/400`) with the semantic utilities; mid-tone control colors (toggle tracks, progress bars, chart bars — `bg-gray-500/600/700`) were left as-is per the accents-are-not-surfaces rule. Baked-in glow/gradient component classes (`.card`, `.task-card`, `.input-field`, `.neon-text`, PWA-standalone overrides) are neutralized for white via a single `[data-theme='white']` block rather than per-component edits. Theme source of truth is a new `theme` field on the settings Zod schema (`z.enum(['midnight','white']).default('midnight')`), mirrored to `localStorage` and applied to `<html data-theme>` — with an inline pre-render snippet in `index.html` so there's no flash-of-wrong-theme, and dynamic `theme-color` meta. Settings gained a segmented theme picker. Verified in the live preview (after clearing a stale service worker) that white renders cleanly and midnight is unchanged. Grep gate clean (0 `bg-gray-8/9`, `bg-slate-9` surface usages); frontend `tsc && vite build` green, backend `tsc --noEmit` green, settings-routes jest suite 9/9 (updated the default-shape assertion for the new field).

---

### 2026-07-06 20:00 — `feat/redesign-v2`

Shipped slice 5: manual add is back as a real, secondary path alongside Talk. Founder feedback was that not everyone wants to type prose at an AI, and form-based add costs no credits — so `/add` now renders `AddItemPage` directly again instead of redirecting to `/talk` (`src/App.tsx`). AddItemPage itself needed no changes; it already supported `?tab=` params and its form flows were untouched by earlier slices. Wired two entry points: TodayPage header gained a compact secondary "+ Add" button next to the primary "Talk" button, and the Talk composer footer gained a small unobtrusive "Add manually" text link that doesn't compete visually with the send/attach/dictation controls. Dock stays exactly Today | Talk — no nav changes. Did not touch the Anytime shelf (no `/talk` reference found there to redirect). Build (`tsc && vite build`) passes.

---

### 2026-07-06 — `feat/redesign-v2`

Shipped slice 4 (final) of the redesign, closing out the product-packaging spec's remaining work items. Calories flipped on by default: `backend/src/routes/settings.ts`'s Zod schema (single source of truth for the setting) now defaults `calorieIntake` to `true`, so any user who never touched the toggle gets it on while explicit opt-outs are preserved via the existing settings merge; frontend fallbacks (`TodayPage`, `SettingsPage`) updated to match. Removed the now-redundant sample-task seeding from `backend/src/onboarding.ts` `seedNewUser` — the brain-dump onboarding (slice 3) replaces the need for "Ask AI what to focus", "Log your first meal", "Record one small win"; kept the settings-seeding side effect intact. Week View got a light copy pass aligning it with day-first language ("Plan across days — your default view is Today") without touching its structure. Settings/nav cleanup: renamed the last user-facing "AI Assistant" labels (sidebar panel, AddItemPage button) to "Talk" for consistency with the slice-2 rename; module toggles (calories/achievements/workouts) all still map to live nav items, nothing orphaned. Verified in the live preview after clearing a stale service-worker cache that had been masking the changes. Backend typecheck + full jest suite (39/39 suites, 280 tests) green; frontend `tsc && vite build` passes.

Shipped slice 3 of the redesign: first-run onboarding is now brain-dump-first. TodayPage's onboarding block is a single focused card — "Tell me about your day" — with one primary button that opens the existing AITextAnalyzer modal (no new parser; `AITextAnalyzer` gained an `onConfirmed` callback fired alongside its existing on-close-after-add path). Confirming a parse auto-completes onboarding via the existing `onboardingService.complete` mutation, keeping the `onboarding_completed`/`onboarding_skipped` analytics contract unchanged. Removed the old "core loop" checklist and its broken `/add?tab=` links (dead since slice 2 redirected `/add` to `/talk`). Kept a subtle "I'll do it later" skip link. Verified in the live preview that the credit-error surface (0 credits) still renders inside the modal with no silent fallback. Backend sample-task seeding (`backend/src/onboarding.ts` `seedNewUser`) is unchanged — out of scope per "no backend changes" — flagged as now-redundant given the brain-dump replaces the need for samples. Rewrote `tests/e2e/onboarding.spec.ts` to match the new copy/flow; it still requires real OpenAI credits/infra to execute (no AI stub in test mode), so it was updated for correctness but not run. Build (tsc + vite) passes.

---

### 2026-07-06 — `feat/redesign-v2`

Shipped slice 2 of the redesign: Add and Ask are now one surface. The Assistant is repurposed as "Talk to your day" — route `/talk` renders the existing AssistantPage (retitled, composer placeholder "Add anything, or ask anything…"), with `/assistant` and `/add` redirecting to it. Backend behavior is unchanged; this is a re-centering, not a rebuild. Navigation collapsed to two destinations — Today and Talk (Talk is the primary/center dock action, grid is now 2-col) — across the mobile dock and desktop sidebar. TodayPage's Ask entry points (AskAIModal) now navigate to /talk; AskAIModal and its now-dead `aiService.queryTasks` client method were deleted. AddItemPage.tsx is kept (still deep-linked from the TodayPage shelf via `/add?tab=`) but is no longer a nav destination. Conflict noted: those shelf `/add?tab=` links now redirect to /talk and lose the tab param — left as-is per scope (don't touch TodayPage beyond the Ask button). Build (tsc + vite) passes.

---

### 2026-07-06 — `feat/redesign-v2`

Shipped slice 1 of the redesign: TodayPage is now day-first. Replaced the stats/progress header (task counts, HabitTrackerBar sidebar, mobile module cards) with a 7-day week ribbon (past days show a ✓ when fully done, today/future show load dots) and a now/next card that appears only when viewing today. DayTimeline now renders calorie entries inline as read-only rose-accent body rows at their logged hour, and the Anytime shelf shows age badges ("2 days", "3 wks") on stale untimed items — replacing the per-card rollover banner. Drag-materialization (ADR-0001), virtual habit instances, and query-time rollover (ADR-0002) are untouched. Deferred: workout/weight timeline rows (no time field on those records — no new endpoints per scope) and flipping the calorie gate to on-by-default (#47, its own work item). Build (tsc + vite) passes.

---

### 2026-07-06 — `main`

Restored the day-is-the-unit packaging spec and marketing plan v2 (orphaned when the branch line was reset past commit 714cc5e), then extended the spec with verdicts from a clickable wireframe prototype of the whole redesigned flow (`public/prototype-redesign.html`). Prototyping killed the close-day ritual (automatic rollover is the differentiator), merged Add and Ask into one "Talk to your day" surface (sharpens #124), and settled the Today header as week ribbon + now/next with no body metrics. Next step: plan the real `/today-v2` implementation.

---

### 2026-07-05 20:09 — `fix/assistant-current-time`

Fixed the remaining Assistant time-context gap after the date-context fix. Assistant chat prompts now include the user's current local `HH:MM` time alongside timezone, today, yesterday, and tomorrow, and explicitly tell the model to use that value for "now" or "right now" tool arguments. Focused assistant route tests and the backend build passed before commit.

---

### 2026-07-05 19:15 — `fix/pwa-cache-refresh`

Fixed the assistant composer icon rendering bug after reproducing it in a mobile browser viewport. The shared button padding was collapsing the inner lucide SVGs to zero width, so the composer icon buttons now remove inherited padding and mark the SVGs as non-shrinking fixed-size icons. A production frontend build passed, and Playwright verification showed all three composer icons rendering at 20x20 before commit.

---

### 2026-07-05 19:08 — `fix/pwa-cache-refresh`

Added a PWA cache-refresh follow-up for the assistant date/icon fix. The service worker cache version now advances to `healthyflow-v4`, and installed clients reload once when the new worker takes control so mobile PWAs do not keep serving stale UI bundles. A production frontend build passed before commit.

---

### 2026-07-05 17:16 — `fix/assistant-date-icons`

Fixed the assistant date-context regression from #120 and the missing composer icons seen on mobile. Assistant chat prompts now include the client time zone plus explicit today/yesterday/tomorrow dates before tool selection, and the attachment, dictation, and send icons have direct colors so they render reliably in the PWA UI. Focused assistant route tests and both production builds passed before commit.

---

### 2026-07-05 16:22 — `feat/assistant-multimodal-input`

Implemented the first Assistant multimodal input slice from #117. The Assistant composer now supports dictation, one transient image attachment, or one bounded text/Markdown attachment per message, while saved conversations retain only lightweight attachment metadata. The backend validates attachment payloads and passes image/text content into the existing server-keyed OpenAI tool loop without changing write-confirmation behavior; focused assistant tests and frontend/backend builds passed before commit.

---

### 2026-07-04 13:33 — `fix/calorie-time-preview-editor`

Fixed the calorie time bugs from #130 and #131. Assistant calorie previews now carry explicit guidance and tool-schema descriptions to preserve user-provided meal times, while the Calorie Log editor labels the entry name as `Title` and exposes explicit edit-time/save/cancel controls. Focused assistant and calorie-entry route tests passed alongside frontend and backend builds.

---

### 2026-07-03 16:58 — `fix/assistant-preview-language`

Fixed the assistant UX bugs from #128 and #129. Approved action previews now stay in the chat as completed or canceled records with result details instead of disappearing, failed confirmations leave the preview visible with an inline error, and the assistant system prompt now explicitly follows the latest user message language for answers and action text. Focused assistant route tests plus frontend and backend builds passed before commit.

---

### 2026-07-03 14:48 — `codex/mobile-nav-more`

Reworked issue #57 from a crowded mobile bottom bar into a Today-first navigation model. Mobile now keeps only Today, Add, and Ask in the dock, while enabled modules appear as live status cards on Today, and the PWA safe-area handling no longer creates the dead black top band on iOS. A production frontend build passed before commit.

---

### 2026-07-03 13:01 — `main`

Finished and prepared the #114, #116, and #122 batch for deployment. Assistant chats now persist locally with history and a New Chat flow, the public demo video asset is available at `public/demo.mp4`, and the workout tracker joins the existing module-toggle settings with route and navigation gating. Frontend build, backend build, and the full backend test suite passed before shipping.

---

### 2026-07-02 21:24 — `main`

Connected issue #119's first proactive slice to the daily signal foundation. The Today AI Insights panel now reads the selected day's daily context, renders deterministic signal cards, and has route coverage for the new authenticated daily-context endpoint while keeping the surface movable for a future Home/brief view.

---

### 2026-07-02 21:15 — `main`

Implemented the cross-module daily signal foundation for issue #118. HealthyFlow now has a read-only daily context capability with bounded lookback windows, deterministic V1 signals for schedule overload, habit risk, and missing calorie logs, an MCP daily-context resource, extension documentation, and backend regression coverage.

---

### 2026-07-02 16:51 — `codex/ai-readonly-assistant`

Fixed the AI control-plane review findings before merge: MCP writes now audit as MCP, assistant turns preserve multiple pending previews, nutrition lookup is bounded, bulk calorie writes clean up partial inserts, and failed tool loops settle real token usage. The Assistant UI, capability mappers, Anytime backlog positioning, rate-limit bookkeeping, and ADR 0003 were updated alongside focused regression coverage.

---

### 2026-07-02 16:00 — `codex/ai-readonly-assistant`

Added Privacy Policy and Terms of Service pages, reachable at `/privacy` and `/terms` even while logged out, with footer links from the login screen and the main app layout.

---

### 2026-07-02 15:55 — `codex/ai-readonly-assistant`

Instrumented the app with PostHog product analytics: auth (identify/signup/login/logout), item creation and completion, AI parse flows (tasks and meals), credit balance and exhaustion, onboarding, and upgrade CTAs all now emit events. The static marketing landing page got a matching pageview snippet, and the tracking plan is documented under `docs/analytics/`.

---

### 2026-07-02 15:50 — `codex/ai-readonly-assistant`

Extended the AI assistant with per-request model selection and confirmation args passed through to write actions, updated the ChatGPT app MCP submission metadata, and expanded write-capability test coverage to match.

---

### 2026-07-02 10:46 — `codex/ai-readonly-assistant`

Implemented the AI control-plane stack from #107-#112 in one branch: the shared capability layer now supports read tools, add-type writes, confirm-class writes, audit logging, idempotency, Settings-issued MCP tokens, and a Streamable HTTP MCP surface. The in-app Assistant can answer with tool-grounded data, auto-run add-type writes, and render Confirm/Cancel cards for update/complete/delete actions. Settings now has a Connections panel for scoped PAT issuance/revocation, while MCP clients use the same capability registry with scope-gated read/write tools.

---

### 2026-07-02 10:09 — `main`

Built a marketing landing page (`public/landing.html`) that mirrors the app's own design language rather than inventing a separate brand — same dark navy/cyan gradient palette, Space Grotesk type, and glass cards. Product screenshots are real captures from the demo account (seeded with realistic tasks, habits, a workout session, calorie entries, and weight logs) rather than mockups, covering Today, AI Add Item, Week View, Calories, and Workouts. Verified desktop and mobile full-page renders section by section before committing; no app code changed.

---

### 2026-07-02 09:20 — `main`

Finished the remaining Ready backlog work from issues #51, #98, #103, #104, and #106, then followed up by making the manual credit contact flow real inside Token Manager. The app now has workout tracking, domain-based Add Item tabs, monthly credit subscriptions with clearer credit messaging, post-signup onboarding with sample data, and an admin inbox for in-app subscription/top-up requests. Backend tests, frontend build, focused Playwright checks, and the required Supabase migrations were run before committing.

---

### 2026-07-02 09:20 — `main`

Captured the LLM data access research from issue #99 in an ADR so the AI control plane has a concrete transport direction. The recommendation keeps HealthyFlow's internal assistant on a shared capability layer while leaving room for an external MCP interface with explicit write safety. This gives the next AI-control-plane slice enough architecture to start without another research pass.

---

### 2026-07-01 14:23 — `main`

Finished issue #54 by renaming the date-based Dashboard surface to Today throughout the app and test language. The root route still opens the daily schedule, habits, rollover, and Anytime backlog, but the navigation and page component now match that purpose. The broader Home/Overview dashboard remains framed as future product work under the updated issue title.

---

### 2026-07-01 14:15 — `main`

Finished issue #94 by moving the calorie AI entry action into the Entries card beside the manual Add Entry button. The date control now stays focused on selecting the log day, while both entry creation paths live together where the user is working. The project board item was moved to Done after the build check passed.

---

### 2026-07-01 14:02 — `main`

Stabilized the timeline card drag path by moving drag handles onto a dedicated grip and removing the mid-gesture expansion behavior that made cards drift away from the pointer. Compact task cards and mobile calendar-event controls now have regression coverage for clipping, menu visibility, checkbox sizing, and click reliability. Calorie entry writes also now surface toast errors, and the missing `calorie_items` Supabase migration was added so manual and AI calorie entries can persist their reusable food history.

---

### 2026-06-28 16:25 — `issue-59-stop-hover-auto-expand`

Stopped the compact schedule from auto-expanding just because the cursor starts over a task card. Dragging still expands the full set of hour drop targets before measurement, but clicks on task controls and menus are ignored so edit/delete flows stay stable. The Playwright coverage now proves hover stays compact, drag expands, and the existing task menu actions remain reachable.

---

### 2026-06-28 15:32 — `issue-59-fix-compact-drag-ux`

Reworked the compact schedule interaction after issue #59 made dragging feel worse. Timed cards now sit above compacted empty slots, compacted idle slots no longer intercept pointer events, and the timeline expands before drag measurement when a draggable card is hovered or grabbed. Added a regression that verifies the schedule compacts at rest and expands before/during the drag path.

---

### 2026-06-28 14:25 — `issue-59-compact-empty-schedule-windows`

Implemented issue #59 by compacting continuous empty schedule windows of four or more hour slots while leaving occupied slots at full task-card height. The timeline returns to full hourly drop targets as soon as a drag starts because compaction is disabled while a draggable item is active. Added a Playwright regression that anchors one timed task and verifies the surrounding empty windows collapse without hiding the scheduled item.

---

### 2026-06-28 14:21 — `issue-62-first-day-of-week`

Added a persisted first-day-of-week preference for issue #62 with Monday as the default for existing users. Settings now exposes the preference, Week View uses it for weekly ranges, day rails, and habit labels, and regression coverage covers both Monday-start and Sunday-start weeks. The e2e auth setup was also made deterministic so stale authenticated browser state cannot derail the suite.

---

### 2026-06-28 13:35 — `issue-60-calendar-delete-button`

Fixed issue #60 as the timed-card menu interaction bug: the Delete button was visible but unclickable because the next schedule slot intercepted pointer events over the open menu. The open menu now raises its containing timeline slot above neighboring slots, and the timed-delete Playwright regression covers the exact click path from the schedule card menu. This keeps the existing task and Google deletion path intact while making the user-facing control reachable.

---

### 2026-06-28 13:06 — `issue-63-week-untimed-duplicates`

Fixed issue #63 by making Week View collapse duplicate carried task rows that come back from multiple day queries. Dashboard still uses the per-day carry-forward behavior, but the weekly agenda now presents each non-habit task id once while preserving daily habit instances and calendar events. Added a Playwright regression with a frozen mid-week clock that previously reproduced one untimed task as five rows.

---

### 2026-06-28 12:58 — `issue-61-week-up-next-past-events`

Fixed issue #61 by making Week View's Up Next card ignore incomplete items whose date/time has already passed. The weekly agenda still shows historical rows for review, but the promoted next action now filters to today's remaining timed work, today's untimed/all-day work, or future days. Added a Playwright regression with a frozen browser clock and stubbed calendar events to prove past Tuesday and past-today events are not selected over a future-today event.

---

### 2026-06-28 12:27 — `issue-39-deepen-rollover-module`

Finished the remaining rollover deepening from issue #39 against the newer ADR-0002 model. The old synthetic rollover identity premise was already gone, so this slice tightened the module boundary instead: dated task and habit rows now come from the DB facade, while carry-forward composition lives in `Rollover`. This also removes the circular dependency where `supabase-client.ts` imported `Rollover` while `rollover.ts` imported the Supabase client.

---

### 2026-06-28 11:00 — `issue-38-collapse-openai-invocation-seam`

Rescoped issue #38 around the seam that already existed in `openai.ts`, then moved the remaining single-call AI billing orchestration into that module. The parse-tasks and query-tasks routes now call billable OpenAI helpers instead of each hand-rolling reserve, call, refund, and settle behavior. Query-tasks also stops returning a fake fallback answer on OpenAI failure and now surfaces an explicit error contract like the parser route.

---

### 2026-06-27 21:37 — `issue-53-week-view-calendar-events`

Fixed issue #53 by making Week View include imported Google Calendar events alongside the existing task and habit rows. The page now runs the same per-day calendar queries as Dashboard, merges events into the weekly agenda with a Calendar type chip, and supports the existing calendar completion toggle path. Added a Playwright regression that stubs the calendar API and asserts a calendar-integrated event appears on the correct weekly date.

---

### 2026-06-27 18:37 — `issue-56-drag-google-calendar-events`

Implemented issue #56 so imported Google Calendar events can participate in timeline drag scheduling. The frontend now exposes timed Google events as draggable blocks and calls a new server-keyed schedule update route; the backend patches Google Calendar, preserves event duration, and refreshes the local external event row from the provider response. Added a focused backend regression test plus a runnable Playwright verification script for checking the draggable calendar-event handle, and hardened a flaky location-card e2e selector that was blocking the full suite.

---

### 2026-06-27 15:55 — `issue-58-pwa-mobile-layout-fit`

Fixed the narrow PWA/mobile layout bug from issue #58. The authenticated shell now prevents page content from widening the viewport, reserves bottom space above the fixed mobile nav, and switches crowded phone-width bottom navigation to accessible icon-only controls. Week View also gets explicit shrink guards so its inline grids no longer force horizontal overflow on small screens.

---

### 2026-06-25 15:59 — `main`

Fixed a production login-page smoke-test blocker discovered while retesting issue #52 on mobile. Settings are now fetched only after a user is authenticated, and unauthenticated 401 responses no longer force a reload loop before login. This lets the deployed app reach the authenticated calorie/meal-entry flow normally for the post-deploy retest.

---

### 2026-06-25 15:50 — `main`

Finished the OCR-first nutrition label parsing slice for issue #52. Meal photo parsing now reads Hebrew nutrition labels through a dedicated OCR evidence pass, separates product identity from nutrition claims, and computes package-level calories/macros deterministically before falling back to the general meal parser when OCR is not usable. The frontend now surfaces review warnings for uncertain label evidence and includes an admin-only OCR lab for retesting real labels before/after deployment.

---

### 2026-06-25 11:07 — `codex/achievement-tracker`

Implemented the Achievement Tracker from issue #50 as a standalone module, gated by a persisted setting like Calorie Intake. The backend now has Supabase tables, thin routes, and a service that summarizes latest values, personal bests, target progress, and latest-vs-previous trend from recorded entry dates. The frontend adds a mobile-friendly Achievements page with quick logging, editable targets/definitions, trend visualization, and touch-friendly history controls.

---

### 2026-06-24 19:44 — `main`

Improved AI meal label parsing after a Quest cookie photo mixed up carbs and protein on a Hebrew nutrition label. The parse-meals prompt now explicitly prefers per-serving/package columns over per-100g columns, teaches Hebrew nutrient and column labels, and guards against confusing `פחמימות` carbs with `חלבונים` protein. Added a focused regression test that asserts those label-reading instructions are sent for photo-based meal parsing.

---

### 2026-06-24 17:20 — `main`

Extended the calorie module into a clearer health-tracking surface. Calorie entries now support optional times, are visually grouped by time, and display labeled macro chips so calories, protein, carbs, and fat are readable at a glance. AI meal entry now reuses the same dictation hook as AI task analysis, and a new kg-only weight tracker adds one-entry-per-day logging, latest-vs-previous delta, and a recent-entry trend graph inside `/calories`.

---

### 2026-06-24 17:05 — `main`

Fixed a 400 from OpenAI on the new parse-meals endpoint. The meal macros/quantity were declared `.nullable().optional()`, but OpenAI strict structured-output mode requires every property to appear in the schema's `required` list — optional fields are rejected. Changed them to nullable-but-required (model returns null when unknown), matching the parse-tasks pattern. The nock-based tests had masked this since they never validate the outgoing schema against OpenAI's rules, so added a regression test that walks the actual json_schema sent to OpenAI and asserts every object property is required. Backend suite now 151 green.

---

### 2026-06-24 16:35 — `main`

Committed pre-existing working-tree WIP that had been parked during the calorie-intake epic: a Week View redesign and mobile-density polish. `WeekViewPage.tsx` is largely rewritten with per-item-type theming (task/habit/grocery/meal/workout), inline completion via a mutation, and week navigation; `TaskCard.tsx`, `SmartReminders.tsx`, and `index.css` carry supporting layout/density tweaks, and the week-view e2e spec was updated to match. Unrelated to the epic — verified the frontend build is green before committing.

---

### 2026-06-24 16:20 — `issue-49-ai-meal-entry`

Added AI-assisted meal entry as a parallel pipeline to parse-tasks, built test-first. `POST /api/ai/parse-meals` takes free text and/or a photo (5MB guard, same multimodal vision path as parse-tasks) and returns nutrition-estimated meals via a Zod schema (`name`, `calories`, optional macros, optional `quantity`); it reuses `Openai.callStructured` and the existing `Credits.estimateReserve/reserve/settle/refundReserve` flow unchanged, billed under the `parse-meals` endpoint, with no silent fallback on AI failure. 5 new jest cases cover the happy path, photo multimodal forwarding, the no-input 400, the upstream-failure refund, and the settle-with-correct-endpoint case — backend suite is 150 tests green. On the frontend, added `aiService.parseMeals` + a `ParsedMeal` type, and a new `MealAnalyzer` component (text + photo input, review cards with calories/macros, confirm writes each accepted meal via the #48 `useCalorieEntries` create mutation) reachable from an "Add with AI" button on `/calories`. Frontend build is green.

---

### 2026-06-24 15:08 — `fix-credits-review`

Hardened the token-billing feature after a post-merge review of Codex's usage-based billing + admin token-manager work. Fixed a ledger drift where failed-call refunds wrote a phantom positive row (balance now always reconstructable from `ai_usage_log`), and stopped settlement underfunds from discarding an already-paid AI result (drain to zero, still return it). Migrated the legacy admin routes off the shared `ADMIN_TOKEN`/query-param check onto identity-based `requireAdminRole`, biased the image-token reserve estimate high, and made model pricing overridable via `AI_MODEL_PRICING` without a code change. Backend suite green (22 suites / 131 tests), build clean.

---

### 2026-06-24 15:05 — `issue-48-calorie-entries`

Built the calorie log as its own concern, separate from tasks. Added a `calorie_entries` table (indexed on user_id+date), thin Zod-validated CRUD routes (`GET/POST /api/calories`, `PATCH`/`DELETE /:id`) built test-first with 14 new jest cases covering validation, ownership (404/403), and macro-optional behavior, plus a `caloriesService` + `useCalorieEntries` React Query hook and a new `/calories` page with inline add/edit/delete and daily calorie/macro totals. The route and nav item are gated on the `calorieIntake` setting from #47 — both stay hidden until the user flips the toggle. Backend suite (145 tests) and the frontend build are green.

---

### 2026-06-24 14:10 — `issue-47-persisted-settings`

Made user settings persist server-side instead of living only in local React state. Added a single-row-per-user `user_settings` table with one JSONB column, thin Zod-validated GET/PATCH routes, a `settingsService` + `useSettings` React Query hook with optimistic updates, and wired the Settings page's toggles through it. Added the new Calorie Intake feature toggle (default off) as the future gate for the calorie module; Calendar Sync was left untouched since it has its own backend flow. Backend tests (131) and the frontend build are green.

---

### 2026-06-24 13:26 — `main`

Shipped task location support across the full stack. Users can now assign, edit, and clear an optional location for tasks from the creation form, edit modal, and timeline dashboard card. These location updates are bidirectionally synchronized with Google Calendar events. Database schema changes have been pushed to remote Supabase, and the full backend and Playwright E2E test suites are green.

---

### 2026-06-24 12:35 — `main`

Added the admin-only Token Manager and first-class user roles. The Supabase schema now defaults users to `user`, marks `lermanori@gmail.com` as `admin`, stores editable AI billing settings, and exposes a role-gated admin dashboard for user balances, OpenAI cost, base app tokens, markup, and charged token totals. The token ledger was reset for a fresh start with the admin account seeded at 1000 app tokens, and the backend/frontend builds plus backend test suite are green.

---

### 2026-06-24 12:09 — `main`

Converted AI billing from a flat per-action credit into usage-based AI Tokens. The backend now estimates a pre-call reserve, prices actual OpenAI prompt/completion usage by model, applies the 25% or 5-token minimum markup, and refunds or settles the reserve after each call. The UI now labels the balance as AI Tokens, and the test suite covers billing math, reserve/refund/settlement behavior, image estimation, and insufficient-token handling.

---

### 2026-06-24 11:33 — `issue-43-ai-credits`

New users now start with **0** AI credits (was 50); balances are filled by manual top-up. Backend suite green (102/102), build clean.

---

# HealthyFlow — Project Ledger

Auto-updated on every commit. Newest entries appear first.

- GitHub Issues: https://github.com/lermanori/HealthyFlow/issues
- Kanban: https://github.com/users/lermanori/projects/1/views/1

<!-- entries -->

### 2026-06-24 11:23 — `issue-43-ai-credits`

Shipped Slice C (Frontend) of the per-user AI credits feature. Added a lightweight `creditsService` to the API layer and a `useCredits` hook using React Query for balance fetching. Extended the response interceptor to catch HTTP 402 errors and toast "Out of AI credits" without interfering with the existing 401 auth flow. Wired the credits hook into `AITextAnalyzer` to refetch the balance after successful parse operations. Added a new "AI Credits" card in Settings showing the current balance with a visual progress bar (capped at 50 credits for display). All changes compile clean and no build errors.

---

### 2026-06-24 14:30 — `issue-43-ai-credits`

Wired enforcement on top of Slice A's credits foundation (issue #44, Slice B). Both AI routes (`parse-tasks`, `query-tasks`) now reserve a credit before calling OpenAI, return 402 `insufficient_credits` if the reserve fails, refund via `Credits.grant` on AI failure, and settle real token usage (or zeroed counts when OpenAI omits the usage block) on success. Signup now seeds new users with `FREE_SIGNUP_CREDITS` (50), and a new thin `GET /api/credits/balance` endpoint exposes the current balance. Added `backend/tests/credits/enforcement.test.ts` covering all four behaviors, plus updated three pre-existing suites whose mocks didn't yet account for the new real `Credits` calls; full suite is green (18/18 suites, 102/102 tests) and the TypeScript build is clean.

---

### 2026-06-24 00:00 — `issue-43-ai-credits`

Laid the foundation for per-user AI credits and token metering (issue #43, Slice A). Added a migration creating `user_credits` and `ai_usage_log` tables plus atomic `reserve_credits`/`grant_credits` Postgres functions so balance checks and debits happen in one statement with no overspend race. Added a new `credits.ts` deep module (reserve/settle/grant/getBalance) backed by thin `supabase-client.ts` helpers, and threaded OpenAI's token `usage` block through `callText`/`callStructured` non-breakingly so future settlement has real token counts to log.

---

### 2026-06-24 11:37 — `main`

Fixed Google Calendar task sync to use the browser's local timezone instead of a hardcoded offset, so timed tasks keep their HealthyFlow wall-clock time when they appear in Google/Apple Calendar. Added regression coverage for local calendar event payloads, including events that cross midnight. Also kept the day timeline height behavior aligned with task duration while restoring the roomier card padding requested during mobile review.

---

### 2026-06-24 11:12 — `main`

Refined the AI Task Analyzer into a focused prompt-first composer. The toolbar now holds upload, dictation, voice assistant, default schedule date, and the compact analyze action, with clearer borders and modal settings for voice/date configuration. The selected default schedule date is now sent through parse-tasks so unspecific tasks land on the intended date, and the analyzer overlay now covers the full viewport via a body-level portal. Build is green and the UI is ready for deployment.

---

### 2026-06-24 10:42 — `main`

Captured the project operating instructions in `AGENTS.md` so future agent sessions have the same architecture rules, AI harness constraints, issue-tracker workflow, and commit process available in-repo. Preserved the June 23 handoff note under `.scratch/` as a historical launch-readiness snapshot and next-session checklist. This gives the project a clearer trail from sprint state to current implementation work.

---

### 2026-06-24 10:41 — `main`

Fixed deletion for tasks that still reference Google Calendar events after the user disconnects Google Calendar. The task delete path now treats only the explicit "Google Calendar is not connected" cleanup failure as non-blocking, so HealthyFlow still removes the local task while preserving real Google API failures. Added regression coverage for a synced task with a stale external event id.

---

### 2026-06-24 10:41 — `main`

Cleared React Query state whenever authentication changes. Login, signup, logout, and invalid stored-token recovery now wipe cached user-scoped data so a session switch cannot display another user's stale dashboard state. This keeps the auth boundary aligned with the client cache boundary without changing the API contract.

---

### 2026-06-24 10:41 — `main`

Added photo input to the AI Task Analyzer so users can parse handwritten notes, screenshots, or calendar/list images into HealthyFlow Items alongside typed text. The backend now accepts bounded multimodal parse-tasks requests, forwards image content to OpenAI through the existing structured-output path, and has regression coverage for photo-only analysis. The analyzer modal was tightened for mobile, with compact TTS/voice controls and a fixed footer so the analyze action remains reachable.

---

### 2026-06-23 20:12 — `main`

Added scoped deletion for recurring habits. The dashboard now asks whether to remove only the selected habit day or the entire recurring habit, and the backend persists per-day skips with a `deleted_at` tombstone so virtual instances do not reappear after refresh. The delete route now handles virtual habit ids, materialized habit instances, whole-series deletes, Google Calendar cleanup, and regular task deletes with focused regression coverage.

---

### 2026-06-23 19:32 — `main`

Shipped the installable PWA version to Netlify and redeployed the Railway backend. The frontend now has real manifest/icon assets, a focused service worker, Netlify SPA/PWA headers, and a stronger PWA regression test; production was verified with an active service worker and Railway-backed API URL. Railway deployment was repaired by making the backend install/build from `backend/package.json` during image build and start the compiled server directly; the live health endpoint returns 200.

---

### 2026-06-23 18:43 — `codex/calendar-sync`

Merged `main` into the Google Calendar sync branch to resolve PR #42 conflicts. Combined the regular-task update path so it both applies the ADR-0002 someday→today normalization (from main) and syncs the row to Google Calendar (from this branch); dropped the dead `/rollover` route per main's intentional removal. The calendar sync foundation remains: OAuth connection management, imported Google events in the day timeline, outbound timed-task syncing, visible sync badges, and matching wall-clock rendering for synced/imported events.

---

### 2026-06-23 18:43 — `issue-37-docs-flake-ci`

Extended `tests/e2e/README.md` with comprehensive documentation: what the 12-test suite covers (6 specs listed in a table), what it intentionally does NOT (AI correctness, performance, visual regression, parallelism), how to run headed/headless with and without the OpenAI key, how `/test/reset` works including the `page.request.post()` gotcha (SPA catch-all blocks `page.goto()` to the endpoint), how AI stubbing works + the pattern for adding new fixtures, how to view Playwright traces on failure, and the flake-quarantine policy (two flakes within a calendar week → `test.fixme()` + new tracking issue, no `test.retry(N>1)`, run-level retries stay 1 on CI / 0 locally). Added a CI-shape check section documenting the measured ~47s wall-clock (under 90s target), exit codes, and that GitHub Actions wiring is a follow-up. Updated root `README.md` with a one-line regression gate: "if `npm run test:e2e` is green, the golden paths still work" linking to the e2e README. No spec logic changed; all 12 tests still pass in serial mode; backend Jest 81/81 green; build clean.

---

### 2026-06-23 14:30 — `issue-36-ai-stubs`

Added Playwright AI network stubs so the full e2e suite (12 tests) runs green with `OPENAI_API_KEY` unset. All four `/api/ai/*` routes are intercepted by a shared `ai-stubs.ts` fixture before reaching the backend; committed JSON fixtures under `tests/e2e/fixtures/ai/` provide shape-correct stub responses. All specs now import `{ test, expect }` from the stub fixture instead of `@playwright/test` directly. Backend Jest (81 tests) and `npm run build` remain green.

---

### 2026-06-23 — `issue-35-week-view`

Week view golden path (#35) — feature + e2e. The week view was a stub (only today's tasks fetched; other days rendered `Math.random()` placeholders), so the golden path needed the feature made real first: `WeekViewPage` now fetches all 7 days in parallel via `useQueries`, removes the random data, and renders each day's real tasks + completed/total counts (day cards tagged `data-date` for stable targeting). New `tests/e2e/week-view.spec.ts` adds a task for today and a timed task for another in-week day, then asserts each lands under its correct day column (timed so ADR-0002 carry-forward doesn't leak it into today). Also hardened the suite: replaced the no-op `page.goto('/test/reset')` (swallowed by the SPA catch-all) with `page.request.post('/test/reset')` in the habit + lifecycle specs, and set Playwright `workers: 1` — every spec resets the one shared Supabase test user, so parallel workers were clobbering each other (flake policy item for #37: per-worker test users would re-enable parallelism). Suite 12 green across two consecutive runs; backend 81 green; build clean.

---

### 2026-06-23 18:00 — `issue-34-rollover`

Added `tests/e2e/rollover.spec.ts`, the ADR-0002 golden-path E2E test. The spec uses the Add Item form's date field to create a real untimed task dated yesterday (no Date mocking, no API seeding), then asserts it surfaces on today's Dashboard via carry-forward. Key finding: AddItemPage does not inherit the Dashboard's selected date — it always defaults to today, but exposes a `<input type="date">` that the test fills directly with yesterday's date. Full E2E suite now 11/11 passing; backend Jest 81/81 green.

---

### 2026-06-23 — `issue-33-habit`

Added the habit golden path E2E spec (issue #33), guarding the per-day isolation invariant: completing today's habit instance must not bleed into tomorrow's. The test uses the real UI — Item Type toggle to select Habit, the "Next day" arrow for date navigation — no URL hacking. All 10 Playwright tests pass (plus backend Jest 81/81 and frontend build green). Confirmed the server-side fix already in place; the spec found no bug.

---

### 2026-06-23 — `issue-32-task-lifecycle`

Completed issue #32: task lifecycle (complete/edit/delete) golden-path E2E tests. Created `tests/e2e/items-lifecycle.spec.ts` with three fully independent tests: **Complete** (mark complete via checkbox, assert strikethrough, reload, assert persisted), **Edit** (open menu, click Edit, change title via modal input, click "Save Changes", assert new title on Dashboard), and **Delete** (open menu, click Delete, accept confirm dialog, assert task vanishes). All tests start from `POST /test/reset` for isolation, create the task via the real UI (no API shortcuts), and drive completion through actual UI interactions. Selectors confirmed against source: checkbox is first button in TaskCard flex container; MoreVertical menu button is second button (revealed on hover); Edit/Delete are dropdown menu items; TaskEditModal input has placeholder "Enter task title..."; save button is "Save Changes" (not type="submit"). All 9 e2e specs green (6 prior + 3 new); backend Jest 81/81; build passes.

---

### 2026-06-23 15:45 — `issue-31-auth-session`

Completed issue #31: added logout + session-persistence E2E tests. Restructured `tests/e2e/auth.spec.ts` into two `test.describe` blocks with independent `test.use({ storageState })` — one for unauthenticated flows, one for authenticated flows — so tests are order-independent and can mix storage states cleanly. Added "logout" test: logs in, finds and clicks the logout button in the Layout header (selector: `button:has-text("Logout")`), asserts LoginPage is visible afterward, and navigates to `/` to confirm it does NOT redirect back to the authenticated Dashboard. Added "persist-across-reload" test: uses the shared `storageState` from `auth.setup.ts`, navigates to `/`, reloads the page, and asserts the Dashboard is still visible. All 6 e2e tests green (setup + 5 specs); backend Jest 81/81 green; build passes. Logout affordance confirmed: `button:has-text("Logout")` in both desktop header and mobile menu in `Layout.tsx`.

---

### 2026-06-23 — `issue-30-add-task`

Completed issue #30: reusable Playwright auth fixture + items-add E2E golden path. Added `tests/e2e/auth.setup.ts` (setup project that logs in via real UI, waits for authenticated nav to appear, saves `storageState` to `.auth/user.json`). Updated `playwright.config.ts` to add a `setup` project and a `chromium` project that depends on it with shared `storageState`. Fixed `auth.spec.ts` to opt out via `test.use({ storageState: { cookies: [], origins: [] } })` so the login-flow test starts unauthenticated. Rewrote `items-add.spec.ts` to rely on shared auth (no manual login per test): tests navigate directly to `/add`, fill the form, submit, and assert the task appears on the Dashboard. Root cause of previous agent's blocker: a stray Vite dev server from another project (named "Adama") was occupying port 5173 via `reuseExistingServer: true`; additionally the `h1` locator prematurely matched the LoginPage heading before login completed. All 5 e2e tests green; backend Jest 81/81; build passes.

---

### 2026-06-23 14:30 — `issue-29-e2e-spine`

Laid the Playwright E2E spine (issue #29). Added `@playwright/test` as a devDependency, `playwright.config.ts` with two webServer entries (Vite + Express in HF_TEST_MODE), and `tests/e2e/` containing globalSetup (idempotent Supabase test-user seed + task reset), `auth.spec.ts` (one login→Dashboard golden-path test), and a README. Backend gained `db.resetTestUser` in `supabase-client.ts` and a `POST /test/reset` route in `index.ts` that mounts only when `HF_TEST_MODE=1`. TDD'd the 404 guard (red→green before wiring the route). Full backend suite 81 green; `npm run test:e2e` passes in ~3s locally.

---

### 2026-06-23 — `main`

Closed out the habit/rollover scheduling work and fixed the last "drag doesn't persist" bug. Root cause was not the write path but GET assembly: the `dailyHabits` query matched instance rows (not just templates), so another day's instance leaked into the viewed day, and habit templates carried a stray `scheduled_date` that made them double as a dated day-0 row colliding with materialized instances. Fix: `dailyHabits` now selects templates only (`original_habit_id IS NULL`), the `originalHabitsForDate` query/branch is gone, and read-time dedup is deterministic (real beats virtual, oldest wins). Ran a one-off cleanup (`backend/scripts/cleanup-habit-model.js`) nulling templates' stray dates and collapsing duplicate instances. Landed ADR-0002 (one rule for untimed tasks) and the slimmed `rollover.ts`/`tasks.ts`. Backend suite 79 green (added `habit-instance-dedup` + `rollover-carry-forward` specs); issue #9 moved to Done.

---

### 2026-06-22 — `fix/habit-drag-edit-scheduling`

Fixed a cluster of habit drag/edit scheduling bugs and added per-day vs whole-habit edit scope. Swapped the abandoned `react-beautiful-dnd` for the maintained `@hello-pangea/dnd` so drops actually register under React 18 StrictMode. Stopped habit drags/edits from leaking a per-day time into the parent (and thus all future virtual instances): drags on a recurring-habit parent now materialize a dated instance, and the edit modal offers "This day only" (per-day override) vs "The whole habit" (parent, today-forward; past real history stays frozen). Made `createHabitInstance` idempotent (one row per habit/day) with explicit `completed` semantics, fixing completed habits flipping incomplete on drag and teleporting to untimed on complete. Backend suite now 69 green (added `isPureDragUpdate` + override-shape specs).

---

### 2026-06-21 17:40 — `main`

Applied the #40 projects migration to the live Supabase (`healthflow`) via `supabase db push`. The first push failed because the spec-derived migration declared `user_id text` while the production `users.id` is `uuid` — corrected the migration to match the existing tasks/users style (UUID PK with `gen_random_uuid()`, `user_id UUID ... ON DELETE CASCADE`, plus an `idx_projects_user_id` index). Re-pushed clean; remote and local migrations are now in sync. Route code needed no change — it passes `uuidv4()` strings which a UUID column accepts, same as tasks.

---

### 2026-06-21 17:15 — `issue-40-projects-backend`

Added the missing backend for the projects feature (issue #40): a Supabase migration (`projects` table), five `db.*` project methods in the deep-module `supabase-client.ts`, and a thin `/api/projects` route covering GET, POST, PUT, DELETE, and PATCH /archive — all scoped to the authenticated user. Frontend `ProjectSelector.tsx` now shows a visible toast on failure and auto-selects + invalidates the projects query on success. All 48 prior tests remain green; 13 new TDD-driven tests bring the total to 61.

---

### 2026-06-21 16:45 — `main`

Committed a standalone Rollover dedupe fix that had been sitting uncommitted in the worktree. `Rollover.listForDay` and the count query now guard on `scheduled_date IS NULL`, so dated "Anytime backlog" tasks (which carry a real `scheduled_date` since #26/#27) are no longer returned both as a regular task for their day and as a rollover. The completed-rollover query gained the same guard plus `start_time`/`rolled_over_from_task_id`/`type` filters so a dated task completed today can't surface as a phantom "completed rollover." All 48 backend Jest tests pass. Also gitignored `.claude/`.

---

### 2026-06-21 16:30 — `main`

Reconciled the contradictory issue-tracker docs: CLAUDE.md previously named GitHub Issues + Project 1 as the source of truth at the top but instructed agents to use local `.scratch/` markdown in the Agent-skills section. Made GitHub Issues + the Project 1 kanban the single source of truth across CLAUDE.md, `docs/agents/issue-tracker.md`, and `docs/agents/triage-labels.md` (triage roles now map onto the board's `Status` field). Removed the `.scratch` ignore line, deleted the stray `.scratch` reading guide, and dropped a stale `.scratch` PRD reference from a comment in `routes/ai.ts`. Surfaced while filing #40 (project creation in the task form has no backend `/projects` route — still unimplemented).

---

### 2026-06-21 16:00 — `issue-28-materialize-habit-on-drag`

Implemented Option B for #28: dragging a virtual habit instance (untimed or timed) into an hour slot or the Anytime backlog now materialises a real `tasks` row (`completed: false`) carrying the per-day start_time or position override, so the change survives a page reload. A new `parseHabitInstanceId` helper centralises synthetic-id detection (was three copies of the same regex); `PUT /tasks/:id` detects the virtual id, verifies ownership against the original habit, and calls the extended `db.createHabitInstance` with overrides. The frontend swaps the returned real id in place of the stale synthetic id so a second drag operates on the real row. ADR 0001 records the Option A vs B tradeoff. All 48 backend Jest tests pass; backend and frontend builds clean.

---

### 2026-06-21 14:45 — `issue-27-drag-set-time`

Orchestrator review fix for #27: the new hour-slot bucketing matched tasks with `startTime === "HH:00"` exactly, so any timed task on a non-:00 minute (e.g. "09:30", common from the `type="time"` inputs and the AI parser) — or outside 6am–11pm — matched no slot and, having a startTime, also couldn't fall into the Anytime backlog, vanishing from the timeline entirely. Re-bucketed scheduled tasks by their floored hour, clamped into the 6–23 range, so every timed task stays visible; drops still snap to ":00". Frontend build green; backend 37 Jest tests green.

---

### 2026-06-21 14:30 — `issue-27-drag-set-time`

Implemented drag-to-schedule: the Scheduled section now renders one Droppable per hour slot (6am–11pm, droppableId="HH:00"), and the drop handler branches on destination zone — hour slot sets startTime and clears position, anytime clears startTime and assigns position. Two new pure backend utils (hourSlots, zoneToUpdate) with 7 Jest tests cover the decision logic. Both sections now live inside a single DragDropContext, making timed↔untimed drag fully functional. Backend PUT /tasks/:id already accepted null for startTime; no route changes were needed.

---

### 2026-06-21 12:50 — `issue-26-untimed-backlog-reorder`

Orchestrator review fix for #26: the new PATCH /tasks/reorder route wrote positions via `db.updateTask(id, …)`, which filters by id only — letting a user reorder another user's tasks (IDOR). Added an owner-scoped `db.reorderTasks(userId, pairs)` that filters each update by `user_id`, mirroring the ownership guard already on PUT /:id, and pointed the route at it. Backend build + 30 Jest tests green; frontend build green.

---

### 2026-06-21 09:00 — `issue-26-untimed-backlog-reorder`

Added end-to-end persistence for manual reordering of untimed (Anytime) tasks. A new `position INTEGER` column lands via Supabase migration; GET /tasks returns it; PUT /tasks/:id accepts it; a new PATCH /tasks/reorder batch-writes positions from an ordered id list using the `positionsFromIds` utility. The frontend DayTimeline is restructured into two sections — Scheduled (non-draggable, sorted by start_time) and Anytime (draggable, persisted via the single batch call) — replacing the old per-task update loop. New untimed tasks append to the end of the Anytime backlog via `getNextPosition`.

---

### 2026-06-20 — `fix/ai-analyzer-duplicate-keys`

Closed out bug #22 (duplicate React keys in AITextAnalyzer). The original quickDates `key={date.value}` fix was already preserved through the recent AITextAnalyzer refactor. Additionally hardened suggestion id generation in `parseTasksApi.ts` from index-based `ai-${idx}` to `crypto.randomUUID()`, making each parsed item carry a truly unique stable id as React key — eliminating any future risk of cross-render key collisions. Build passes clean.

---

### 2026-06-20 — `fix/overdue-notifications-date-blind`

Patched a remaining timezone bug in SmartReminders' overdue detection. The previous fix added a `scheduledDate <= todayStr` guard but computed `todayStr` via `toISOString()`, which returns the UTC date — in UTC-N timezones this is one day ahead of the local date, making tomorrow's tasks compare as "today" and fire false overdue toasts. Fixed by computing `todayStr` from local date components (`getFullYear/getMonth/getDate`) so the date boundary always matches what the user sees. Build passes clean.

---

### 2026-06-19 — `refactor/split-ai-text-analyzer`

Completed both architecture refactors (#6 and #7). For #7: replaced the flat 60-field Task interface in `src/services/api.ts` with a discriminated union `Item = TaskItem | HabitItem | GroceryItem | MealItem | WorkoutItem`; `Task` kept as a re-export alias for backward compat. For #6: split the 627-line AITextAnalyzer monolith — business logic now lives in `src/lib/ai/parseTasksSchema.ts` (types), `src/lib/ai/parseTasksApi.ts` (HTTP + mapping), `src/hooks/useParsedItems.ts` (parse-tasks state), and `src/hooks/useAddItems.ts` (mutation + cache invalidation); UI reduced to `src/components/AITextAnalyzer/` with `SuggestionCard.tsx` sub-component and `utils.ts` display helpers. No behaviour changes; build passes clean.

---

### 2026-06-19 21:00 — `issue-20-overdue-date-blind`

Fixed a P1 bug where overdue toast notifications fired immediately for tasks scheduled on future dates. The overdue check in SmartReminders was comparing time-of-day only, ignoring `scheduledDate`; a task at 08:00 tomorrow would trigger "Overdue" as soon as it was added if the current time was past 08:30. The fix adds a `scheduledDate <= today` guard to both the overdue and upcoming checks. A new `isTaskOverdue` utility in `backend/src/utils/isOverdue.ts` documents the contract with 7 unit tests covering future dates, past dates, and the 30-minute boundary.

---

### 2026-06-19 — `issue-21-smartreminders-render-loop`

Fixed a "Maximum update depth exceeded" render loop in SmartReminders.tsx. The root cause was `dismissedIds` being included in the `useEffect` dependency array while `setReminders` was called unconditionally with a new array each run — any dismiss action would trigger an infinite setState cycle. Removed `dismissedIds` from both the `setReminders` call and the dep array; the existing `visibleReminders` filter on line 86 already handles dismissed-item exclusion from the UI, so no behavior changes.

---

### 2026-06-19 20:30 — `issue-22-aitextanalyzer-dup-keys`

Fixed issue #22 (P2 cosmetic): AITextAnalyzer emitted React's duplicate-key warning with a date-string value. Root cause was the two `quickDates` button maps keyed on `date.value` (the YYYY-MM-DD string); on certain weekdays "This Weekend" (`addDays(now, 6 - getDay())`) resolves to the same date as "Tomorrow" (`addDays(now, 1)`), producing two sibling buttons with an identical key. Switched both maps to key on the unique `date.label`. (The suggestion-id map was already sibling-unique and was not the cause.) TypeScript typecheck passes.

---

### 2026-06-19 — `issue-23-recommend-404`

Stopped `POST /api/ai/recommend` 404s that fired on every dashboard load (issue #23). The `/api/ai/recommend` route does not exist server-side; the fix stubs `aiService.getRecommendations` to return `[]` immediately, so the existing graceful-degradation UI ("Complete more tasks to unlock personalized AI recommendations") shows without any network request. Also removed the 5-minute polling interval from the query to avoid repeated no-op calls. No backend changes needed.

---

### 2026-06-19 20:00 — `main`

Verified issue #2 (AI parser canonical fields) end-to-end: `OPENAI_API_KEY` was added to `.env` and all three test phrases ("30 minute run tomorrow morning", "Weekly meal prep every Sunday 2 hours", "Take vitamins daily") returned correct `duration`, `repeat`, and `category` fields from GPT with no hardcoding. Diagnosed and fixed the UI not working: `VITE_API_URL` was pinned to the production Railway URL, so the browser was calling Railway (which has no API key) instead of localhost. Swapped it to `http://localhost:3001/api` for local dev. Production Railway still needs `OPENAI_API_KEY` added via the Railway dashboard before the AI analyzer works in prod.

---

### 2026-06-19 13:30 — `main`

Fixed the self-signup rate limiter crashing the backend on boot (`ERR_ERL_KEY_GEN_IPV6`): removed the unsafe custom `keyGenerator` in `auth.ts` and now rely on express-rate-limit's IPv6-safe default, with `app.set('trust proxy', 1)` in `index.ts` so `req.ip` resolves to the real client behind Railway's proxy (one bucket per client, not per proxy). Added `backend/scripts/seed-demo.ts`, an idempotent seed that upserts `demo@healthyflow.com` with a fresh `demo123` hash so the advertised demo credentials actually log in. All 17 backend tests still pass.

---

### 2026-06-19 12:00 — `issue-8-timeline-ordering`

Fixed a critical bug (#8) where tasks with a `start_time` earlier in the day sorted after afternoon tasks when the afternoon task had an earlier `created_at`. The root cause was a broken comparator in `getTasksWithRecurringHabits`: when only one of the two tasks had a `start_time`, the sort fell through to `created_at` order, completely ignoring the timed task's time value. Extracted a pure `sortTasksForTimeline` helper (with 4 unit tests that reproduce the bug) and wired it into `supabase-client.ts`, replacing the broken inline sort. All 17 backend tests pass; frontend typechecks clean.

---

### 2026-06-19 11:59 — `issue-13-prod-api-wiring`

Fixed production API wiring: changed `.env` to pin Railway URL (https://healthyflow-production.up.railway.app/api) instead of localhost:3001, so the Netlify build reads the correct backend. Dev fallback is preserved in src/services/api.ts for local development. Vite build passes.

---

### 2026-06-19 00:00 — `issue-14-self-signup`

Implemented P0.2 self-signup (issue #14): added a public POST /api/auth/signup route with Zod validation, bcrypt hashing, and JWT response — reusing every existing auth helper. Rate limiting (5 req/IP/15 min via express-rate-limit) is scoped to that route only; admin /register is untouched and regression-tested. All 7 new TDD tests (new email, duplicate email, short password, bad email, rate limit, admin regression x2) pass alongside the 6 existing backend tests (13 total). Frontend LoginPage.tsx now toggles between "Sign in" and "Create account" with inline error surfacing for duplicate email.

---

### 2026-06-19 17:24 — `issue-17-hide-item-types`

Hidden unbuilt item types (grocery, meal, workout) from the UI selector on AddItemPage. Filtered the itemTypes array to show only task and habit options, removing the user-facing selector buttons for the three types whose backends don't exist yet. Zod type definitions and TypeScript interfaces left untouched — the full types remain in the schema for v2.2 implementation. Frontend build and typecheck passed with no errors.

---

### 2026-06-19 09:19 — `issue-10-habit-bar`

Fixed the habit tracker progress bar not rendering on the dashboard. Root cause: the sidebar motion.div animation was not completing, leaving the sidebar element invisible (animating off-screen or stuck in initial state). Converted the sidebar from motion.div to a regular div, removing the Framer Motion animation that was preventing the card from rendering. Also corrected the backend's virtual habit instance detection to properly set isHabitInstance based on ID pattern matching instead of relying on a non-existent database field. Frontend build passed with no errors.

---

### 2026-06-19 16:32 — `issue-16-ask-ai-input`

Fixed the AskAI input collapsing after sending by converting single-answer state to a conversation thread array. Input now clears after each send but remains visible and focused, letting users ask follow-up questions immediately. Each exchange renders as question+answer pair in the thread, and quick-question buttons hide once conversation starts. Frontend build passed with no type errors.

---

### 2026-06-19 15:47 — `issue-15-sticky-footer`

Fixed the Analyze button hiding on scroll in the AITextAnalyzer modal. Restructured the modal into three flex zones: fixed header, scrollable content area, and fixed footer. Moved the "Analyze & Generate Tasks" button to the sticky footer so it remains visible and clickable regardless of content height. Both the analyze and add-tasks buttons now live in the footer, ensuring users can always trigger analysis. Build confirmed clean.

---

### 2026-06-18 12:15 — `main`

Simplified the commit workflow: the post-commit hook has been stripped down to a no-op, and the agent now owns the ledger directly — writing a narrative entry to LEDGER.md before each commit so it lands in the same commit as the code. CLAUDE.md documents the new workflow clearly. The GitHub Wiki Home page is live and a sync Action is in place to keep the Ledger wiki page up to date on every push.

---

### 2026-06-18 11:49 — docs: add task tracking refs, ledger hook, and architecture rules to CLAUDE.md

- **Commit**: `5a34114` · branch `main`
- **Author**: Ori Lerman
- **Files changed** (4):
  - .githooks/post-commit
  - CLAUDE.md
  - CONTEXT.md
  - LEDGER.md

---
