# Talk orchestration and Work module — design target

**Date:** 2026-08-02  
**Status:** Design target; guided-conversation prototype selected  
**Prototype question:** How should one Talk surface coordinate a busy person's Calendar, Work, Nutrition, Workouts, Habits, and Achievements without becoming an overwhelming questionnaire or an ungrounded chatbot?

## Product outcome

HealthyFlow should help a busy person decide what matters, shape a realistic day around fixed commitments, execute one useful action at a time, recover after attention drifts, and record what actually happened so future plans improve.

The product loop is:

> **Ask → understand capacity → choose targets → plan across modules → execute one block → record reality → review → replan → learn.**

Talk is the coordinator, Today is the shared execution surface, and each module remains the source of truth for its own records.

## Product roles

### Talk

Talk owns conversation and orchestration. It:

- understands what the user is trying to do;
- builds bounded context from the relevant modules;
- asks only questions whose answers can change the plan;
- handles one topic at a time;
- proposes a plan or change with a clear explanation;
- previews writes before applying them;
- guides Focus blocks and module-specific check-ins;
- helps the user recover after a blocker, interruption, or drift;
- records structured outcomes that improve later suggestions.

Talk is one visible surface with several internal workflows. It is not one giant prompt that is expected to handle every possibility implicitly.

### Today

Today is the shared Daily Plan and execution surface. It should answer:

> **What should I do now, and what comes next?**

It composes references to Calendar events, Tasks, Habit instances, Work Focus blocks, planned meals, planned Workouts, breaks, and transitions. It does not duplicate the source records owned by those modules.

### Modules

Modules own context, records, outcomes, and typed capabilities:

| Module | Planning responsibility | Outcome responsibility |
|---|---|---|
| Calendar | Fixed commitments and available windows | No duplicate record |
| Work | Projects, targets, aligned Tasks, Focus blocks | Work reviews, Task updates, Project context |
| Nutrition | Intended meal timing | Actual Calorie entries after eating |
| Workouts | Planned Workout timing and plan selection | Actual Workout session |
| Habits | Place relevant Habit instances | Habit outcome/progress |
| Achievements | Surface relevant targets | Actual measurable result |
| Tasks | General responsibilities and Rollover | Completion, rescheduling, or Rollover |

Planning and recording remain separate. A planned meal is not a Calorie entry, a planned Workout is not a Workout session, and time spent working is not by itself evidence of Project progress.

## Work module

Work is a first-class HealthyFlow module built around the existing day, Calendar, Tasks, and Talk. It contains Projects and the durable memory of Work sessions; planning and active coaching still happen through Talk and Today.

### Project

Each Project needs:

- **target** — the outcome being pursued;
- **definition of done** — observable evidence that the target was achieved;
- **current milestone** — the nearest meaningful checkpoint;
- **non-goals** — work intentionally excluded from the current scope;
- **constraints** — deadline, budget, quality level, and dependencies;
- **context** — bounded background, decisions, discoveries, blockers, and links;
- **Task list** — Tasks connected to the Project;
- **next valuable step** — the smallest currently useful move;
- **Work-session history** — outcomes, attention, blockers, and reviews.

A user can also run a standalone Work session that is not connected to a Project.

`Project`, `Focus block`, `Work session`, `Work review`, `Daily Plan`, and `daily target` are proposed domain terms. If the design is promoted to production, their canonical meanings must be added to `CONTEXT.md` before implementation spreads them through code and issues.

### Focus block

A **Focus block** is the startable execution wrapper placed on the Daily Plan. It is not a Task and must not be stored as one.

- references one Project or a standalone context;
- references one or more Tasks without copying them;
- records planned start, duration, intended evidence, and transition time;
- moves through `planned → active → reviewing → completed/canceled`;
- exposes **Start** on Today and opens the existing Talk conversation;
- produces a Work session only after the block is reviewed;
- never marks its referenced Tasks complete without an explicit review outcome.

**Invariant:** when Talk schedules focused Work, it creates or proposes a Focus block. It must never use an ordinary scheduled Task as a substitute. Until the Focus-block write capability exists, Talk should preview the proposed block without writing a regular Task.

### Target alignment

Work optimizes for meaningful progress rather than hours or completed Task count.

Before scheduling a Task, Talk classifies its relationship to the Project target:

