### 2026-08-26 19:57 — `fix/talk-goal-tool-recovery`

Production Goal-context smoke testing exposed GPT-4o mini copying JSON-Schema `format` metadata into an `update_goal` call, which strict validation correctly rejected but Talk incorrectly surfaced as a fatal raw error. Model-originated input mistakes now return recoverable tool feedback without weakening any schema, and the effective prompt/tool boundary explicitly redirects dated work updates away from Goal context because it is not a progress journal. The exact route-level regression, 45 focused assistant tests, backend typecheck, all 830 backend tests and lint with no new errors are green.

---

### 2026-08-26 19:24 — `codex/personal-assistant-prototype`

Turned Talk into a goal-aware personal assistant: user-owned Goals and context now guide macro-to-micro planning, Habit history supplies honest 30-day evidence, and every AI-proposed Goal change remains editable and confirmation-gated. Talk is now resilient across mobile composition, attachments, long conversations, cancellation, retry and text-to-speech playback, while Local-day adoption and Cloud timestamp failures surface explicitly instead of losing or inventing state. Both typechecks, 234 frontend tests, 828 backend tests, focused browser coverage, lint, the production build and the iOS sync build are green; real-device smoke testing passed for the new assistant flow.

---

### 2026-08-25 16:25 — `main`

Real-device Airplane Mode verification exposed that Cloud status waited for an HTTP rejection and never listened for the native offline boundary, so iOS could remain silent while a request hung. Cloud sync now checks Capacitor's connection state before every attempt and surfaces the persistent safe-on-device notice immediately on an offline event; the exact browser reproduction and all 223 frontend tests are green.

---

### 2026-08-25 16:09 — `main`

Closed the final Local-day account-entry gap: password login, provider login and signup now download, merge and validate the account day before opening the session, while a failed download leaves the prior session untouched. Cloud subscribers now see a persistent failure notice without risking their Local changes, and the notice clears on recovery. The focused browser regression, all 223 frontend tests, lint, typecheck and the production build are green.

---

### 2026-08-25 15:50 — `main`

Cleared the main-branch CI lint gate by removing a no-op `try`/`catch` from Guest session startup; failures still propagate to the entry point exactly as before. Frontend lint, typecheck, all 223 unit tests and the production build are green locally.

---

### 2026-08-25 15:23 — `feat/guest-mode`

Audited the Cloud sync handoff and closed the gaps that made it unsafe to ship: stale device rows no longer overwrite newer server data, a successful exchange no longer retriggers itself, hosted Health deletions travel as tombstones, Workout exercise edits move their parent, and foreign record ids are refused. The owner has applied the two Supabase migrations; both typechecks, 223 frontend tests, 808 backend tests and the production build are green, with simulator verification now in progress.

---

### 2026-08-25 — `feat/guest-mode`

Logging out of a registered account did not close its day: the next launch
reopened it with no token and no password, labelled *Guest*, because
`adoptLocalDayOwner` had only an id and invented the rest. Fixed in three steps —
the document now records whether its owner is a Guest and only a Guest's day
opens without a session; the login and stranded-day screens say whose day the
device is holding instead of offering a guest session on top of it or permanent
erasure as the only exit; and there is now one document per person rather than
one per device, which is what made every identity change a collision.

Nothing is deleted on logout, deliberately: a free registered account has no
server copy and no export, so "delete" would be destruction with no recourse. All
five verification commands are green (223 frontend, 803 backend). **The move onto
per-owner filenames has never run on a real device** — it is written to read back
before it removes anything, but that ordering is the whole safety argument and it
is untested outside the memory driver.

---

### 2026-08-25 — `feat/guest-mode`

