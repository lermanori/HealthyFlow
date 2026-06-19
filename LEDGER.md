# HealthyFlow — Project Ledger

Auto-updated on every commit. Newest entries appear first.

- GitHub Issues: https://github.com/lermanori/HealthyFlow/issues
- Kanban: https://github.com/users/lermanori/projects/1/views/1

<!-- entries -->

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