- **direct progress** — creates evidence toward the current milestone;
- **unblocking** — removes something preventing progress;
- **maintenance** — necessary but does not advance the target;
- **optional polish** — potentially useful later but unnecessary now;
- **unrelated** — does not serve the active target.

Talk explains this judgment and the user decides. It never silently deletes or deprioritizes work.

Every Focus block has an observable intended outcome. “Work on the app” is too vague; “the production login smoke test passes” is valid.

At the end of a block, the review asks:

- What changed because of this block?
- What evidence was produced?
- Did the block advance or unblock the milestone?
- What got in the way?
- Did unnecessary work appear?
- What is the smallest valuable next step?

## Talk as an orchestration runtime

### Closed workflow set

The initial internal workflows are:

- `plan_day`
- `plan_work`
- `run_focus_block`
- `review_focus_block`
- `replan_day`
- `log_outcome`
- `review_project`
- `quick_chat`

The workflow and stage are persisted independently of conversation messages. Closing and reopening Talk must not lose an active plan or Focus block.

A Talk workflow state may contain:

- active workflow and stage;
- anchor date and current local time;
- requested focused minutes versus total elapsed time;
- selected Project and target;
- current milestone and candidate Tasks;
- proposed or active Focus block;
- remaining available minutes;
- queued topics;
- pending changes requiring confirmation.

### Relevance and question selection

Talk should not walk through every module on every day. It ranks topics in this order:

1. the user's explicit request;
2. continuation of an active workflow;
3. hard Calendar constraints;
4. the selected target and current blockers;
5. high-confidence actionable Daily Signals;
6. existing scheduled commitments;
7. relevant historical patterns and confirmed preferences.

It covers one topic per response and can show a small queue such as “Next: lunch and Workout.”

### Capability contract

Each module exposes bounded, Zod-defined read, proposal, write, and outcome capabilities through the shared AI capability registry. Talk never depends on an unbounded dump of the user's account.

Representative capabilities include:

- Calendar/Daily Plan: compute availability, validate a plan, preview changes, apply a confirmed plan;
- Work: list Projects, read Project context, review Task alignment, propose Work blocks, start/finish a Focus block, record a Work review, update Project context;
- Nutrition: plan meal timing, search history, prepare and confirm actual Calorie entries;
- Workouts: read Workout plans, schedule a planned Workout, record an actual Workout session;
- Habits: read relevant Habit instances and record outcomes;
- Achievements: read targets and record results.

### AI versus deterministic code

The model handles:

- natural conversation;
- choosing the next useful question;
- explaining tradeoffs;
- decomposing a target into a small outcome;
- reviewing whether Tasks appear to serve a target;
- proposing recovery after drift;
- summarizing Project discoveries and next steps.

Deterministic code handles:

- exact Calendar availability;
- time zones and date arithmetic;
- buffers and overlap validation;
- requested versus scheduled minutes;
- Focus/check-in timers;
- workflow state transitions;
- Zod validation and source-record ownership;
- confirmation requirements and writes;
- planned-versus-actual distinctions;
- notification limits, quiet hours, and idempotency.

The model receives computed windows such as “10:00–11:00, 15-minute transition required, maximum Focus block 45 minutes.” It should not invent schedule arithmetic from prose.

## Focus and recovery loop

1. Establish an observable target for the block.
2. Start a short block sized from confirmed user preferences and available time.
3. Keep the current outcome visible in Today and Talk.
4. Check in at the end of the block, or earlier if the user reports a problem.
5. Record `done`, `continuing`, `blocked`, or `drifted`.
6. When blocked or drifted, offer a small recovery choice:
   - resume for a shorter interval;
   - make the next step smaller;
   - remove or defer unnecessary work;
   - replan the remaining day;
   - intentionally change the target.
7. Review evidence of progress and update Project context.

HealthyFlow does not claim invisible distraction detection. It knows a check-in went unanswered, a block ended without an outcome, or the user reported drift. The promise is timely check-ins and fast recovery, not surveillance.

## Structured personalization

Reviews produce bounded facts rather than vague AI memory:

- planned and actual Focus duration;
- outcome and evidence produced;
- target relationship;
- drift or blocker reason;
- estimated versus actual duration;
- effective re-entry action;
- preferred break and transition length;
- typical meal, Workout, and Habit timing.