Cloud delta sync is built, closing the gap the last three sessions were mitigating:
a subscriber's changes now travel to the server and back through one `POST
/api/sync`, with a single `mergeRows` in `backend/src/sync-contracts.ts` running on
both sides and `adopt.ts` folded onto it so the rule exists once. Executing the
plan turned up three things it had not anticipated — health is stored
client-shaped on the device and relationally on the server, no health table had
`deleted_at`, and four tables carry unique constraints on natural keys that two
devices will collide on — so the work also includes a translation layer beside the
existing `*ToClient` twins and a `SYNC_IDENTITY` table that both the merge and the
`ON CONFLICT` read.

**Two migrations are written and unapplied, and nothing syncs until they are.**
All five verification commands are green (203 frontend, 803 backend), but nothing
has run against a real database or a real phone — which in this codebase has not
been sufficient. The lapsed-subscription deletion job is deliberately not built
and must not be forgotten; only the freeze exists, and it is just the subscription
gate refusing the exchange.

---

### 2026-08-23 17:30 — `feat/guest-mode`

The owner reported Items they had completed and deleted coming back. Not rollover,
and not the display: **nothing uploads.** Local is the source and the server is
never updated from it, so every sign-in re-downloaded the server's older copy and
reverted whatever had been done on the device since.

Behind it sat a worse one, unshipped. `adoptAccountDay` concatenated the two days
on the claim that ids "come from two generators and cannot collide" — true the
first time a Guest signs in, false every time after, because by then the device
holds the account's own rows. Choosing "Keep both" a second time would have
duplicated the entire account, 109 rows in this case. The adopt tests all used
disjoint ids, so none of them could catch it.

The merge is now a union by id with the more recently changed row winning, which
both stops the duplication and preserves what was done on the device. The sign-in
screen also tells the truth when the device already holds that same account: it is
not two days meeting, it is the same day plus whatever has happened here since, and
discarding costs exactly that.

None of this replaces the real fix, which is an upload. Recorded in `HANDOFF.md` as
the gap that keeps producing bugs.

---

### 2026-08-23 17:15 — `feat/guest-mode`

Signing in on a real iPhone downloaded the account's day — 110 Items, 48 Calorie
entries, 4 Workout sessions — wrote it, reported success, and made the document
permanently unreadable. `LocalTaskRowSchema` required `updated_at`, which is
device bookkeeping the server's `tasks` table does not have, so 106 of 110 rows
failed the schema on the way back in. The day was never lost; it simply could not
be read.

Three fixes, and the middle one is the real one. `updated_at` is optional, and the
export fills it from `created_at` rather than inventing a time. **`replaceLocalDay`
now validates before writing** — a write that succeeds and can never be read back
destroys access to a day while reporting that it saved one, which is the worst
failure available and exactly what happened. And the sign-in and claim screens no
longer report a local failure as "check your connection": an error without an HTTP
response is not automatically the network, and saying so sent the owner to fix the
wrong thing twice.

The owner's real document is the regression test's source: it now loads, and the
day builds with exact Capacity.

---

### 2026-08-23 17:05 — `feat/guest-mode`

The owner tried the real sequence — start as a Guest, sign in to an existing
account, close, reopen — and could not sign in again, with the wrong day showing.
The cause was a call site, not a rule. `rememberSessionUser` was written in exactly
one place, inside `applyVerifiedSession`, so it ran on verify and nowhere else.
Signing in changed the token, the day and the day's owner, and left the *previous*
identity cached. Reopening with the server unreachable then trusted that cache and
came back as the old Guest, holding a day owned by the new account — and every
attempt to sign in hit the same owner mismatch, which is why it refused.

Fixed in the funnel rather than at the sites: `adoptUser` now records the identity
it takes on and forgets it when there is none, so no path can miss it. The boot
path also stops preferring the cache: the document names its own owner and is the
thing about to be read, so it decides who the app opens as, and a cached identity
is only the fallback. A test walks the exact sequence.

---

### 2026-08-23 16:30 — `feat/guest-mode`

The owner's rule, and it is better than the fix it replaced: **a day on the device
means never show a login screen.** The earlier fix covered one route into that
screen — an unreachable server with a cached identity. But the screen itself is
the trap: the only thing a Guest can do there is start again, and starting again
mints an identity that cannot read the day sitting under it. Every route in was
dangerous, not just the one that happened.

So the document now names its own owner. A session token is how the *server* knows
who someone is; the day is already on the device and says whose it is, which is
enough to open it with no token, no cached identity and no network. Proved by
planting a day, wiping the entire web-view storage, and launching: the app opened
the day, computed Capacity and fired the overdue reminder, with nothing to
authenticate against.

`localDayExists` is gone, superseded by `readLocalDayOwner` — asking *whether*
there is a day was never as useful as asking *whose*.

---

### 2026-08-23 15:40 — `feat/guest-mode`

A Guest on the simulator came back to "Could not load this daily plan" and lost
their day. The cause was mine, in two parts. `AuthContext` cleared the session on
**any** verify failure, including an unreachable server — so a Guest who opened
the app offline was signed out, and starting again minted a new identity while the
document on the device still belonged to the old one. Every read then hit the
owner guard, which was correct and had no way out: the screen said Retry, and
retrying could never work.

Both are fixed. Only an *answer* ends a session now — no response at all means the
app opens as the identity the server last confirmed, which is what "never require
a network" has to mean when the day is on the device. And a stranded document is
recognised by name, so the app offers to start fresh with the loss stated instead
of a wall. Verified by recovering the actual stranded simulator.

A third, smaller thing fell out: the carry-forward test froze its dates while
`completeLocalTask` stamps the real clock, so it passed on the day it was written
and failed two days later. It measures the rule now, not the calendar.

---

### 2026-08-21 17:40 — `feat/guest-mode`

Pieces 2 and 3 are built. **Health is on the device:** the Local day now holds
Calorie entries, Weight entries, Workout sessions and plans, and Achievements, the
four day sources answer from the document instead of throwing, and the four health
services route to the device. That closes the contradiction ADR-0011 recorded and
`TARGET.md` named — nothing is withheld from someone without an account.
`generatePlan` stays hosted, because it is an AI call and `TARGET.md` exempts AI
from the offline refusal explicitly.

**Sign in from a Guest session works too.** It runs in two halves so the choice is
honest: the first authenticates and reads the account's archive without writing
anything, the second is the only step that touches the device. The person weighs
real counts on both sides and picks Keep both or Discard. A union cannot conflict
on identity — every id comes from one of two generators — but it can leave someone
with two of the same habit, which the copy says rather than hides.

Health records are stored client-shaped while Items stay server-shaped, because
each side stores whatever shape its consumers already speak. Two more rules moved
into `*-contracts.ts` so the device runs the server's code rather than a copy:
`summarizeAchievement` and the five workout row mappers. Verified: both
typechecks, 749 backend tests, 153 frontend tests, production build, and both
surfaces confirmed on a simulator. One gap left — the login screen has no
download, so signing in there still reads a hosted day.

---

### 2026-08-21 17:15 — `feat/guest-mode`

Claim is built. A Guest can become an account holder by email, Google or Apple
from **Create an account** in the menu — the slot Logout occupies for everyone
else, and which was empty for a Guest because a Guest cannot log out. The server
side is one guarded `UPDATE` on the row the caller already holds, with
`.is('email', null)` making "you must still be a Guest" atomic rather than
check-then-act. It takes no signup slot, grants no credits and seeds no
onboarding, and all three are asserted rather than assumed, because every
account-creating path did them before ADR-0012.

Planning caught something the spec had asserted without checking: the local day
was keyed on `isGuestSession`, which is `email === null`, so the instant Claim set
an email the day would have flipped to the server and looked erased. The device
now records which account it holds a day for; Claim never touches it, because
Claim never changes the `userId`. Verified: both typechecks, 749 backend tests,
126 frontend tests, production build, and the menu and screen confirmed on a
simulator. Nobody has submitted the form — it writes a real account to the live
database.

---

### 2026-08-21 17:10 — `feat/guest-mode`

Designed Claim — a Guest becoming an account holder — and specced it at
`docs/history/specs/2026-08-21-claim-by-signup-design.md`. The design itself is
small: one guarded `UPDATE` on the row the Guest already holds, so the `userId`
never changes and the Local day is still keyed correctly the instant it commits.
Nothing moves, which means no failure can leave a day half-moved.

Designing it settled four product decisions, three of which reverse something
already written down, now recorded in **ADR-0012**: local is the source for
everyone rather than only for Guests; entry is open, so Claim takes no signup slot
and meets no waitlist; the waitlist quota moves to Cloud as a founders' discount;
and credits and Cloud are separate products, so "founding" stops being a credit
cohort. Claim grants no credits — where the $1 goes is a growth lever that should
not be settled by accident, and until it lands anyone who claims has the whole day
and no AI.

`TARGET.md`, `CONTEXT.md` and `HANDOFF.md` are updated to match. `CONTEXT.md`
gains a **Claim / Sign in** collision, because both take a Guest to an account and
they are opposites. The work ahead is three pieces: Claim, then Health on the
device, then Sign in — which cannot start until Health is local, since the
download has nowhere to put it.

---

### 2026-08-21 16:05 — `feat/guest-mode`

Guest mode is verified end to end. On a simulator, against this branch's backend
with the guest migration applied, *Start without an account* creates the session,
a Task and a Habit with logged progress are written to the device, and the day is
still there after killing and reopening the app. That was the one claim nothing in
the repo could make: the 27 Local-day tests all run through the in-memory driver,
so `@capacitor/filesystem` had never actually been exercised.

Getting there was three false starts, none of them the guest code: the migration
had never been pushed, `VITE_API_URL` comes from `.env.production` regardless of
`.env` so the app kept asking production for a route only this branch has, and
`supabase db push` was timing out because a connected VPN owned the default route
and carried only HTTPS. Two questions closed as a side effect — loopback is exempt
from App Transport Security, so no dev-only ATS exception is needed, and a stale
`cap copy` renders a blank screen with no error at all. All of it is in
`HANDOFF.md` so the next person loses none of the same hours.

---

### 2026-08-21 15:05 — `feat/guest-mode`

Tapping *Start without an account* on the simulator failed, and the screen blamed
the network. Both halves were wrong. The real cause is that `POST /auth/guest`
lives only on this branch while production runs `main`, so the app 404s — nothing
to do with connectivity, and nothing wrong with the guest code. The message was
mine: it caught the error, threw it away, and printed a guessed diagnosis, which
is the silent fallback `CLAUDE.md` forbids. It now reports what actually came
back, and a duplicate toast from `AuthContext` is gone so one failure produces one
message. Confirmed on the simulator: the screen now reads "This build is pointed
at a server that cannot start a guest session yet."

---

### 2026-08-21 14:35 — `feat/guest-mode`

Verified guest mode on an actual simulator rather than only in Node: the iOS app
builds with the Filesystem plugin, launches, and shows *Start without an account*
with its disclosure. Tapping it was deliberately not done — the bundle points at
the production backend, so a test tap would have created a real Guest row. Two
fixes came out of the review pass: both sides now identify a virtual Habit
instance through the same `parseHabitInstanceId` rather than a looser local
regex, and a Guest no longer round-trips to Google Calendar every time they add a
timed Task, since they have connected no Calendar and zero is the true answer.

---

### 2026-08-21 14:15 — `feat/guest-mode`

Guest mode works on iPhone. Someone installs the app, taps *Start without an
account*, and gets a real day — Items, both backlogs, Habits with progress and
outcomes, rollover, Capacity, attention and settings — written to one JSON
document on the device and never to the server. Getting there took three shared
rules out of server modules and into the browser-safe core (`composeDayTaskRows`,
`isCarryForwardRow`, and the Habit outcome rules in a new `habit-contracts.ts`),
so the two sides run one copy of each rather than two that can drift; the backend
suite proves the extraction changed nothing. `onDevice(local, hosted)` in
`api.ts` picks a side per call, keyed on the identity — a Guest is an account
with no email — so every page above that line is untouched. ADR-0011 records the
store decision and `docs/architecture/the-day-on-two-sides.md` explains the shape.

The honest gap: Health is not on the device, so a Guest's Nutrition, Weight,
Training and Progress report `disabled`. That contradicts `TARGET.md`, which
calls them core rather than optional, and it has to be answered before the
listing claims guest mode gives you the whole day. The iOS build was not run —
the Filesystem plugin synced cleanly but nothing here can prove it round-trips on
a device. Both are written down in ADR-0011 and `HANDOFF.md`.

---

### 2026-08-21 11:59 — `feat/guest-mode`

The Guest session renewal is no longer inert. `GET /auth/verify` had been
re-issuing a Guest's token on every open since ADR-0010, and the client had been
throwing it away — so what shipped was a fixed 365-day fuse from account creation
rather than the sliding year the ADR describes. The re-issued token is now part
of a typed contract (`backend/src/auth-contracts.ts`) instead of an undocumented
extra field, and `src/lib/session.ts` owns every read and write of the token, so
the storage behind it can move to the Keychain without touching callers. Along
the way, eleven backend tests that had been reaching the live database through
incomplete dependency fixtures were made hermetic; the suite is 737 green.

---

### 2026-08-21 09:19 — `feat/guest-mode`

Extracted the browser-safe day composition core behind the existing nine-source dependency seam, leaving `day-summary.ts` as the Supabase-backed adapter while preserving its public interface and validation order. Direct core coverage and the Vite/Chromium startup guard now prove that device code can import the shared assembly without pulling server-only modules; both typechecks, 737 backend tests, 93 frontend tests, and the production build are green. This completes the behavior-preserving extraction; the device-local store and its adapter remain the next step.

---

### 2026-08-20 16:53 — `feat/guest-mode`

Added `POST /auth/guest`: a Guest is a `users` row with no email, holding identity and a credit balance and nothing else. It grants signup credits through the existing path, skips the signup access gate and public slots because a Guest is not a signup, keeps its own signup-shaped rate limit so guest starts and real signups cannot lock each other out, and refuses to create anything in E2E test mode. Scope was cut mid-session once free users' day data was ruled off the server: the Claim path and the signed-out entry into the app were removed rather than shipped, and onboarding seeding was dropped from the guest path because it writes user settings, which are day data.

The one real decision is recorded in ADR-0010. A Guest has no email and no password, so the session token is the only key to their row; expiring it would strand the row silently, which is the failure this project refuses. Guest sessions are therefore issued for a year and re-signed on every verified open, sliding forward for anyone who opens the app at least once a year, while an account with a password goes back to seven days. The residual risk is device storage — durable in the Capacitor shell, evictable within a week in an iOS browser — so whatever ships the entry point has to say so before a Guest starts and say so again if a session cannot be restored. Verified with 11 new endpoint tests, 741 backend tests, 93 frontend tests, both typechecks and a production build.

---

### 2026-08-20 15:41 — `docs/rebuild-source-of-truth`

Resolved four contradictions between the freshly written documents and the v1 the launch path actually ships. Choosing Path A — ship the account-required online app to reach the App Store, with guest mode pulled forward as the one piece of the target that goes in v1 — collapsed most of yesterday's guest design: because `demo-session` already mints a normal `{ userId }` JWT and credits, day summary and every AI route are keyed on `userId`, a Guest is simply a user row with no email. No guest token type, no device-keyed ledger, and no claim migration, since signing up becomes an in-place update of a row that already holds the data.

That left the vocabulary describing work that no longer exists. `Claim` had been defined as the one-time upload of local records and now names the moment a Guest becomes an account holder, in place, with "migrate", "import", "transfer" and "upload" all refused because they imply moving data that never moves. `Guest` had been defined by where its bytes live, which is implementation and is changing between v1 and v1.1; it is now defined by the user-facing property, and its avoid-line points at the collision that actually matters — a Guest is not a demo persona, which is seeded, shared and disposable.

The two `TARGET.md` problems were not wrong so much as undated. A line under the title now says the document describes the product being built and that the refusals mark where it differs from what ships. The refusals themselves are split three ways: in force today, true at v1, and knowingly broken at v1. Only one falls in the last group — never require a network — and it is recorded as a decision with an owner rather than quietly softened, since softening a rule to survive a release is how the rule dies. Closing it is now the stated entirety of v1.1.

### 2026-08-20 15:18 — `docs/rebuild-source-of-truth`

Rebuilt the three documents that govern how work happens here, each with exactly one job. The trigger was the founder's own diagnosis: the frustration was never the features, it was the vision and the AI harness, and a drifting harness is what stopped the Talk work mid-flight.

`TARGET.md` is new and decides what the product is for. It resolves a question that had been treated as a choice between three competing identities — talk your day in, everything on one clock, an honest number — by recognising they are not competitors at all. They are the input, the scope and the payoff of one product, and each plays a different role: input is the hook, scope is the reason to stay, truth is the differentiator. That reframing settled two questions that had been unanswerable: food and weight are core rather than optional, because cutting them removes the reason to stay; and Talk spans all three axes rather than only input, which makes "integrate AI with the modules that already exist" the work of making one axis carry the other two. The razor follows from it: a part earns its place if it makes input easier, the picture more complete, or the truth clearer.

Four corrections were made to it under scrutiny rather than accepted as written. The money section had promised both that we sell effortless input and that manual entry is good enough to live on, which cannot both be strongly true; it now states the trade plainly — free is a good planner, paid is an effortless one — names the risk being accepted, and records the signal that would reverse it. The razor table scored Work as failing all three axes, which was simply false since a Focus block is a daily-plan reference rendered on the timeline; it fails on second vocabulary instead, and is marked parked rather than cut, because the code stays. A section on how we would know it is working was added, and writing it surfaced that the differentiator is the one part of the product that reports nothing about itself: thirty-two analytics events exist and not one mentions Capacity, attention or the daily plan.

`CLAUDE.md` collapsed thirteen headings into three. The repo map listed eleven files of which seven were dead within hours of the restructure, so a hand-maintained file list was replaced by a table of directories plus the rule that live docs must be true and historical docs must be dated. Everything that was a rule is now written as an imperative under a heading that states the entry condition, which is what should stop it re-bloating. `CONTEXT.md` went from 218 lines to 101, and this time it is a real cut: organised by failure mode rather than by module, so an entry has to earn its place by naming a collision, a false assumption, or a claim about something that does not exist.

### 2026-08-19 09:59 — `docs/rebuild-source-of-truth`

Restructured the documentation so a directory name answers "can I trust this?" before anyone opens a file. The audit that prompted it found 103 tracked markdown files, and among the ~54 that are project documentation rather than harness config, roughly 40% by volume — 4,423 lines across five files — were executed implementation plans that read exactly like current intent. One is 1,525 lines and nothing links to it. The problem was never volume; it was that a live contract and a finished plan were indistinguishable in a listing, so every reader had to open a file to learn whether to trust it.

Everything time-bound now lives under `docs/history/`, whose README states the rule the repo runs on: live docs must be true, historical docs must be dated, nothing in between. Plans, specs, dated reviews, product positioning, point-in-time snapshots and dormant workstreams all moved there, and `docs/superpowers/` disappeared as a directory name because it described the tool that produced the files rather than anything a reader needs. Operational documents gathered into `docs/runbooks/`, and a `docs/architecture/` tier was created for documents that describe how a subsystem actually works — the gap that only became visible when `daily-signals.md` turned out to be true, and therefore not history, but had nowhere live to sit.

The audit turned up three things nobody had recorded. There were two ledgers: the maintained `LEDGER.md` and an undocumented `ledger/` directory holding six per-task files from 30 June, an abandoned earlier convention now folded into history. `.scratch/handoff-2026-06-23.md` was committed despite CLAUDE.md declaring `.scratch/` untracked, and both it and the generated capability inventory are now gitignored, since build output is not documentation. And `MISSION.md` sat at the repository root reading as the project's mission while actually describing the dormant Siri Capture workstream, which is exactly the kind of naming that makes a repository confusing to arrive at.

Two corrections made during the move. `ROLLOVER_IMPROVEMENTS.md` was deleted and then restored into history, because ADR-0002 cites it and ADRs are never edited — deleting a file an immutable record points at breaks the record rather than tidying it. For the same reason the history README carries a redirect table for citations from immutable documents. The ADRs themselves and `LEDGER.md` were deliberately left untouched: they are dated, append-only, and the least confusing documents in the repository.

The live root is now four documents plus the AGENTS symlink, down from eleven. Rewriting `CLAUDE.md`, `CONTEXT.md`, `README.md` and a replacement for the archived `FEATURES.md` is the next step and is deliberately not part of this commit, which is a move and nothing else.

---

### 2026-08-17 15:03 — `fix/bound-smart-reminders-query`

Bounded the reminder query that the previous entry filed rather than fixed. `SmartReminders` polled `GET /api/tasks` with no date every sixty seconds per open tab, pulling every Item the account had ever created — 105 rows on a real account, growing forever. It now calls a new `GET /api/tasks/reminders`, which returns only the rows a reminder could actually be raised from: timed, not completed, dated today or earlier, and — the part that does the bounding — past-dated only until the notification has been recorded. Age is never a cutoff, so the issue #20 case of a never-notified item left behind on an earlier day still fires, however old it is. The payload dropped to the six fields the surface reads.

The two tempting alternatives both change behaviour and were rejected. Reusing the day summary for the today-scoped half would pull in virtual habit instances and rollover rows that `getTasksByUserId` never returned, firing reminders that are silent today; a date-range window would drop exactly the old never-notified overdue items the overdue branch exists for. The filter is instead the client's own predicate pushed into SQL, with `not.is.true` rather than `eq.false` because both columns were added by migration and older rows can hold NULL, which the client reads through `Boolean()` as "not yet".

The derivation moved into `src/utils/reminderCandidates.ts` unchanged so it could be tested directly. Writing those tests surfaced a pre-existing limitation, left alone and now documented by a test: the elapsed check compares clock times only and ignores the date, so yesterday's 14:00 item stays quiet until 14:30 today rather than being overdue the moment the day rolls over. Verified with 13 new frontend tests, 8 filter tests driven through the real query builder, 6 route tests against the real Express app, both typechecks, a production build, and an inspection of the PostgREST URL supabase-js actually generates. `tests/day-summary.test.ts` still fails to compile on a zod type clash; confirmed pre-existing by reproducing it on a clean tree.

---

### 2026-08-17 19:56 — `main`

Recorded the local-first guest design, which settles what the product actually is: free on the device forever and offline, with money charged only for AI credits and for cloud backup and sync. The app stops being something you sign up for and becomes something you download and use, with every reason to refuse moved behind the moment of value rather than in front of it.

Four requirements were stated separately — value before signup, data on the device, guest mode indefinitely, and works offline without AI — and the fourth eliminates the two cheap architectures. An anonymous server account is still a server account, and keeping records local while computing days on a stateless endpoint still needs a round trip to render. Only true local-first satisfies all four, so there is nothing left to choose between.

It is also far smaller than it first appeared, because `buildDaySummary` already takes all nine of its data sources as injected dependencies and everything between them is pure. This is an extraction plus a second adapter, not a rewrite, and the boundary split it needs is the one already performed on the Achievement and Workout contracts. Two decisions were locked in that are cheap now and expensive later: local records carry client-generated UUIDs and an `updatedAt` so that backup-now can become sync-later without a mapping table, and the guest grant cap lives in a row rather than a constant because it is a cost-control dial to be raised when the economics are trusted, not a scarcity device.

Scope was deliberately bounded: Health stays account-only, since four more record types with local persistence roughly doubles the work and account-gating gives signup a second concrete reason. The `calendar_not_connected` change made earlier today turns out to have been a precondition rather than an unrelated fix — an offline guest has no Calendar by definition, and before that commit Capacity could only have told them "at most X unallocated" instead of the exact figure the whole pitch rests on. `MARKETING.md` still describes a subscription for the product and is now wrong in a new way; the real shape is a free app, consumable credits, and a cloud subscription, which happens to map cleanly onto StoreKit's two product types and narrows the open billing decision in #201.

---

### 2026-08-17 15:20 — `main`

A Calendar the user never connected no longer makes Capacity partial. Until now any account without Google Calendar could only ever be told "at most 4h 3m unallocated" — never "3h 40m usable time left" — because `complete` requires an empty `reasonCodes` array and `calendar_not_connected` was pushed unconditionally. That is the default state of every new account, so the product's most distinctive claim was hedged for exactly the people meeting it for the first time.

The distinction the contract already drew is the one that matters. `calendar_not_connected` and `calendar_unavailable` were separate codes because they describe different things: the first is a choice, the second a failure. A Calendar that was never connected is outside the system's world, no different from an obligation the user never wrote down anywhere — treating it as missing data would imply Capacity should always be partial, since something unrecorded always exists. A connected Calendar that could not be read is a genuine unknown, and there Capacity should still refuse to sound certain. Only the second remains a reason.

With no producer left, `calendar_not_connected` was removed from `CapacityReasonCodeSchema` rather than left as an emittable-by-nobody enum member — the same debt shape already documented for `grocery` and `meal`. Reason codes are computed per request and never stored, so nothing can hold a stale one. `calendar.status` still reports `not_connected`, which is the honest place to offer "connect your Calendar for a more accurate number" as a prompt rather than a hedge. Two Talk prompt strings that told the agent to expect the code were rewritten, and a Talk fixture describing a now-impossible state was moved to `calendar_unavailable` so it still covers the case it was written for.

Verified: 724 backend tests across 77 suites with no failures, 93 frontend tests, both typechecks — the backend one now covering `tests/` as well — and a production build. CONTEXT.md and FEATURES.md corrected from twelve reason codes to eleven in the same change.

---

### 2026-08-17 15:12 — `main`

The backend suite is fully green for the first time in this stretch: 724 tests across 77 suites, no failures. The suite that had been failing all along was `day-summary.test.ts`, and the cause was not what had been claimed repeatedly in these entries.

It was diagnosed as two copies of zod 4.4.3 producing nominally distinct inferred types, on the strength of TypeScript's "Two different types with this name exist" elaboration. That was wrong, and testing it settled the matter in seconds: moving `backend/node_modules/zod` aside left the failure byte-for-byte identical. The duplicate install is real — `backend/` has its own `package-lock.json`, so it is a separate install root by design — but it was never the problem. The actual error was in the message all along, one line further down: the test's item fixture was missing `projectId` and `project`, both added to `DaySummaryItemSchema` as required nullable fields by `287e8a2`. With them absent the only source was `...overrides`, typed `Partial<DaySummaryItem>`, so `projectId` arrived as `string | null | undefined` against a required `string | null`. Adding the two fields fixed it.

The more useful finding is why it hid for weeks. `backend/tsconfig.json` sets `include: ["src/**/*"]`, correctly, because `src` is what ships — so `npm run typecheck` never looked at `tests/` and reported success while a test file could not compile. Checking is not the same job as building. `tsconfig.typecheck.json` now extends the build config and adds `tests/**/*`, and `npm run typecheck` uses it while the build keeps the narrower one. It was clean on the first run across both directories, and it was verified to actually bite by deleting `projectId: null` again and confirming the typecheck fails rather than staying silent until jest runs.

This unblocks the `calendar_not_connected` change, which was deliberately held back: it alters capacity semantics and three of the assertions covering it live in the suite that could not run.

---

### 2026-08-17 14:39 — `main`

Cleared the browser console of the same pollution the backend log had. All six `console.log` calls in `src/` are gone; `console.error` and `console.warn` on real failure paths were left alone.

Three of the six were in `taskService.getTasks`, which logged its arguments, then its entire response, then filtered every returned task looking for rolled-over ones purely so it could log those too. Since `SmartReminders` calls it unfiltered every sixty seconds, that was an unnecessary pass over the account's whole history, once a minute, to print something nobody reads. The function is now two lines.

Two others turned out to be the only reason their surrounding code existed. `App.tsx` registered a `visibilitychange` listener whose handler did nothing but log, so the listener and its effect went with it and `useEffect` is no longer imported there. `PWAInstallPrompt` branched on the install outcome only to log the accepted case; the outcome is still awaited, because the promise must settle before the prompt is cleared, but the branch is gone and a comment now records that the outcome is deliberately not acted on.

Also verified while looking: `SmartReminders` fetches the entire task history on a sixty-second interval, which is where the `count: 105` in the log comes from. It cannot simply be scoped to today — the overdue branch matches `scheduledDate <= todayStr` on purpose, and narrowing the query would silently stop overdue reminders for past-dated tasks, which is the behaviour issue #20 added. Filed separately rather than fixed in a cleanup commit. Verified with typecheck, lint at zero errors, 80 frontend tests and a production build.

---

### 2026-08-17 14:19 — `main`

Stopped the task list drowning the backend log. `GET /api/tasks` logged its entire response body at debug level, so every load of Today printed every Item on the account — full objects, hundreds of lines, ending in Node's "... 5 more items" truncation. It buried everything around it, including the Google Calendar failures added an hour earlier specifically so that failure could be diagnosed. `getTasksByUserId` did a smaller version of the same thing, one line per row of an unbounded query.

Both now log a count rather than a payload. An account's whole Item history is not something to write to a log in the first place, and the useful signal — which user, which date, how many — survives at a single line. The two remaining debug traces in the tasks route were already bounded and were left alone.

Noted while verifying: `tests/admin/user-management-routes.test.ts` failed once with a socket hang up and passed both in isolation and on a full re-run, so it is flaky rather than broken and nothing in this change touches admin routes. The suite is otherwise unchanged at 673 passing with the one pre-existing zod failure.

---

### 2026-08-17 13:47 — `main`

A screenshot of the running app showed Capacity rendering, which confirmed yesterday's default, and exposed two things at once. The panel read "At most 4h 3m unallocated · Calendar obligations could not be checked" — an upper bound computed against a window the user never chose, with no indication of what that window was. The justification for defaulting the planning window had been that Today always renders the window it computed against, and that turned out to hold only for `complete` status: `capacityDetail` swapped the window line out for reason copy in `partial`, which is precisely the state where an unexplained number does the most damage. The window is now shown for every status that has one, and only `unavailable` has none.

The second finding is why the calendar failed, or rather why nobody can tell. The copy maps to `calendar_unavailable`, which the day contract distinguishes from `calendar_not_connected` — the read failed rather than being absent, so Google Calendar is connected and erroring. An `invalid_grant` would have flipped the connection to disconnected, so this is something else: a token refresh failure, an API error, or the status lookup itself rejecting. Both failure paths in `buildDaySummary` swallowed the error with a bare `catch`, so the cause never reached a log. Degrading the day is right and one module failing must never fail the whole day, but discarding the reason is not, and it left a user-visible downgrade of the product's headline number with nothing to debug from. Both paths now log with the user, date and error before returning their status.

Worth noting the severity shift: the known Google-sync defect was filed as a first-session error toast, a credibility problem. Now that Capacity is on by default it also downgrades the one number no competitor can produce from exact to hedged, which moves it onto the critical path for the launch message rather than the polish list.

---

### 2026-08-17 13:30 — `main`

Turned Capacity on by default, which makes the day contract's most distinctive read visible instead of hidden. `planningWindow` defaulted to `null`, and Capacity cannot be computed without a window, so every new account saw no Capacity at all until it found a Settings toggle it had no reason to look for — the one number no competitor can produce was invisible to everyone who had not already gone looking.

The default value was not invented. The Settings toggle has always enabled 08:00–18:00 with 15-minute buffers, so that literal became `DEFAULT_PLANNING_WINDOW` in the settings schema and the toggle now imports it, meaning re-enabling Capacity restores exactly the window a new account starts with and the two cannot drift. Settings are a JSONB blob and the default is applied at parse time, so accounts stored without a window pick it up with no migration.

The tension worth recording: Capacity's whole design is a refusal to guess, and a default window is an assumption the user never made. It survives scrutiny because the panel already renders the window it computed against — "08:00–18:00 window · 2h 15m known load · 15m buffers" — so the basis of the number is on screen and editable rather than hidden. Clearing the window in Settings still returns Capacity to `unavailable` with `planning_window_missing`. Two settings tests asserting the old null default were updated to assert the new one, and FEATURES.md and CONTEXT.md were corrected in the same change, since both had just been rewritten to document the null behaviour. Verified with both typechecks, 673 backend tests, 80 frontend tests, and a production build.

---

### 2026-08-16 17:59 — `fix/env-resolution-across-worktrees`

Made a fresh worktree inherit configuration instead of failing on its first database call. `.env` is gitignored, so it never travels to a new checkout, and the old loader resolved it relative to the worktree — where nothing exists. The Supabase client is built at module scope from `process.env.SUPABASE_URL!`, so undefined credentials produced a client that looked fine and then failed every request inside undici with `TypeError: fetch failed`, naming neither the missing variable nor configuration as the cause.

The loader now resolves candidates in precedence order: `HEALTHYFLOW_ENV_FILE`, this checkout's `backend/.env` then `.env`, and finally the same two in the **main** checkout. A worktree can always find the main checkout because its `.git` is a file pointing into the main repository, so `git rev-parse --git-common-dir` resolves there and its parent is the main working tree. No symlink, no per-worktree setup step. `db/client.ts` no longer runs its own `dotenv.config` against a different path than the entrypoint's — both now go through the shared resolver, so the two can never disagree about which file is authoritative. A startup guard names any missing variable and lists the files actually loaded, which is safe because `tests/setup.ts` already injects dummy Supabase credentials for the 47 suites that import the client.

Proven rather than assumed: a throwaway worktree created with no `.env` of its own resolved the main checkout's file and saw both Supabase variables. The backend suite is unchanged at 673 passing with the one pre-existing zod failure, and the backend typechecks.

Two corrections worth recording. The reported `fetch failed` was first diagnosed as missing variables; that was wrong — they are present in the root `.env`, on lines with a leading space that a `^SUPABASE_URL=` grep silently missed while dotenv trims it happily. An attempt to test Supabase reachability from the agent sandbox then failed against every host including GitHub, so it proved nothing about the real network. The recurring worktree failure this change fixes is real and separate; the cause of that particular main-checkout failure remains unidentified.

---

### 2026-08-16 17:33 — `feat/hide-work-surface`

Made the launch surface cut: Work now sits behind `VITE_WORK_ENABLED`, opt-in like every other release flag, so production hides Projects, Focus blocks and Work sessions while Today and Talk stay the only things in the mobile dock. Nothing is deleted and the server is untouched — Work keeps computing into every day and Talk's work-planning workflow keeps running. The flag governs reachability only.

The interesting part was where to apply it. Today reads Focus blocks from two independent places, the timeline rows and the attention strip, so gating each render site would have left the next one free to reintroduce them. Instead the flag is applied once to the fetched day in `applyWorkVisibility`: the Work slice becomes `not_scheduled` with no blocks and `focus_block` references are filtered out of the daily plan. Both are states the day contract already models, so nothing downstream learns a new shape. Every optimistic cache write on the day transforms already-filtered data and none touch the Work slice, so the gate holds. The Project selector on Add is hidden too, since filing a Task into a Project the user cannot open is a dead end.

Documentation was updated in the same change rather than after it, because the docs had just been corrected to say Work was live and unflagged and would otherwise have been false within the hour. CONTEXT.md now also distinguishes a user setting from a release flag — Work has no user toggle and is simultaneously behind a release flag, which are different mechanisms that were easy to conflate. Verified with both typechecks, 80 frontend tests including new assertions covering all five gates, and a production build.

---

### 2026-08-16 17:20 — `main`

Committed the Phase 6 Talk work that had been sitting uncommitted in the working tree since 2026-08-04, at the owner's request, so that the documentation branch could merge into a clean tree. The work separates a Talk workflow from a Talk stage: ADR-0009 amends ADR-0008 after the Phase 6 tracer showed the Phase 5 shape — one agent carrying every workflow's instructions and a single combined tool allowlist — already failing at two workflows' worth of contracts, with a captured regression trace of `validate_daily_plan` being called three times in a row. Stages are now either deterministic application activities or bounded agent activities scoped to only the instructions, tools and output contract that stage needs, and the application owns every transition rather than the model.

New modules carry the workflow definitions and a store with both an in-memory and a Supabase implementation, behind migration `20260804120000_phase_6_generic_talk_workflows.sql`, which generalises the Phase 5 tables to the closed set of eight workflows. CONTEXT.md gains the Talk workflow and Talk stage vocabulary along with an explicit note that a workflow, a stage and a capability are three different things.

Verification before committing: both typechecks pass, and the backend suite is 673 passing across 74 suites with one failure. That failure, `tests/day-summary.test.ts`, is **pre-existing and unrelated** — it reproduces identically against clean Phase-5 code in a separate worktree. Its cause is two copies of zod 4.4.3 installed at the repo root and under `backend/`, which makes `z.infer` produce two nominally distinct `DaySummaryItem` types under jest's module resolution while the backend typecheck itself passes. Filed rather than fixed here.

---

### 2026-08-16 16:08 — `worktree-ios-launch-mission`

Reconciled MARKETING.md with the code without rewriting the strategy, which is still blocked on the iOS launch decision. The margin trap the document has warned about since July turns out to be closed, but not the way it proposed: purchases grant fixed packs (`TOP_UP_PRICE_USD = 5` → `TOP_UP_CREDITS = 250`) rather than running through `APP_TOKENS_PER_USD`, which survives untouched and meters cost only. The real sell rate is 50 credits per dollar, so the 500/$1 and 250/$1 figures written into P0.1 never shipped and are now explicitly marked do-not-implement. The onboarding-credit item is likewise already shipped exactly as specified, and the custom-domain and privacy/ToS items are done.

The document's structural problem was that every payment and channel item assumed web checkout and web signup, with no mention anywhere of iOS, TestFlight or StoreKit. Two banners now bound that: one recording what is verified in code, one marking §4's payment items and §5's channel plan superseded pending #201. P0.3 additionally records the concrete consequence — every purchase CTA is gated behind `!isNativeApp`, so a TestFlight user who exhausts credits currently has no path to more on any surface — and notes that the iOS variant of the paid-path smoke test can be proven for free in the StoreKit sandbox.

A stale founding-member offer in §3 quoting "$1/mo, 500 AI credits" was struck rather than rewritten, since the figures are wrong but the offer's shape is a positioning decision still in flight. §1, §2, §6 and §7 were left alone as judgment and market research rather than claims about this codebase. The documentation audit is now complete across every file the repo map treats as a source of truth.

---

### 2026-08-16 15:54 — `worktree-ios-launch-mission`

Rewrote CONTEXT.md's opening description, the one edit held back from the earlier passes because it encodes a point of view rather than correcting a fact. The old paragraph introduced HealthyFlow as a tracker where users capture tasks, habits, groceries, meals and workouts and then schedule, complete and roll them over — a description that contradicted the same file two sections later, since grocery and meal have no surface, and that described the codebase as it stood before Work, Capacity, attention and the daily plan existed.

The replacement names the three ideas the day contract is actually built on: what the user plans, what they record, and how much usable capacity is left. It states that plan and actual are distinguished structurally rather than by convention, keeps carry-forward, and makes the refusal to guess an explicit property of the contract rather than an omission. Rollover, item types and every other term below are unchanged.

---

### 2026-08-16 15:47 — `worktree-ios-launch-mission`

Closed out the documentation audit by covering the files the repo map does not list as sources of truth. Most held up: `docs/local-database.md` is accurate down to its `major_version = 17` and container name, `docs/analytics/` still honours its own invariant that only `posthogProvider.ts` imports `posthog-js`, and `docs/archive/README.md` already warns that the v1 PRD reads as false if taken as current — which is the framing the rest of the repo needed.

`docs/daily-signals.md` described Daily Signals throughout as though it were shipped, never mentioning that the whole surface sits behind `VITE_DAILY_SIGNALS_ENABLED` and is off for every production user; it now says so up front. Its instructions for adding a signal also pointed at `daily-context.ts`, which only re-exports `DailySignalTypeSchema` — edits there would have done nothing, so the path now points at `daily-context-schema.ts` where it is actually defined.

The two review directories carried dated findings with no statement that they are dated. `docs/ux-review/` gained a README explaining that it is a point-in-time review from 18 July 2026, and naming two High findings verified as since fixed — the health-route redirect that `ModuleGate`'s loading branch now handles, and the Add page module gating that `useSettings` now resolves — while being explicit that the remaining findings are unverified rather than unfixed. `docs/fixes/redesign-v2-review/` gained the same warning.

---

### 2026-08-16 15:34 — `worktree-ios-launch-mission`

Second pass over the documentation, covering everything the repo map calls a source of truth that the first pass had not reached. README.md claimed `LEDGER.md` is appended on every commit by `.githooks/post-commit`; the hook is explicitly a no-op and says so in its own comment, so the ledger is hand-written and the README now says that. README-DEPLOYMENT.md was largely original scaffold text: it advised upgrading SQLite to Postgres, listed a `DATABASE_URL` nothing reads, instructed editing a hardcoded `API_BASE_URL` constant that is actually `VITE_API_URL`, and published `demo@healthyflow.com` / `demo123` as working login credentials. All corrected, with the untested Render and Heroku options marked as such and the fail-closed signup gate added to troubleshooting.

`docs/ios.md` is added to the repo map in CLAUDE.md as authoritative for anything native — it was a genuine source of truth that the map did not list. Its claim of an iOS 17 minimum, repeated in MISSION.md, is now qualified in both places against the project file's actual disagreement.

Two dead-code findings came out of verifying rather than trusting the docs, both filed separately rather than fixed here. `initDatabase()` is commented out at `backend/src/index.ts:132`, but `backend/src/db/database.ts` opens `healthyflow.db` at import time, so every boot still creates a SQLite file nothing reads — and `sqlite3` remains a dependency of both package manifests. Separately, all credit purchase CTAs in Settings are gated behind `!isNativeApp`, so the iOS app currently offers no path to more credits at all; that is correct given no StoreKit exists, but it is a launch constraint worth stating plainly.

---

### 2026-08-16 15:19 — `worktree-ios-launch-mission`

Audited the root documentation against the source and corrected what the code contradicted. CONTEXT.md carried a live definition of BYOK — a client-side key-passing pattern with zero references anywhere in `src/` and flatly denied by CLAUDE.md — which is now deleted and replaced by a Server-keyed entry that retires the term. The same doc had no vocabulary at all for the day contract's most distinctive concepts, so Daily Plan reference, Capacity, Planning window, Transition buffer, Focus (attention), Next obligation and Module read status are now defined, along with an explicit disambiguation between Focus (attention) and a Work Focus block, which had been sharing a word and nothing else.

FEATURES.md claimed the product was PWA-only and that no Projects view existed; both were false. It now documents the Capacitor iOS app on TestFlight with its widget, native Apple and Google sign-in and server-controlled version gate, carries a Work section, lists Work in the navigation table, and records that the mobile dock holds only Today and Talk. Public signup slots were corrected from a claimed default of 0 to the schema's 10, and the file now states that `planningWindow` defaults to null, so the Capacity panel does not render for a new account at all. CLAUDE.md gained iOS in the stack and `day-summary-schema.ts` in its deep-modules list.

Verifying rather than trusting the docs turned up a genuine defect on the side: the iOS app target declares `IPHONEOS_DEPLOYMENT_TARGET` as 15.0 in one build configuration and 17.0 in the other while the widget is 17.0 in both, so Debug and Release can build against different OS floors. MISSION.md's claim of "iOS 17" does not match the project file. That is filed separately and deliberately left unfixed here. One framing edit — CONTEXT.md's opening description of the product — was identified and held back pending a separate decision.

---

### 2026-08-04 15:38 — `codex/phase-5-talk-runtime`

Today now identifies a Project-linked Task with its Project badge instead of the generic category, making the relationship between a canonical Task and its separate Focus block visible without merging their records. The canonical day response carries the Project id, name, and color for scheduled, completed, and carried-forward Tasks, with the category retained as the fallback for unassigned Tasks. Verification passed the production build, both typechecks, and 41 focused backend tests.

---

### 2026-08-04 15:30 — `codex/phase-5-talk-runtime`

Corrected the Phase 4 capability inventory by registering the missing Project-scoped `add_work_task` write through the existing Work module. The capability previews the proposed Task, preserves its target relationship, and inherits the shared confirmation, ownership, idempotency, and audit contract; the generated inventory now contains 43 capabilities. Verification passed the two targeted registry/write suites with 20 tests and the backend typecheck, without database writes; exposing this capability to Talk remains a Phase 6 workflow decision.

---

### 2026-08-04 14:40 — `codex/phase-5-talk-runtime`

Closed Phase 5 with a narrow server-keyed Talk tracer over the real capability registry: Work now enters a persisted focused-work workflow, the bounded Agents SDK runtime receives the current local time, and deterministic Daily Plan validation blocks known collisions while treating preferences and missing Calendar data as advisory. Drafts remain app-owned and explicitly confirmed, with stale-data revalidation and exactly-once Focus block recovery covered through injected tests rather than writes to hosted user data. Verification passed 66 targeted backend tests, 76 frontend tests, and both typechecks; the roadmap now advances to Phase 6.

---

### 2026-08-03 19:22 — `main`

Fixed the Phase 4 Vite development black screen by restoring the frontend/backend dependency boundary: Achievement and Workout Zod contracts now live in pure contract modules, while their deep services continue to own database behavior and re-export the contracts for compatibility. A real Chromium/Vite startup regression now proves browser imports do not reach the server-only logger and its Node environment, and frontend CI installs Chromium so that safeguard runs on a clean worker. Verification is green across 76 frontend tests, 68 backend suites with 568 tests, both typechecks, the production build, and lint with zero errors and 29 pre-existing warnings.

---

### 2026-08-03 18:40 — `main`

Closed Phase 4 after explicit user approval and advanced the delivery roadmap to Phase 5. The approved implementation is on `origin/main` at `a5b615a`; HealthyFlow recorded a 92-minute Focus review and Work session with the pushed commit, 568-test suite, typechecks, lint, and generated inventory as evidence, completed the referenced Phase 4 Task, and set the Project’s next valuable step to the narrow evaluated runtime tracer bullet required by Phase 5.

---

### 2026-08-03 18:33 — `main`

Phase 4 gives Talk a bounded, Zod-backed inventory of 42 capabilities across Calendar/Daily Plan, Work, Nutrition, Workouts, Habits, Progress, and Tasks, with explicit read, proposal, write, and outcome semantics. The shared internal/MCP definition interface now derives identity and risk, applies confirmation, ownership, idempotency, audit, scope, and typed-error policy uniformly, keeps the 22 newly registered capabilities outside the production runtime until Phase 5, and leaves deterministic placement validation with the Daily Plan module that owns it. A standalone searchable HTML artifact makes the inventory and its input/output contracts inspectable, and the result is green across 568 backend tests, both typechecks, lint with no errors, and browser verification.

---

### 2026-08-03 16:50 — `main`

Phase 3 turns Today into a typed Daily Plan that references Calendar events and transitions, Work Focus blocks, Tasks, Habit instances, Meal and Workout plans, and module-owned actual records without copying or cross-mutating them. Today now makes planned versus actual state explicit, surfaces Progress targets, schedules reusable Workout plans through an ownership-checked database reference, and defaults new Focus blocks to the current time; the Supabase migration has been applied and the throwaway prototype is retired. The shared Claude skill harness and current responsive baselines are included with the workspace, and the result is green across lint, both production builds, 554 backend tests, 75 frontend unit tests, and targeted responsive/accessibility Playwright coverage.

---

### 2026-08-03 16:05 — `main`

Ran the Today Playwright suite against the Phase 2 work and it caught a real bug the type checker could not. The hour slot decides compaction through a different predicate than the one that sizes it, and only the sizing one had been taught about Focus blocks — so an hour holding only a Focus block collapsed to the 28px empty height and its 72px row spilled into the next hour, landing underneath the now-marker and making Start unclickable for anyone viewing an earlier block. Measuring the two bounding boxes is what settled it as a defect rather than a flaky click. Both new specs now pass, and the exit scenario runs end to end.

Seven `today-workspace` screenshot tests still fail. They were verified against a worktree at the previous commit and fail identically there, so they are pre-existing baseline drift and are deliberately left alone rather than folded into this change. Phase 2 is marked complete and Phase 3 is now the current phase.

---

### 2026-08-03 15:20 — `main`

Phase 2 of the Work delivery plan: Focus blocks are now first-class rows on Today. Work gained a day-scoped read (`Work.listDayFocusBlocks`) that denormalises Project and Task context and resolves each block's hour slot server-side, and that arrives on Today through a new top-level `work` key on DaySummary — added with `.default()`, so no fixture or `version` bump was needed. Today renders the same record Work owns and keeps no copy of it: the row links to its Project, Start opens a full-screen focus overlay whose timer is derived from the persisted `startedAt`, Esc minimizes without ending the block, and finishing opens the Work review as a sheet. The review form and elapsed-timer were extracted out of FocusBlockCard so Work and Today cannot drift into two implementations.

Deleting a Focus block did not exist at all and now does, on both surfaces. The rule came from the schema rather than taste: `work_sessions.focus_block_id` is ON DELETE RESTRICT, so a block that produced a Work session is history and is refused with a 409; an in-flight block must be canceled first. Non-interference is pinned by tests rather than argued — focus rows never take a drag index, and a regression test asserts carry-forward cannot see a Focus block. The throwaway prototype that settled the design is deleted. Backend suite is 548 green; the two new Playwright specs are written but unrun, because port 3001 was held by a running dev backend.

---

### 2026-08-03 13:45 — `claude/healthyflow-work-impl-bd4185`

Committed the Work module, which had been sitting as one 3,600-line uncommitted blob, as eight ordered commits: local-migration tooling, the two schema migrations, the Work vocabulary, the projectId fix, the backend service, the Work page, and the Talk handoff. The schema arrived in two parts on purpose — the first slice stored a single overwritable `focus_block` JSON object per Project whose time was a display label, so a follow-up migration promotes Focus blocks and Work reviews to real tables and makes review, session, confirmed updates, and block completion one transaction. The first migration is superseded rather than rewritten because it is already in migration history; ADR-0007 records that. One fix in the set is not Work-specific: `POST /api/tasks` has been silently dropping the `projectId` the client has sent since Projects shipped, and now persists it behind an ownership check. The branch was fast-forwarded onto main first, and nothing has been pushed or merged.

---

### 2026-08-03 13:32 — `main`

Committed the two Work design documents to main after all: the Talk-orchestration-and-Work design target, which fixes Talk as the coordinator and each module as the source of truth for its own records, and the six-phase delivery plan built on it. Holding them on the worktree branch would have kept the reasoning invisible to anything else based on main, and they describe intent rather than code, so they carry no merge cost. The implementation they govern still lives in the `healthyflow-work-impl` worktree.

---

### 2026-08-03 13:25 — `main`

Split a mixed working tree into shippable work and moved the rest out of the way. The keeper is a soft update nudge for iOS: the native version gate now resolves to three outcomes instead of two, so a client at or above `IOS_MINIMUM_VERSION` but below `IOS_LATEST_VERSION` keeps running and shows a dismissible App Store banner rather than being either blocked or silently left behind. Dismissal is keyed per released version, so raising `IOS_LATEST_VERSION` asks again while a repeat dismissal of the same release stays hidden; setting the two equal turns the nudge off without disabling the gate. `native_update_opened` gained a `trigger` field and renamed `minimum_version` to `target_version` to tell the blocking gate apart from the nudge — a breaking change for any existing query on that event. Separately, a dev-only Work prototype that had leaked into `App.tsx`, `Layout.tsx`, and `AssistantPage.tsx` was reverted, since the real Work module lives in the `healthyflow-work-impl` worktree; its design spec and delivery plan stay untracked to land with that branch. Production env backups are now gitignored by pattern.

---

### 2026-08-02 17:45 — `main`

Added a build-time guard so an iOS build fails fast when its Supabase Auth configuration is missing, rather than shipping a bundle whose sign-in is silently unconfigured. `build:ios` now runs `verify:ios-auth-env` first, which checks `VITE_SUPABASE_URL` and a publishable/anon key are present and exits non-zero with the missing names. This closes the loop on the failure that opened today's session, where the committed `.env.production` had lost those vars and Google sign-in reported itself unconfigured only at runtime on device.

---

### 2026-08-02 17:20 — `feat/native-google-signin`

Replaced Google sign-in on iOS with a native in-process flow, so it now works the same way Apple already did. Device testing showed the old flow reaching Google and returning a valid code, then hanging on "Finishing…" forever with no network request: the deep-link callback lands as a history push into an already-mounted React tree, so none of the mount-time triggers the web flow relies on ever fire, and the spinner was a leftover from starting the flow rather than a sign of work in progress. A new `GoogleSignInPlugin` (Swift, `ASWebAuthenticationSession` + PKCE, no third-party SDK) obtains the ID token natively and hands it to `signInWithIdToken`, deleting the callback path entirely on iOS. The backend contract from ADR-0005 is unchanged and the web flow is untouched. The last defect was a one-line omission that cost most of the debugging time: plugins in the app target are registered explicitly in `capacitorDidLoad`, not auto-discovered, so the Swift compiled cleanly into the binary while the bridge never exposed it and every call rejected with `UNIMPLEMENTED` before any OAuth code ran. Google and Apple sign-in are both confirmed working on device. Reasoning recorded in ADR-0006.

---

### 2026-08-02 16:40 — `main`

Fixed native Google sign-in, which was failing in the iOS app despite being enabled in Supabase: the committed `.env.production` was missing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, so builds outside the Netlify web deploy (like local iOS builds) never had Supabase Auth configured client-side. Committed the fix that was already sitting uncommitted locally. Also fixed two related Supabase Auth dashboard config issues found in the same investigation: the Google provider's native redirect URL (`healthyflow://oauth/callback`) was missing from the Redirect URLs allowlist, and Apple Sign In was disabled with an invalid Client ID and a malformed (non-JWT) secret key — both corrected in the dashboard directly. Verified end-to-end in the iOS Simulator: Google sign-in now correctly reaches the real Google account-chooser screen through Supabase's OAuth proxy.

---

### 2026-07-30 17:12 — `main`

Prepared HealthyFlow’s next iOS release by advancing both the app and Today widget to marketing version 1.0.1 and build 2. The frontend, backend, Capacitor sync, simulator Release build, and signed device archive all passed; Apple accepted the upload into App Store Connect without warnings or errors and is processing the build.

---

### 2026-07-30 16:56 — `claude/landing-page-screenshot-script-ad32b9`

The landing page now shows the product in whichever theme the visitor is reading it in. `capture-landing-shots.mjs` shoots every surface twice, once per app theme, keeping the dark set on its existing filenames and suffixing the light set `-light`; `landing.html` carries both variants per screenshot and hides the mismatched one in CSS, so the swap follows the day/night toggle rather than just the OS preference. Both variants are lazy, which stops the hidden one being fetched, and the pre-paint script preloads the theme-correct hero to buy back the priority that costs. This commit adds the 18 new light assets and refreshes the 18 dark ones, which now carry today's seeded demo data.

---

### 2026-07-30 16:32 — `main`

Committed the Siri Capture planning artifacts that were sitting untracked in the working copy: the mission brief, the curated Apple App Intents resource list, and the first lesson page on the capture data flow. These were written during a separate planning session and were at risk of being lost or swept into an unrelated deploy upload; they now live on main alongside the iOS release. No application code changed.