HealthyFlow can suggest a preference change after enough evidence, but never silently changes a durable preference.

## John golden scenario

John is a busy solo entrepreneur who manages several Projects and watches his weight using targets he configured himself.

### Starting context

- Current time: 10:00.
- Calendar: client meeting at 11:00 and accountant call at 15:30.
- Requested Work: two hours of actual focused time.
- Project A: publish InvoiceFlow; production authentication blocks submission.
- Project B: Acme client site; homepage changes are due tomorrow.
- Project C: weekly newsletter; draft is not needed until Thursday.
- Nutrition: user-defined daily target, breakfast not yet logged, lunch not yet planned.
- Workout: Upper Body A normally occurs today.
- Habits: weigh-in completed, lunchtime walk still open.

### Required experience

1. Talk clarifies whether “two hours” means focused or total elapsed time.
2. Calendar computation finds only 45 safe Focus minutes before the 11:00 meeting after a 15-minute transition.
3. Talk asks which Project should move forward.
4. For InvoiceFlow, it identifies the authentication fix as direct/unblocking progress and flags color polish and competitor research as optional or unrelated.
5. John confirms a 45-minute block with the observable outcome “production login smoke test passes.”
6. The block review records code progress and a newly discovered environment-variable blocker.
7. The client meeting creates a deadline; Talk replans without losing the InvoiceFlow target.
8. A later InvoiceFlow block is interrupted by drift into competitor research.
9. Talk explains that the research does not remove the current blocker and proposes a 15-minute re-entry step.
10. John completes the smoke test; the Project context, Task state, and next step update.
11. Lunch is scheduled but not logged until John says what he actually ate and confirms the Calorie entries.
12. The planned Workout becomes a Workout session only after completion is recorded.
13. The optional day summary separates meaningful progress, maintenance, health, and deferred unnecessary work.

### Golden invariants

- No proposed block overlaps a Calendar event or required transition.
- Scheduled Focus time never exceeds the user's requested focused minutes.
- Every Work block names its Project/standalone context and intended evidence.
- Task-alignment judgments include an explanation and remain overridable.
- Planned food never becomes a Calorie entry before the user reports eating it.
- Planned Workout never becomes a Workout session before completion is recorded.
- Writes are previewed and confirmed.
- Drift recovery preserves the chosen target unless John intentionally changes it.
- Project context records discoveries and next steps without copying the whole conversation.

## Delivery sequence after validation

The canonical delivery order is maintained in the [six-phase Work → Today → Talk delivery plan](../plans/2026-08-03-work-today-talk-six-phase-delivery-plan.md):

1. complete Work manually;
2. put Work on Today;
3. make Today the shared Daily Plan for every enabled module;
4. define the bounded module capability registry;
5. research and prove the server-keyed AI runtime through the OpenAI API;
6. ship the guided Talk orchestration and pass the John golden scenario.

The order is deliberate: no later AI phase may substitute for an incomplete manual record or action in an earlier phase.

## Prototype verdict

The prototype was throwaway, used in-memory fixture state, and performed no real mutations. John’s scenario was compared through three structurally different Talk experiences:

- **A — Guided conversation:** Talk leads one decision at a time while a compact day rail keeps context visible.
- **B — Plan canvas:** the evolving Daily Plan is primary and Talk appears as contextual decisions attached to it.
- **C — Focus cockpit:** the current target and Focus state dominate while Talk acts as a recovery and review layer.

**Decision (2026-08-02): choose A — Guided conversation.** The winning idea is the conversational hierarchy, not a new Talk interface. Work planning, alignment, Focus check-ins, replanning, and reviews must use HealthyFlow's existing Talk page and composer.

Work is not a second planning surface. Its page should follow the established Nutrition/Calories module pattern:

- Work holds and displays Project, target, context, Task, blocker, and Work-session records.
- Users can create and correct those records manually from Work.
- Work offers contextual links into the existing Talk page with a prepared, editable prompt.
- Talk uses the selected Project and Task context to plan, coach, review alignment, and propose confirmed updates.
- Returning from Talk leaves the durable result visible in Work, just as a confirmed nutrition action leaves a Calorie entry visible in Nutrition.

Rejected structures B and C should not become separate product surfaces. Useful context from them belongs in normal Talk messages or confirmed action cards, while the Daily Plan remains visible in Today.