---

### 2026-07-30 15:56 — `main`

Integrated HealthyFlow's iOS App Store readiness work with the latest ChatGPT MCP OAuth registration changes already on the remote main branch. Both streams are now preserved together without overwriting either release path, leaving main ready to publish.

---

### 2026-07-30 15:43 — `codex/ios-capacitor`

Completed HealthyFlow’s App Store readiness layer with native Sign in with Apple, an opaque validated app icon, and a server-controlled minimum-version gate. The iOS shell now owns safe areas consistently across authenticated and public screens, with a compact header and native-style bottom navigation that keeps legal links in the drawer. Frontend, backend, Capacitor, and Xcode simulator validation all pass; production enablement now only requires the documented Apple Developer, Supabase provider, migration, and release configuration.

---

### 2026-07-30 15:23 — `claude/healthyflow-mcp-connection-7dba60`

Traced the ChatGPT connector popup that stalls on `about:blank` to its real cause, which neither the CORS nor the bootstrap-format fix addressed: the authorization server advertised only Client ID Metadata Documents and had no `registration_endpoint`, so ChatGPT — which uses RFC 7591 dynamic registration — could never obtain a `client_id` to build an authorization URL with, and left the popup it had already opened unnavigated. The CIMD fallback could not have worked either, since Cloudflare answers the server-side fetch of a chatgpt.com client document with a 403. Added a durable `mcp_oauth_clients` table and a public-client-only `POST /oauth/register`, made client resolution consult the database before any outbound fetch, and stopped the protected-resource metadata being served under paths that are not the resource it declares. 494 backend tests, backend typecheck, and both builds pass; going live still needs the migration applied and `MCP_PUBLIC_URL` repointed at `/mcp` on Railway.

---

### 2026-07-30 14:45 — `main`

Made the MCP transport accept ChatGPT's connector bootstrap format, which sends JSON as `application/octet-stream` while advertising a generic `Accept` header. Added a stable `/mcp/chatgpt` resource alias and matching OAuth discovery metadata so ChatGPT can refresh connector metadata without changing the existing MCP endpoint; regression coverage now exercises the exact request shape observed in production.

---

### 2026-07-30 14:25 — `codex/ios-capacitor`

Established HealthyFlow as a working Capacitor iOS 17 app while keeping the React product and web deployment intact. The native boundary now covers deep links, Google OAuth handoff, APNs, notification permissions, haptics, sharing, platform styling, and a privacy-safe WidgetKit Today widget backed by the canonical DaySummary. The complete frontend and backend gates pass, the app and widget build and run in the iPhone simulator, and the remaining Apple signing, Sign in with Apple, StoreKit, and physical-device steps are documented for TestFlight.

---

### 2026-07-30 13:52 — `main`

Fixed the ChatGPT connection popup stalling on `about:blank`: the browser-origin OAuth bootstrap was being rejected by HealthyFlow's global CORS policy before it reached discovery or authorization. ChatGPT browser access is now allowed only for MCP, OAuth, and OAuth discovery paths while general HealthyFlow APIs retain their existing origin restrictions; the new regression passes with all 489 backend tests.

---

### 2026-07-30 13:29 — `main`

Production protocol verification exposed that Railway's Node 18 default lacks the web-crypto runtime required by the current MCP SDK, causing unauthenticated tool calls to fail before returning their OAuth challenge. Raised the repository runtime floor to Node 20 and pinned Railway's build to Node 22 so the deployed MCP server uses a supported runtime.

---

### 2026-07-30 13:23 — `main`

Added a ChatGPT-ready OAuth 2.1 layer to HealthyFlow's MCP endpoint with CIMD client discovery, PKCE, audience-bound access tokens, rotating refresh grants, revocation, and explicit tool scopes while retaining PAT access for developer clients. Added the authenticated consent route, connection management in Settings, durable Supabase grant storage, deployment configuration, and regression coverage; 488 backend tests, backend typechecking, and the production frontend build pass. The implementation is ready for its additive production migration and coordinated Railway/Netlify rollout.

---

### 2026-07-30 13:30 — `claude/repalette-foundations`

Swapped the app's foundation tokens to the design system's warm-neutral palette: surfaces, text, borders, interactive and status, in both themes, plus the two values the design system flagged as failing AA. Split accent into fill (`--action-primary`) and glyph (`--action-accent`) roles, which is what lets accent text clear 4.5:1 over its own wash at every tint step. Also converted nine `text-white` labels sitting on coloured fills to `text-on-action`, without which dark-theme chips would have rendered white-on-mint at about 1.5:1. Category and week hues are deliberately untouched and will clash until the item-mark pass lands.

---

### 2026-07-30 12:40 — `claude/semantic-token-refactor`

Converted every raw Tailwind palette class in the app to a semantic token, the prerequisite for any repalette: 174 occurrences across 13 files now read from the theme system instead of naming a hue. The biggest win is the light theme, where admin surfaces were previously unreadable — Token Manager's `text-cyan-300` on a near-white ground measured about 1.4:1 and is now roughly 8:1. Also deduplicated the AI analyzer's private category map, which only covered four of the six categories and silently rendered grocery and nutrition as personal. Six hover states that the mechanical mapping had flattened were repaired by hand.

---

### 2026-07-30 10:55 — `claude/healthyflow-landing-page-8c5224`

Rebuilt `public/landing.html` to the "HealthyFlow Landing" Claude Design comp: warm paper canvas with a full night palette and a persisted day/night toggle, Space Grotesk display type, and an editorial layout (step cards, alternating showcase rows with hairline numbered lists, bordered AI panel, hairline capability grid, dark closing band and footer). The existing product screenshots were kept rather than regenerated — the mobile Today shot sits in the design's phone bezel and the Talk/Health/Workouts desktop shots sit in a landscape variant of it. All acquisition plumbing carried over unchanged (PostHog, signup-status offer swapping, CTA placements, waitlist POST, demo-CTA UTM forwarding), verified in-browser at 1280px and 375px in both themes with no console errors and no horizontal overflow.
### 2026-07-30 11:25 — `claude/app-mark-brand-surfaces`

Carried the new "2a Core" mark from the app icon into the product itself (option B: brand surfaces adopt the design palette, the rest of the app keeps its teal). Added `src/components/AppMark.tsx` as the single source for the in-app mark, driven by new `--mark-*` tokens that flip Ink/Paper with the theme, and pointed the three Layout headers, the login card, and the demo header at it. The pre-React splash in index.html carries a hand-duplicated copy since the bundle's tokens load too late, and admin.html finally has a favicon. The lucide `Brain` icon stays where it means "AI feature" — only the five brand placements changed.

---

### 2026-07-30 10:35 — `claude/healthyflow-icon-theme-variants-62d802`

Replaced the app icon with the "2a Core" mark from the Claude Design project — a day arc enclosing a centred now-dot — in two theme variants: Paper on light, Ink on dark. Both ship as hand-written SVG sources plus a full rasterized PNG set (regenerable via `scripts/generate-icons.sh`), with the dark variant keeping the canonical filenames since the app defaults to dark. Favicons switch on `prefers-color-scheme` in both the app shell and the landing page, and the service worker cache was bumped to v7 so installed PWAs don't keep serving the old mark from unchanged paths. The splash-screen logo in index.html still carries the old cyan clipboard mark and is left for a follow-up.

---

### 2026-07-29 14:59 — `codex/waitlist-seat-accounting`

Closed the signup-capacity accounting gap: public signups now own an explicit seat, failed account creation returns the reservation, and future account deletion removes matching waitlist/invite state while releasing only seats actually consumed through public registration. The admin surface can reconcile both claimed and total seats, validates impossible combinations, and previews waitlist cleanup plus seat release before permanent deletion. Existing orphaned registered waitlist rows are repaired by the migration, and the change passes 482 backend tests, 50 frontend tests, both production builds, lint, and a mocked browser walkthrough.

---

### 2026-07-29 14:31 — `codex/reuse-e2e-user`

Reworked the browser harness around one pre-provisioned, protected `e2e@test.healthyflow.local` identity: setup now fails if it is missing, onboarding resets it in place, and test-mode auth routes refuse every account-creation path. Signup is covered through an intercepted happy-path contract plus a real non-persistence probe, while isolated local servers prevent E2E from inheriting production API URLs or reusing an unsafe backend. The sole durable fixture was provisioned once outside automation; focused browser coverage, 474 backend tests, 50 frontend unit tests, typechecks, lint, and the production build pass.

---

### 2026-07-29 13:45 — `codex/admin-user-management`

Turned the existing Token Manager into a safe account-control surface with explicit test/live classification, immediate account disabling, search and filters, batch actions, deletion previews, typed confirmation, protected administrator/demo accounts, subscription blockers, and a durable audit trail. Authentication now enforces disabled or deleted status across active API sessions as well as password and Google sign-in, while the destructive path removes linked Supabase Auth identities and reports partial cleanup failures. The additive production migration is applied, no real users were deleted, and the flow passes the full frontend/backend suites plus mocked desktop and mobile browser walkthroughs.

---

### 2026-07-29 12:44 — `main`

Repaired the persona demos and guided tours against the current product UI: stale selectors and routes now point at live surfaces, disabled Week steps are filtered, collapsed rollover Items are revealed before use, and route transitions no longer skip steps. Demo Talk is deterministic without consuming credits, access guidance matches the invitation/waitlist flow, stale seed helpers and demo copy are corrected, and the orphaned legacy video is removed. The updated tours pass frontend and backend typechecks, 47 unit tests, lint with no errors, a production build, and mocked desktop/mobile walkthroughs.

---

### 2026-07-29 11:59 — `codex/google-signin-production`

Added production-grade Google sign-in through Supabase Auth while preserving HealthyFlow’s existing JWT sessions, invitation/public-slot gate, account linking, first-100 credit grant, and onboarding rules. OAuth callback recovery, invitation expiry and idempotent redemption, Google-account deletion, inline failure states, deployment documentation, and responsive login coverage now travel together as one flow. The production schema and public Netlify configuration are in place; enabling the provider awaits the Google Cloud callback URI being saved.

---

### 2026-07-29 11:08 — `codex/login-page-hierarchy`

Reworked the authentication entry into a state-aware flow: returning users get a blank, focused sign-in form; invite links open directly into account creation; and the waitlist stays secondary until requested. Removed exposed demo credentials in favor of one guided-demo action, added inline validation and password visibility controls, and kept the full primary experience within a mobile viewport. Updated the auth coverage and all six login visual baselines across Midnight, White, desktop, compact, and mobile.

---

### 2026-07-29 00:20 — `claude/suspicious-lewin-befb56`

Closed the loop on landing-page screenshots being real product shots rather than whatever the capturing developer's environment happened to render. Vite inlines `VITE_*` at build time, so the capture had twice published features no production user could reach — Week view, then Daily Signals, whose "3 signals" row was live in the committed hero image. `scripts/capture-landing-shots.mjs` now starts its own Vite with every flag in `src/featureFlags.ts` blanked, pins the theme to Midnight server-side (the shared demo account had drifted to White, which would have put light screenshots on a dark page), and refuses to write if a flagged-off surface renders anyway. Also fixed a live pricing defect: the sold-out card read "$19 / month" and "$9 locked in" at once, because `.plan li { display: flex }` silently beat the UA's `[hidden] { display: none }`.

---

### 2026-07-28 20:11 — `codex/launch-pricing`

Made the landing page’s image and icon references relative so its fresh product captures load both in production and when `public/landing.html` is opened directly for review. Confirmed all 24 referenced assets exist and the production build succeeds; the deployed screenshot files already matched the current local captures byte for byte.

---

### 2026-07-28 19:29 — `codex/launch-pricing`

Established the launch commercial model across signup, credits, pricing surfaces, acquisition messaging, and funnel analytics: the first 100 real accounts receive 250 onboarding credits and retain the $9 founding plan while continuously subscribed, followed by 50-credit onboarding and the $19 standard plan. Added an atomic, idempotent Supabase grant ledger plus the $5 / 250-credit non-expiring top-up contract, and applied the migration to production before the backend rollout. The rebased release passes 434 backend tests, 43 frontend tests, production builds, typechecks, and lint without errors.

---

### 2026-07-28 18:07 — `codex/hide-daily-signals`

Daily Signals are now hidden from Today by default behind an opt-in release flag while the product behavior matures. The existing implementation remains intact, and browser tests explicitly enable the flag so its review, recovery, and safety coverage stays active for eventual re-release.

---

### 2026-07-28 17:39 — `codex/hide-disabled-capacity`

Today no longer presents an unavailable-capacity warning when daily capacity calculation is switched off. The decision band collapses cleanly around Focus and Next obligation, while enabled complete, partial, and unavailable capacity states remain honest and visible. Focused browser coverage now distinguishes the disabled presentation from genuine enabled-source failures.

---

### 2026-07-28 17:15 — `codex/137-mobile-day-swipe`

Added a mobile-only Today gesture that moves left or right between adjacent days while preserving the existing visible date controls and navigation contract. Deliberate swipes follow the finger with restrained directional feedback, while vertical scroll, interactive controls, Item dragging, modals, and reduced-motion preferences remain protected. Focused unit and browser regressions cover successful navigation, rejected gestures, and the existing touch-drag workflow.

---

### 2026-07-28 15:40 — `claude/app-launch-readiness-164e9d`

Fixed the WCAG AA contrast failures the e2e suite had surfaced. The cause was `accent` doing double duty as both the text colour and the tint behind it: at reduced opacity the two converge, so `text-accent/70` on `bg-accent/15` measured 4.07:1 in midnight and 2.67:1 in white. Midnight needed no token change at all — dropping the opacity modifiers took its worst row from 4.07 to 6.52. White needed the accent darkened as well (8 112 140 to 6 90 112), taking its worst row from 2.67 to 5.67. The Axe dialog check now runs in both themes, which is what let seven white-theme violations ship in the first place, and it immediately caught a second unrelated one: `--text-muted` at 4.38:1, nudged to 5.01:1 without flattening the muted/secondary distinction.

---

### 2026-07-28 15:05 — `claude/app-launch-readiness-164e9d`

Took the e2e suite from 24 failures to 1, and the one that remains is a real bug the suite should be reporting. Most of the 24 were the suite lying rather than the app breaking: specs pinned to copy and CSS #151 had changed, two `getByRole('status')` locators that matched several live regions at once, and — the interesting one — `/test/reset` clearing only tasks and workouts. Once the timeline became the day's record, stray Calorie entries from the health specs started occupying hours that items-lifecycle expected to be empty, so specs in one subject were silently breaking specs in another. Reset now clears every table that can put a row on a day. The subject split had also quietly orphaned all 68 visual baselines, because Playwright bakes the project name into snapshot filenames; snapshots are now project-independent and carry a measured 0.015 diff threshold so they stop failing on a different Mac. The last failure is a genuine WCAG AA contrast violation in the calorie quick-insert dialog (4.06:1 against 4.5:1 required) that #151 shipped under the banner of a "contrast-safe" visual system — and it had been passing only because leftover fixture data happened to render the offending buttons.

---

### 2026-07-28 14:20 — `claude/app-launch-readiness-164e9d`

Split the e2e suite into nine subject projects so one area can be checked without waiting 6.5 minutes for the whole run — `--project=talk` reports in 37s, `--project=habits` in 49s. The subjects are a strict partition rather than overlapping views: an earlier overlapping draft turned a default run into 262 tests instead of 114, because specs matched several projects at once. `src/utils/e2eProjectPartition.test.ts` now fails the unit suite if a spec is added with no subject (it would silently stop running) or listed under two, and the guard was verified by actually introducing an unregistered spec. Also recorded the real state of the suite: 114 ran, 90 passed, 24 failed — not the 60 we were working from, which was almost certainly the reuseExistingServer cascade.

---

### 2026-07-28 13:20 — `claude/app-launch-readiness-164e9d`

Merged main (the #151 responsive visual system) into the launch-readiness branch and recaptured the landing screenshots against it. #151 rewrote Layout, DayTimeline and TaskCard, so the shots taken an hour earlier were already stale — the new tagline, the retired sidebar AI box and the capitalised category chips all show now. Re-verified the FEATURES.md claims that could have been invalidated by the merge: the settings schema still matches, there are still no Supabase realtime channels, and the service worker still returns 503 for API calls. Week View remains flag-off in production, so the landing page correctly still says nothing about it.

---

### 2026-07-28 13:01 — `codex/151-responsive-visual-system`

Normalized HealthyFlow around a semantic, contrast-safe visual system shared by Midnight and White themes across Login, Today, Talk, Add, Health, Nutrition, Workouts, Progress, and Settings. Shared category presentation now follows the canonical six-value Zod contract, completion feedback is quiet and undoable, text selection and reduced-motion behavior are preserved, and the hidden Week View remains untouched. Responsive baselines cover every visible primary surface at desktop, compact, and mobile widths, with focused accessibility and interaction regressions alongside them.

---

### 2026-07-28 12:15 — `claude/app-launch-readiness-164e9d`

Realigned the marketing page and the docs with the app as it now is. The landing page had drifted badly: it sold Week View (flag-off for every production user), showed Calories and Workouts as separate destinations that the Health workspace replaced, and pointed four "Start Free" CTAs at a login form with no Create-account tab, because public signup slots default to 0. The waitlist is now the shipped default and JS upgrades it to "Start Free" only when slots are genuinely open — the fail direction is inverted, matching LoginPage. Every screenshot was stale (old flat sidebar), so regeneration is now scripted rather than manual via `scripts/capture-landing-shots.mjs`. On the docs side, PRD.md was archived — its v1 sprint shipped, so it read as false — and FEATURES.md was rewritten as a verified inventory that names what is behind a flag and what is not built at all, dropping claims the code contradicts (no Supabase realtime, no offline data).

---

### 2026-07-28 11:05 — `codex/timeline-day-record`

Turned the Today timeline into the day's record rather than only its plan: every data type now earns a place on the clock, and the Anytime backlog holds only what still needs a decision. `/day-summary` grew `resolvedTime`, per-chunk Habit progress times, `loggedTime` on dateless records, and a `supporting.progress` block for Achievements — all resolved against the user's timezone server-side. Partial Habits stay in the backlog while their progress chunks appear on the clock, which is the case that drove the design. Ships alongside the module-presentation work (#150) that had been sitting uncommitted, since the timeline imports it.

---

### 2026-07-27 16:49 — `codex/150-health-navigation`

Grouped Nutrition, Workouts, and Progress beneath a new Health overview and shared local navigation while preserving every existing deep link. This release also carries the approved mobile landing-header fix, hides Week View behind an opt-in flag, and refreshes responsive visual and workflow coverage for the new hierarchy.

---

### 2026-07-27 16:10 — `codex/149-health-workflow`

Reworked the health tools into a coherent selected-day workflow: Calories now leads with neutral Nutrition, Macros, Weight, Workout, and Progress status, while Workouts separates Plan, Session, and History into explicit URL-backed modes. Shared date navigation, visible canonical units, touch-safe accessible actions, reversible record deletion, readable progress/history, and desktop-to-mobile regression coverage leave issue #149 ready to ship.

---

### 2026-07-26 18:14 — `main`

Grounded AI date interpretation in the client’s local calendar by adding weekday-labelled today, yesterday, tomorrow, and a concrete seven-day lookup with Hebrew weekday rules. Both assistant chat and parse-tasks now share the context, parse-tasks honors `X-Client-Time-Zone`, and the reported Jerusalem repro is pinned alongside the passing AI suite and backend typecheck.

---

### 2026-07-26 17:38 — `codex/hotfix-netlify-root`

Fixed the production blank screen introduced by the `/app` routing move: Netlify was file-shadowing the intended root landing-page rewrite with `dist/index.html`, whose router correctly refuses to render outside `/app`. The root rewrite now explicitly overrides static-file shadowing, and a red/green routing regression is included in the frontend CI unit gate so the deployment contract cannot silently regress again.

---

### 2026-07-26 17:10 — `claude/product-launch-planning-fa4388`

Closed out Workstream B's verification by standing up a full local Supabase stack rather than waiting on production access. Starting it applied the waitlist migration in sequence with the other 32, proving it composes; the backend then ran against it and the whole loop passed 27 of 27 assertions over real HTTP — join, idempotent re-join, admin listing and invite issuance, invite redemption that leaves the public slot counter untouched, invite reuse refused, public signup claiming exactly one slot, and a closed gate returning 403 without creating a user. All three LoginPage states were then driven in the browser against that live backend: the waitlist form wrote a real row tagged `source=login-page`, the open state showed "3 spots left", and an invite link opened the signup form even with zero slots, completing to a registered row and a redeemed invite. The stack was torn down and `.env` restored. Only the production migration remains, and that is the owner's to run.

---

### 2026-07-26 16:15 — `claude/product-launch-planning-fa4388`

Verified Workstream B's schema against a real Postgres 17 rather than leaving it on trust. The migration applies cleanly, and both concurrency guarantees hold under genuine contention: 20 simultaneous claims against a single slot granted exactly one, 50 against ten granted exactly ten, and fifteen simultaneous redemptions of one invite returned a row exactly once. Every check constraint fires as intended — negative slot counts, bogus statuses, duplicate emails, and a second settings row are all rejected — and the cascade rules behave (deleting a waitlist row removes its invites; deleting a redeeming user leaves the invite with a null redeemer). The container was disposable and has been removed. What remains unverified is the HTTP loop against real Supabase, which needs the migration applied to production — an owner action.

---

### 2026-07-26 15:40 — `claude/product-launch-planning-fa4388`

Finished Workstream E: the landing page's images were ~1.9 MB of 2880px-wide JPEGs on a page whose ad traffic will be mostly mobile. All six are now served as WebP through `<picture>`, with 800w/1400w variants and accurate `sizes` for the 520px media columns, and JPEG kept as the fallback. A desktop visit at DPR 2 now pulls roughly 200 KB of imagery and a phone roughly 110 KB. The mobile screenshot is natively 780px, so it deliberately has no resized variants — generating them produced upscales larger than the original. Verified in the browser: every loaded image resolves to WebP, and the showcase correctly selects the 1400w candidate.

---

### 2026-07-26 15:05 — `claude/product-launch-planning-fa4388`

Landed Workstreams D and F: the landing page now tells the committed day thesis instead of a generic AI story. The hero leads with "Your whole day, in one place", the three steps became say-it / it-lands-on-the-day / tomorrow-picks-it-up so rollover is a headline rather than a subclause, and AI is reframed as the fastest way in rather than the identity. Pricing replaces the $1 Launch Plan with a $9 Founding Member card anchored against $19, and the feature grid was run through the day-razor — Health, Planning, and Analytics out; Rollover, Training, and Week view in. Also fixed the relative `og:image` that would have left every shared ad link without a preview, and added the missing Twitter card tags. `MARKETING.md` carries a superseding note for the old $1/$2 model.

---

### 2026-07-26 14:20 — `claude/product-launch-planning-fa4388`

Built Workstream B: waitlist-centred access control. Registration is now closed by default with two doors — a single-use invite bound to a waitlist row, and a capped public opening that starts at 10 slots — and the slot claim is a Postgres function so two concurrent signups cannot both take the last one. Adds the `waitlist`/`invites`/`signup_access` schema, a `Waitlist` deep module, public join and signup-status endpoints, admin management routes, a three-state LoginPage, an admin WaitlistPanel, and a landing-page waitlist form with availability-aware CTAs. The full backend suite passes at 387 tests across 53 suites. **The migration has not been applied to Supabase** — until it is, `signup-status` errors and the UI fails closed (Create account hidden, login unaffected), which is why both `onboarding` e2e specs currently fail.

---

### 2026-07-26 12:55 — `claude/product-launch-planning-fa4388`

Landed Workstream A of the launch plan: the marketing page now serves at `/` and the React app moved to `/app` behind a router basename, so incoming ad traffic no longer hits a login form. Every path the app previously owned redirects to its `/app` equivalent, and the PWA manifest, service worker app shell, and backend push-notification targets moved with it — the service worker would otherwise have cached the landing page as its offline app shell. The Playwright suite's 79 navigations and 26 URL assertions were migrated, the production build is green, and the funnel was verified end to end in the browser. The suite was also made port-configurable, because specs hard-coded `localhost:3001` and a worktree run would silently test whichever checkout owned that port. Measured against a baseline built from the merge base, the suite went 14→15 failures with every differing spec failing on both branches in isolation: pre-existing flake, no regressions from the move.

---

### 2026-07-26 12:30 — `claude/product-launch-planning-fa4388`

Brainstormed and committed the launch-prep design ahead of driving paid ad traffic at the product. The session surfaced that the marketing page is currently orphaned — `netlify.toml` serves the login form at the root and `landing.html` is only reachable via a footer link — so the design leads with moving the landing page to `/` and the app to `/app`. It also specifies waitlist-centred access control (individual invites plus a capped public opening starting at 10 slots), a landing rewrite around the committed day thesis, and $9/mo launch pricing for the first 100. Design only; no implementation yet, and the next step is turning it into GitHub issues on Project 1.
### 2026-07-26 16:42 — `codex/147-closure-fixes`

Closed the two remaining Today review findings for Phase 1: informational Daily Signals now open a fresh, bounded Talk session with a more useful next-step prompt, and a failed binary Habit counts as addressed without being misreported as completed. Today focus, progress, week load, and Daily Signals now share that distinction while historical failures remain misses; repeated chat migration, one-request DaySummary, responsive visual, frontend, and all 380 backend checks are green.

---

### 2026-07-26 14:41 — `codex/165-daily-signals`

Aligned the Today browser fixtures with the full Zod-validated Daily Context response now consumed by the frontend. Both current and previous-contract signal responses are exercised through the same runtime parser, keeping the rollout-safety regression representative of production.

---

### 2026-07-26 14:39 — `codex/165-daily-signals`

Hardened the frontend/backend rollout boundary by Zod-validating Daily Context responses and converting the previous signal contract into explicit informational-only guidance. This keeps deploy previews and staggered production deployments readable without manufacturing an actionable proposal or bypassing the pending-action review path.

---

### 2026-07-26 14:33 — `codex/165-daily-signals`

Completed Phase 1’s Daily Signals slice with Zod-derived informational and actionable contracts, safe rationale/evidence, and exact record/change proposals. Actionable schedule signals now revalidate through the existing pending-action system before an editable Apply or Dismiss, while stale, expired, failed, and canceled paths recover without losing user edits; informational signals remain guidance-only and can hand bounded context to Talk. The production build, all 377 backend tests, and responsive Today interaction, visual, focus, touch-target, and accessibility checks are green across desktop, compact, and mobile widths.

---

### 2026-07-26 14:03 — `codex/164-day-context`

Refined the Workout Day Context after preview feedback by removing the unreachable scheduled Workout Item section and focusing the disclosure on logged Workout sessions. Each logged session now exposes its exercise names and recorded sets, reps, weight, duration, and distance while Achievements remain deliberately out of scope. The responsive Today browser suite and visual baselines are green across desktop, compact, and mobile widths; PR #172 is ready for another preview pass.

---

### 2026-07-26 13:34 — `codex/164-day-context`

Completed Phase 1’s module-aware Day Context with progressively disclosed Habit outcomes and target progress, honest Calorie/macro/Weight states, and an explicit separation between scheduled Workout Items and logged Workout sessions. DaySummary now preserves Weight availability independently when the Calorie-entry source fails, while disabled modules remain absent and missing values never masquerade as zero. Backend composition tests and authenticated responsive visual, interaction, touch-target, focus-restoration, and accessibility regressions cover all three target viewports; issue #164 is ready for preview review.

---

### 2026-07-26 13:00 — `codex/phase1-anytime-drag`

Completed Phase 1’s shared Schedule and Anytime workspace with honest incomplete/duration summaries, date-scoped disclosure, full-width desktop context, and one drag system across responsive regions. Drag capture now expands every compacted hour before measurement, keyboard/mouse/touch flows restore layout and focus, virtual Habit IDs reconcile safely, and failed multi-write moves compensate server state before restoring the original UI. Frontend build, all 364 backend tests, and dense responsive visual, accessibility, persistence, cancellation, materialization, and rollback regressions are green; no database migration is required.

---

### 2026-07-26 12:14 — `codex/phase1-decision-band`

Recomposed Today around a DaySummary-driven decision band that explains Focus, the next obligation, completion, and honest complete/partial/unavailable capacity before planning detail. The schedule now responds to its actual container width, keeps Anytime ahead of the timeline on compact screens, and pairs the wide timeline with restrained module-aware Day Context; Daily Signals are a calm, recoverable row instead of a competing AI card. Dense authenticated visual baselines and focused accessibility, date, Item, Habit, drag, Talk, error, and responsive regressions cover all three target viewports; no database migration is required.

---

### 2026-07-26 11:16 — `codex/phase1-day-summary`

Completed Phase 1’s DaySummary foundation with one versioned Zod contract, a shared canonical Item read path, deterministic attention rules, and honest complete/partial/unavailable capacity derivation. Today now composes its selected day through one request, optional calendar and health failures degrade independently, usable-day settings remain explicitly opt-in, and canonical cache invalidation preserves Item, Habit, Calendar, health, Week, and Talk behavior. Full backend, build, unit, and focused cross-feature browser validation is green; issue #161 is ready for preview review without a database migration.

---

### 2026-07-26 09:53 — `codex/fix-talk-history-save-race`

Fixed the false Talk history-save error caused by browser-history migration and normal autosave issuing duplicate writes for the same conversation. Migration now completes before autosave begins, saves for each conversation are serialized, and focused browser regressions cover both legacy-history startup and slow in-flight saves; issue #167 is ready for preview review.

---

### 2026-07-20 12:14 — `agent/phase1-today-workspace`

Completed Phase 1’s first vertical slice by giving Today and Week one settings-aware week boundary and consistent selected-date language. Today now labels past, present, and future schedules accurately, both seven-day selectors support semantic dates and roving keyboard focus, frequent date controls meet the 44px touch target, and focused unit and browser regressions cover all week starts and shared Sunday/Monday boundaries. Issue #160 is ready for branch-preview review before DaySummary work begins.

---

### 2026-07-19 08:57 — `agent/phase1-today-workspace`

Added the comprehensive HealthyFlow UX/UI review as a durable repository artifact, including the evidence-based findings catalog, quick wins, structural redesign proposals, machine-readable summary, and 39 baseline screenshots across major routes and responsive viewports. This gives Phase 1 a traceable research foundation and preserves the verified pre-redesign interface state for future comparison.

---

### 2026-07-19 08:52 — `design-review`

Completed Phase 0’s reliability and trust foundation across module routing, shared accessibility controls, Week theming, modal and mobile-drawer focus behavior, and account privacy workflows. Portable export and verified deletion now have backend contracts and regression coverage, while the frontend and backend validation suites are green and the six implementation issues are ready for review as one coordinated release.

---

### 2026-07-16 18:14 — `feat/habit-progress`

Refined the target-Habit outcome language from “Not done today” to “Not done yet,” keeping the neutral styling, preserved-progress explanation, and immediate dismissal behavior unchanged. The mobile browser regression now asserts the revised label.

---

### 2026-07-16 18:10 — `feat/habit-progress`

Reworked Habit check-in actions around their actual hierarchy after a research-backed UX review. Target outcomes now appear as neutral, explanatory rows after progress history instead of a fixed green/red submit-like footer; quick amounts are quieter tonal controls, and success color is reserved for the completed state. Binary outcomes use equal neutral choices, while mobile coverage verifies placement, touch size, outcome dismissal, and the absence of success/error styling before a choice.

---

### 2026-07-16 17:48 — `feat/habit-progress`

Clarified the target-Habit completion shortcut by showing the exact progress it will record, such as “Log 50 min & finish,” instead of the submit-like “Complete remaining.” The label updates as progress changes and becomes a disabled Completed state at the target; mobile browser coverage verifies both the changing remainder and footer sizing.

---

### 2026-07-16 17:38 — `feat/habit-progress`

Fixed the compact timed-Habit regression visible on mobile after enlarging touch actions: 30-minute Habit rows now reserve enough height for title, metadata, and outcome, while the 44×44 menu target floats over a 28px layout slot so it no longer steals title width. A 390×844 browser regression verifies a failed timed Habit’s Not done status remains inside its timeline row; ordinary timed Tasks keep their existing geometry.

---

### 2026-07-16 17:12 — `feat/habit-progress`

Completed a 390×844 mobile UX pass for Habit check-ins. The sheet now has a fixed header, independently scrollable progress/history area, and safe-area action footer so Complete remaining and Not done stay fully reachable; Habit card actions are always visible on touch with labeled 44×44 targets. Browser coverage locks down footer visibility and touch-target sizing.

---

### 2026-07-16 16:58 — `feat/habit-progress`

Made terminal Habit check-ins feel immediate on mobile: Done, Not done, and Complete remaining now dismiss the sheet on tap while persistence finishes in the background and retains error reporting. A latency-controlled browser regression delays the API by 1.5 seconds and verifies the sheet still closes within 500 ms, then confirms the saved outcome and correction flow after reopening.

---

### 2026-07-16 16:44 — `feat/habit-progress`

Improved the mobile Habit check-in completion flow so terminal Done, Not done, and Complete remaining actions close the outcome sheet only after the server confirms success. Progress chunks and Clear outcome keep the sheet open, and browser coverage verifies both Done and Not done close while the saved outcome remains available when reopened.

---

### 2026-07-16 16:37 — `feat/habit-progress`

Removed the post-edit refresh requirement from Today by writing the successful Habit edit response directly into the selected-day query cache, including virtual-to-materialized identity changes. Other cached days are invalidated separately, and a browser regression now blocks the follow-up GET to prove Binary-to-Target renders within one second from the PUT response alone.

---

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
