# HealthyFlow: a product decision and 30-day roadmap

Assessment date: 17 October 2026. Proposed execution: 18 October–16 November 2026.

This is a dated recommendation, not an accepted replacement for TARGET.md, an ADR, or the GitHub board. It records what was inspected, what remains unknown, and what I recommend doing. Existing issue states were read, not changed. The planning assumption is one founder with agent assistance and about 120 focused hours over the month. With materially less time, reduce scope; do not compress the verification gates.

**User clarification, 17 October: public App Store publication is required.** The sequence below now prioritizes finishing the existing free v1, submitting it, resolving review feedback and verifying a public install. A private beta is an intermediate step. The custom-customer assistant remains a subsequent experiment; Hermes, phone/WhatsApp access, Salesforce and locked-phone conversation are not prerequisites for this release. The earlier five-day packaging suggestion is a checkpoint for reassessment, not permission to abandon publication.

**Further clarification, 17 October: the app must be coherent before publication.** Release mechanics alone do not satisfy the request. The personal-day product below is the proposed v1 identity. The customer-commitment positioning discussed later is a separate commercial hypothesis, not the identity of the App Store app. Neither hypothesis has been established by user research.

**The v1 coherence contract — proposed implementation scope**

> HealthyFlow helps you plan a realistic day, keep your health commitments in it, and record what actually happened through one conversation and one daily view.

The initial audience remains the person described in TARGET.md: someone managing work, personal commitments and health who finds maintaining separate trackers burdensome. The observable product loop is **say or enter → review → save → see it on the day → act or record → adjust**. Personal health remains core; the user need not use every tracker to get value.

| Existing part | Its job in the same product | Boundary |
|---|---|---|
| Today | The home: what needs attention, what is next, what fits, and what has been recorded | Preserve the existing cross-module timeline and supporting summaries. A food or Weight record is not automatically a time obligation. |
| Talk | The shared way to plan, log and ask about that same day | Use the active owner's authoritative records; retain explicit date context. Changes remain reviewable. No claim of an autonomous general assistant. |
| Manual Add/edit | A direct way to perform the same supported operations without AI | Reachable when offline or out of actions; same saved result and day, with explicit errors. |
| Tasks, Habits and Calendar | Commitments on the day | Preserve scheduled, Anytime and Someday meanings and the existing Habit lifecycle. |
| Nutrition, Weight and Workouts | Health commitments and actual records belonging to that day | Detail pages support editing/history; planned training and a recorded Workout session remain visibly different. |
| Goals | Direction and context that inform choices | Optional setup, no second Task lifecycle or invented completion percentage. |
| Progress | Recorded measurements over time | Distinct from Goal intentions and daily Task completion. |
| Capacity | An explanation of what fits within the declared planning window | Unknown durations remain unknown; unconnected obligations are not magically known. |

Make Today and Talk the prominent entry points while preserving reachable health and Goal detail pages. The current navigation already groups Today/Talk and Health; this is a hierarchy and journey pass, not a requirement to replace navigation or delete modules.

The minimum product changes are concrete:

1. **One first-use experience:** show the promise, offer one immediate capture/manual entry, then its saved place on Today. Keep the declared default planning window visible and editable. Ask for extra setup when relevant; do not require all health sections or a Goal before first value. Current setup is skippable and should remain so.
2. **One day and identity across surfaces:** Today → Talk → proposal → confirmed record must preserve owner and explicit dates. The previously observed server-versus-Local read/write boundary is a functional coherence issue. Fix the supported path rather than changing labels around inconsistent data.
3. **A visible end to each action:** after durable confirmation, show a concise receipt and an explicit route to the saved record/day. Preserve the conversation when the user wants to continue. Existing context handoffs and query invalidation are useful foundations, not proof that all round trips work.
4. **Health woven into the day:** reuse existing Today health summaries and detail views. Each applicable dated entry reaches the same day's record; completing a scheduled activity must not fabricate health measurements or a detailed Workout session. Keep unrecorded, unavailable and disabled distinct.
5. **One language:** align welcome, Talk starters, empty states, success/error receipts, website and App Store copy around planning and recording a day. Replace user-facing engineering explanations such as Today’s “owning source record” and Goals’ “owning module” with what users can do or trust. Do not promise 24/7 work, Salesforce, backup or delivered alerts without implementation.

Before release, demonstrate these journeys on a supported signed iPhone build, and verify shared frontend changes on the web:

- A fresh Guest captures one Task, reviews it, saves it, finds it on Today and reads it after restart.
- From a selected date, the user opens Talk, makes an explicit dated change and returns to that same date with exactly the confirmed result.
- A user plans a Task or Habit and logs a Calorie entry. Both appear in the correct day with plan versus record clear; any nutrition estimate is reviewable, not presented as a measured fact.
- A manual change is reflected by Today and by Talk's relevant read. Failed reads produce an unavailable state rather than a contradictory answer.
- Offline or after AI exhaustion, the user can manually add/edit/complete and reopen records without a dead-end or silent substitution.

New-user comprehension check: three people unfamiliar with the build can explain what HealthyFlow is for, find how to add something, and find what they saved without the founder narrating. This is a proposed practical acceptance check, not a market-validation claim. Screenshots of the connected journey should also explain the app to App Review and prospective users.

Passing this contract precedes submission. It does not require implementing a new morning/evening workflow engine, a health coach, Salesforce, a phone service or a new visual design. If a coherence defect needs deeper engineering than the planned window, revise the submission target instead of shipping inconsistent behavior.

**How to explain it, and the tasks that make the explanation true**

Added 17 October in response to the request for a concrete task list and website explanation. This is proposed copy, not a published website change or a replacement for the approved App Store listing. GitHub remains the execution tracker.

The short explanation:

> HealthyFlow is a daily planner that keeps your tasks, habits and health together. Talk, type or add things directly, then see what you planned, what happened and what fits in your day.

Proposed website opening:

> **Your plans and your health, in one day.**
>
> Bring tasks, habits, meals and workouts into one daily view. Talk or type to capture what is on your mind, review suggested changes, and keep track as the day happens.

Follow the opening with one connected example using real screenshots from the qualified build:

1. **Get the plan out of your head.** “Today, finish the proposal for 45 minutes and walk at six for 30 minutes.” Show the proposed Tasks, editable dates and durations, and the explicit Save action. Use an example verified against the release candidate.
2. **See the day you actually have.** Show those saved Tasks on Today alongside existing commitments. Explain Capacity as time within the planning window after known commitments, with uncertainty visible when details are missing. Do not promise automatic scheduling or knowledge of unconnected calendars.
3. **Keep the record as life happens.** Show a meal recorded, the walk marked complete and the proposal edited or moved by the user. Distinguish a planned activity from a recorded Workout session. Health detail pages support this day instead of requiring a separate onboarding story.

The reason to try it is less work keeping a useful picture of the day. Whether that is compelling enough to make people return remains a hypothesis. Do not claim that a unique feature, daily usage or health improvement has been established.

Use “Download for iPhone” only once the public listing and link work. Before publication, say the iPhone release is coming soon. A web CTA must disclose the current account requirement; the native Guest promise does not apply to the current web entry. Keep free-v1 AI limits and Local storage limits easy to find. Fifteen recurring AI actions per month do not support marketing an all-day conversational assistant; manual planning and logging must remain first-class.

| Order | Concrete task | Done when |
|---|---|---|
| 1 | Lock the public promise and release boundaries. | Welcome, website draft and Store copy explain the same personal-day product; the selected release's supported devices and advertised capabilities are explicit. |
| 2 | Make the first useful action immediate. | A new iPhone Guest can add one real Task, review it if using Talk, save it and find it on Today without completing every setup section. |
| 3 | Make Talk and Today agree. | Supported reads and confirmed writes use the correct owner and date; manual changes are reflected in relevant Talk answers. A restart preserves the result. |
| 4 | Give each change a dependable ending. | Review, correction, cancel, save, retry and failure have explicit outcomes. A success receipt links to the durably saved result and retry does not duplicate it. |
| 5 | Connect health to the same day. | A planned activity, food record and Weight or Workout record appear on their intended date with plan versus actual clear. Missing data and failed reads remain distinguishable. |
| 6 | Make the day usable without AI. | Offline and exhausted-action paths support manual add/edit/complete/reopen. Capacity never invents certainty. Storage/export wording matches demonstrated behavior. |
| 7 | Align the explanation with the verified app. | Replace technical user-facing wording; use one connected screenshot story on the site and in the release packet. Remove unsupported hands-free and web no-account claims. Three unfamiliar people can explain the purpose and find what they saved. |
| 8 | Qualify, submit and publish. | Release identity checks and relevant automated checks pass; the exact signed build passes supported iPhone/iPad journeys; privacy and review requirements are resolved; a public App Store download and first launch are verified. |
| 9 | Observe whether people return. | During the rest of the month, record independent use, failed attempts and useful outcomes. Use observed friction to choose the next fix. App Store availability alone is not user-value evidence. |

Use days 1–3 to establish the exact gaps and release baseline, days 4–7 for the bounded coherence repairs, days 8–14 for candidate qualification and submission, and the remaining days for review, publication and observed use. These are targets with the release gates above, not a guarantee of Apple's timing. The custom 24/7 customer assistant stays a separate subsequent experiment.

**The verdict**

HealthyFlow has enough implemented functionality to test a useful product. It does not yet have evidence establishing which product people want. More modules will make that uncertainty more expensive.

The clearest source of confusion is that three different promises coexist:

- TARGET.md promises a whole-life day: Tasks, Habits, food, weight, training and an honest Capacity figure.
- The App Store packet describes a daily planner for tasks, habits, food and fitness.
- The current board pursues a conversational Hebrew/English assistant that saves customer commitments into HealthyFlow and Salesforce, including hands-free entry.

Those could eventually share infrastructure. They do not share one clear initial buyer, acquisition message or release test. The current board has 18 cards, 14 marked P0. Three are In progress. That is a scope inventory, not a useful order of execution. Source: [Project 1](https://github.com/users/lermanori/projects/1), inspected 17 October.

My recommendation is to **make the existing personal-day experience coherent, then publish free v1**. Use the bounded coherence contract above to decide which changes belong before release. Evaluate the narrower customer-commitment offer separately. Do not rewrite the listing into a Salesforce or 24/7 assistant promise before those capabilities exist.

This is a recommendation based on access to three potential pilots and existing capture/day infrastructure. It is not a claim that this market has been validated. If those three people do not share the same recurring problem, select one role rather than build three products for three friends.

**The separate customer-commitment hypothesis**

> HealthyFlow helps people who work with customers turn spoken commitments into a dependable day: capture them, confirm them, bring them back at the right time, and show what actually fits.

The first audience is Hebrew/English-speaking business owners or customer-facing workers who leave calls or visits with follow-ups they currently put into WhatsApp, notes, memory, or Salesforce later. Start with the import/export owner, contractor and equipment sales representative already identified in [#315](https://github.com/lermanori/HealthyFlow/issues/315), then retain only those who match the same job.

The first trigger is **immediately after a customer conversation**. The useful result is a correct, durable commitment with an explicit next step. The first reason to return is seeing and acting on that commitment later. Speaking is the input; follow-through is the value.

Example: “Call Dana tomorrow at ten about the quote. Allow fifteen minutes.” HealthyFlow reviews the concrete date/time, saves the Task, reports whether its alert was scheduled, and shows it on Today. If the user explicitly chooses a verified Salesforce Contact and approves the remote write, it separately reports whether the Salesforce Task exists. A failed remote write must not become a fake success or erase the Local Task.

The longer-term whole-day vision can survive: work commitments, personal Tasks and existing health records may coexist. But requiring a new customer to adopt nutrition and training before finding value is an acquisition hypothesis with no evidence behind it. Health stays available; health adoption is not this pilot's success criterion. This challenges TARGET.md's current breadth-as-retention assumption and needs an explicit product decision before changing live positioning.

The immediate production promise is **foreground capture on supported iPhones**, with voice where verified and text/manual entry available. Cold locked-phone conversation is a separate unresolved requirement. If the pilots need it to get any value, it becomes the first go/no-go gate and a 30-day production commitment is not credible until it passes.

**What the market actually says**

These are current supplier capabilities and a subscription-industry dataset, not interviews with HealthyFlow users. Supplier documentation proves competitive overlap, not comparative quality, Hebrew accuracy, or willingness to switch.

| Evidence checked on 17 October 2026 | Implication for HealthyFlow |
|---|---|
| Todoist Ramble supports natural voice capture, multiple Tasks, spoken corrections and preview. Its help page, updated 8 October, explicitly distinguishes capture from a conversational assistant. Free accounts get 10 shared AI-capture sessions monthly; paid plans remove that session limit subject to rate limiting. [Todoist documentation](https://www.todoist.com/help/todoist/todoist-and-ai/dictate-to-add-tasks-with-ramble-P1Raq7vVF) | “Speak a messy thought and get Tasks” is already a competitive baseline. HealthyFlow must demonstrate a better complete workflow for a specific user. Sessions and HealthyFlow actions are different units; do not compare the allowances as equivalent. |
| Motion schedules and reschedules Tasks using durations, deadlines, priorities and calendar availability. [Motion documentation](https://www.usemotion.com/help/time-management/auto-scheduling) | AI day planning is crowded. Automatic scheduling would expand the comparison set without proving demand. |
| Sunsama adds planned durations, compares workload against a threshold and helps defer overcommitted work. [Sunsama documentation](https://help.sunsama.com/docs/usage-guides/daily-planning/) | TARGET.md's “Nobody else ships this” is not supportable as a broad workload-planning claim. Typed uncertainty and exact-versus-upper-bound Capacity are a narrower implementation distinction whose user value remains unproven. |
| Salesforce's 27 August 2026 article describes native Post-Meeting Voice Notes, on-device transcription, follow-up insights and configured Flow actions. Access depends on the org's setup and permissions. [Salesforce product article](https://admin.salesforce.com/blog/2026/post-meeting-voice-notes-what-admins-need-to-know) | Salesforce capture is also occupied. Compare the pilots' actual native Salesforce experience before spending the month recreating it. Do not assume its availability or language support in their orgs. |
| Apple supports extracting suggested reminders from shared text on compatible devices. [Apple support](https://support.apple.com/en-ie/124025) | The built-in alternative also improves. “Uses AI” will not explain why someone should install and maintain another app. |
| RevenueCat's 2026 report shows 12-month retention for monthly subscriptions of 6.1% for AI apps versus 9.5% for non-AI apps. Its underlying dataset primarily covers 2025 and RevenueCat-integrated apps meeting activity/revenue thresholds. [Report and methodology](https://www.revenuecat.com/state-of-subscription-apps) | AI can attract payment without creating lasting use. This is directional subscription-market evidence, not a HealthyFlow forecast or a benchmark for a small free pilot. |

The market trend worth acting on is that voice capture and AI planning are becoming standard capabilities. My inference is that HealthyFlow's best available experiment is a smaller, dependable workflow with reachable users and measurable follow-through. “Hebrew + Salesforce” is a testable advantage, not a defensible business by itself.

**What exists, and what cannot yet be claimed**

The baseline is local HEAD `53c156f` plus substantial pre-existing, uncommitted release/consent/native-speech work. The latest commit is dated 19 September; some working-tree experiments are newer. Neither is proof of the deployed production build. No live customer analytics, actual Salesforce org, App Store Connect status, or fresh physical-device trial was accessed in this assessment.

| Area | Evidence from the current checkout | Product consequence |
|---|---|---|
| Today and the day model | [Day contract](../../backend/src/day-summary-schema.ts), [derivation](../../backend/src/day-summary-core.ts), [Today](../../src/pages/TodayPage.tsx) contain planned/actual records and complete/partial/unavailable Capacity. | Keep and reuse. “Exact” means exact within recorded obligations and the declared planning window, not knowledge of every obligation in someone's life. |
| Local day | [Local services](../../src/lib/local/services.ts) and [store](../../src/lib/local/store.ts) hold Tasks, Habits, Goals and health records on device. | Useful foundation for immediate capture and offline manual work. Networkless AI is not implemented or promised. |
| Talk capture | [Capabilities](../../backend/src/ai-capabilities.ts) include Task proposals and confirmation. The normal confirmation path writes on the server, then [Talk](../../src/pages/AssistantPage.tsx) applies the result locally. `get_today` reads server records. | A manually created Local Task and Talk's server view can diverge. This is a source-of-truth risk that must be fixed before selling an assistant that knows the user's day. |
| Confirmation recovery | Generic confirmation reads pending state, runs the mutation, then marks it executed. Stronger workflow machinery exists elsewhere. | Sequential success does not establish safe concurrent confirmation or recovery after a lost response. Reuse the strong boundaries; do not rebuild the app. |
| Conversation breadth | The workflow schema names eight workflows; [the registry](../../backend/src/talk-workflow-definitions.ts) implements `plan_work`. Generic Talk supports more capabilities separately. | Eight names are not eight complete conversational experiences. Scope claims to executed paths. |
| Voice and Siri | Native speech and Debug probes exist. [#317](https://github.com/lermanori/HealthyFlow/issues/317) records user-reported unlocked single-Task success, but later locked Talk attempts had 24.4s and 19.2s responses and failed useful conversation. | Meaningful progress, not production-quality hands-free evidence. No always-listening, CarPlay or cold locked-phone promise. |
| Salesforce | No runtime integration found in the inspected frontend/backend/native source; [#320](https://github.com/lermanori/HealthyFlow/issues/320) and [#327](https://github.com/lermanori/HealthyFlow/issues/327) remain Backlog. | Integration is work still to do, including permissions and recovery. A link is not the accepted remote Task creation. |
| Timed follow-ups | Push infrastructure exists; reliable per-Task device scheduling/reconciliation is still specified in [#323](https://github.com/lermanori/HealthyFlow/issues/323). | A saved Task is not a delivered alert. This matters more to the pilot than another planning module. |
| Measurement | [Event types](../../src/lib/analytics/types.ts) cover broad activity, but not a complete proposal/edit/Local-save/return funnel or Capacity outcomes. | There is no inspected evidence that the claimed differentiator drives retention. Instrument the decision before adding dashboards. |
| Privacy | Uncommitted AI consent work exists. [PostHog config](../../src/lib/analytics/posthogProvider.ts) masks input fields but does not itself establish exclusion of displayed sensitive text. [#312](https://github.com/lermanori/HealthyFlow/issues/312) is unresolved. | Verify actual payloads and collection settings. Do not advertise “everything stays on device”: AI and conversation/server paths exist. |
| Recovery/export | Settings calls the server `/account/export`; the Local document is not included by that call. v1 does not provide Cloud backup. | “Complete portable archive” is not substantiated for Local-only records. Fix truthful export and a tested recovery path before asking users to depend on it for important commitments. |

Source existence, automated tests, a physical-device success report and a verified release are four different levels of evidence. Keep them separate.

**What to keep, freeze, and explicitly reconsider**

Keep Talk, Today, Task capture, corrections, durable confirmation, Device Calendar, existing Capacity and manual offline use. Preserve the existing health functionality and parked Work code. Fix bugs affecting the chosen workflow.

Freeze new nutrition, weight, workout, Goal, Week and Daily Signals features. Freeze design refreshes, new dashboards, new model choices, new orchestration frameworks and admin expansion. These do not answer this month's product question.

Defer general assistant memory, conditional monitoring, CRM-triggered conversations, CarPlay, two-way Salesforce sync, more Salesforce object types, Android, web guest parity, payment implementation and broad acquisition campaigns. Existing [#325](https://github.com/lermanori/HealthyFlow/issues/325), [#326](https://github.com/lermanori/HealthyFlow/issues/326), [#328](https://github.com/lermanori/HealthyFlow/issues/328) and [#329](https://github.com/lermanori/HealthyFlow/issues/329) should not consume this month's build budget.

The existing approved pilot includes Contacts-only Salesforce Task creation and a conversational experience. Making Salesforce optional or accepting foreground-only capture would revise that scope; it must be recorded in [#316](https://github.com/lermanori/HealthyFlow/issues/316), not quietly renamed a successful delivery of #327/#322. If the users reject that narrower scope, extend the schedule or stop this pilot. Do not claim the original pilot shipped.

Three decisions deserve direct challenge:

1. **Fifteen actions a month cannot sustain frequent conversation.** At three billable turns per useful conversation it supports five conversations. Use the already permitted discretionary free grants for an explicitly bounded pilot and measure actions per useful outcome. Changing the public allowance or charging unit would require revisiting ADR-0016/0017/0019; do not hide that change in implementation.
2. **Do not make basic recoverability depend on a future product nobody can buy.** Provide a complete Local export and validated recovery route. Changing the deliberate backup restriction in ADR-0011 or v1's transfer boundary in ADR-0019 requires a new decision. Existing ADRs remain immutable. At minimum, fix the misleading export claim immediately and block broad reliance until recovery is resolved.
3. **Module breadth is not a success metric for this pilot.** A person who reliably captures and follows through on customer commitments can receive real value without logging food. Keep breadth as an observation, not an onboarding requirement.

**The next 30 days**

The required outcome is a coherent free v1, a public App Store listing and a verified fresh install. Allow the first week for the bounded coherence pass alongside release repairs; aim to submit by day 14 after signed-device qualification. This replaces the earlier day-10 target to account for the user's coherence requirement. It remains a planning target; unresolved defects or Apple's review may extend it. Report submission and approval separately from public availability. Apple's [submission guide](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app) and [publishing overview](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/overview-of-publishing-your-app-on-the-app-store) describe the separate stages.

Reserve roughly 35 hours for the coherence pass, 45 for release repairs, verification and submission preparation, 20 for observing users, and 20 for review feedback and contingency. These are planning caps, not delivery guarantees. Defer custom-assistant implementation and extensive offer design until the coherent app is submitted. Actual failures in advertised functionality must be repaired; speculative new capabilities do not become release blockers.

| Dates | Deliverable and owner | Exit gate / response to failure |
|---|---|---|
| Days 1–3: 18–20 Oct | Inventory and preserve the uncommitted release/probe work; choose the candidate baseline. Turn the coherence contract into exact current-screen changes and reproduce the five journeys. Inspect current App Review/build state; resolve recording privacy and build-number choices. | One personal-day promise, a bounded gap list and a named release baseline. Retain working connections; do not start a replacement app or broad redesign. |
| Days 4–7: 21–24 Oct | Repair the supported Talk/Local/day round trips, action receipts and first-use hierarchy; align health entry/return paths and user-facing language. Address release defects alongside these changes. | The five coherence journeys work, and three unfamiliar people understand the app and locate saved results. No failed-read masking or false save receipts. Deeper failures extend this stage explicitly. |
| Days 8–14: 25–31 Oct | Freeze the candidate, run shared web and native checks, complete signed iPhone/iPad smoke and review packet through #314, then perform #238's upload/processing/submission sequence. Confirm listing, Free price, declarations and reviewer access in the portal. | The exact signed candidate passes both coherence and release gates. Record actual submission status. Screenshots and description show the same personal-day experience that ships. |
| Days 15–20: 1–6 Nov | Resolve Apple feedback promptly and repeat verification after code changes. Observe three users using the supported product; expand only if dependable. Release as soon as approved and the final gate passes. | Public listing, storefront availability, download and first launch verified when release occurs. If still in review, retain publication as unfinished work. |
| Days 21–30: 7–16 Nov | Monitor the public app and fix observed failures. Measure return use and outcomes. Define one bounded custom-customer assistant offer using demonstrated demand; implementation follows release and a separate scope decision. | Report publication status and user-value evidence separately. Apply continue/narrow/stop decisions to product expansion, not to the user's required publication objective. |

Proposed work-in-progress limit: one release repair at a time, with independent device verification or metadata preparation alongside it. Keep GitHub as the tracker; this table is a dated sequence, not a parallel status system. Restore unfinished archived release work when needed, especially #237/#238/#313, instead of creating duplicates. On 17 October, #309 (camera), #310 (Apple artwork) and #311 (AI consent) were confirmed CLOSED; reuse their fixes and verify them on the final candidate rather than treating them as unimplemented. The camera comments still name a physical-iPad evidence gap. #312 and #314 remain open. Issue closure does not establish which source is in the next binary. #324 qualifies the broader Salesforce pilot and does not block free-v1 release.

**What “production ready” must mean**

Apply these gates to capabilities actually included and advertised in the candidate. Salesforce, new timed-follow-up behavior and broader conversational targets are future-pilot gates unless explicitly added to a later release. Preserve free-v1's disclosed Local-only limits; a new Cloud/recovery product decision is not silently required to finish App Review. Misleading export wording and actual data-loss defects still require correction.

- A named commit, backend deployment, bundled frontend, app version/build and device/OS matrix are recorded together. Current working-tree deployment targets say iOS 26.0; the older 15/17 guidance is stale for this checkout, not a decision to support older phones. Confirm the intended floor and real users' devices. Separate Debug probes from the candidate.
- Capture, proposal revision, confirmation, double-tap/concurrent retry, lost response, crash/relaunch and account switch are verified through the real Local persistence boundary. Saved means durably readable, not just a successful network response.
- Local manual add/edit/complete/delete works offline. AI-unavailable states are explicit. Failed reads never become empty days. Export/recovery behavior and limits are demonstrated.
- Consent accept/decline/withdrawal is tested. Analytics/replay behavior matches the actual disclosure; raw Task, conversation, customer and health content is excluded from product telemetry. I recommend disabling replay for this pilot rather than spending the month qualifying it; that is a proposed policy choice under #312. Apple requires clear disclosure and explicit permission for personal-data sharing with third-party AI. [App Review Guidelines 5.1.2](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing)
- Notifications report “scheduled” separately from “delivered”; test the supported closed-app path, permission refusal and edits. Salesforce reports Local save, remote success, failure or unknown independently. Never retry an unknown remote create blindly.
- Relevant automated checks and a signed-device smoke pass. A build warning is investigated according to impact; a failed release identity test is not dismissed because other tests passed.
- Basic operations exist: error/crash visibility without sensitive payloads, spend limits, one support route, deployment rollback, and an owner who can disable the failing AI/CRM capability while preserving the manual Local day. Test restoration of any hosted credentials/receipts; that does not restore a user's Local day.

**The scorecard and stopping rules**

All thresholds below are proposed operating gates for a small pilot, not industry benchmarks or statistical proof of product-market fit. Report counts and denominators, including people who never activate. Exclude founder/admin/demo activity. Use at least seven observation days per participant before calling them a returning user.

| Question | Proposed gate by day 30 |
|---|---|
| Can someone get value alone? | At least 8 of 10 invited, qualified users capture and durably save a real Task within five minutes of onboarding, without founder operation. If only three are recruited, report that smaller experiment honestly. |
| Is capture dependable? | At least 90 of 100 representative attempts reach the correct saved outcome without restarting or founder repair; report Hebrew and English separately, including ambiguous/noisy examples. Zero unapproved writes, wrong-account writes, lost confirmed Tasks or duplicates in the tested cases. Any such incident stops expansion. |
| Is it faster? | Measure the same user's usual method against HealthyFlow, including review/correction. Target median at least 30% faster on the chosen workflow; report the number of paired examples. Measure speech-end-to-reviewable-proposal separately: proposed foreground target median ≤5s and p95 ≤10s. These do not replace #317's stricter conversational targets; they define the smaller capture pilot. |
| Do people return without being chased? | Of 10 qualified users onboarded by day 17, at least 6 perform the capture-and-review loop on 4 distinct days during their next 7 days. Track spontaneous versus researcher-prompted activity. With only the first three, 2/3 is a reason to keep learning, not market validation. |
| Does it improve follow-through? | At least 5 of 10 identify a specific recorded commitment they subsequently acted on or consciously rescheduled because it resurfaced here; corroborate with Task/alert history where consented. Task completion is self-reported behavior, not proof of business revenue or causality. |
| Does Capacity matter? | Record when it is seen, reason codes, and subsequent explicit rescheduling. If users ignore it but repeatedly use capture/follow-up, demote it in positioning rather than build more Capacity UI. |
| Is there a commercial signal? | At least 3 continuing users respond to one concrete future offer with a price and named payer, and agree to a follow-up when available. Treat statements as weak evidence. No purchases, deposits or checkout in free v1. |

Add a small typed funnel in the existing analytics layer: capture attempted/failed, proposal shown/revised/abandoned, Local commit succeeded/failed, follow-up schedule state, remote delivery state, and return-day outcome. Use stable non-content identifiers, counts, durations and reason codes. Never log transcripts or titles. Measure failure denominators; success events alone will flatter the product.

Continue if repeat use and useful outcomes pass with tolerable support cost. Narrow to the role/workflow that returns if results differ sharply. Stop the expansion if, after two repairs to observed friction, fewer than two of the first three users return voluntarily, or incumbents solve the same problem adequately. Reliability failure means repair before expanding; lack of demand means stop adding features. Those are different diagnoses.

**Money and distribution**

This month remains free, consistent with [ADR-0019](../adr/0019-v1-is-free-and-has-no-purchase-rail.md). Do not spend a week implementing payment before people reliably return.

Give pilot users a bounded, clearly explained discretionary action allowance so the entitlement does not invalidate the experiment. As a workload illustration, 10 people × 3 conversations/day × 4 billable turns × 20 active days is 2,400 actions, before evaluations. This is not a cost estimate. Record actual provider dollars, audio/model usage, retry/refund costs, hosting and founder support minutes per useful outcome. Set the cash cap from that evidence; no “unlimited” promise.

For willingness-to-pay discovery, a possible future test is the local-currency equivalent of $15/month for a dependable customer-follow-up workflow. That is a proposed test price, not researched market value or a current offer. Ask who pays, what it replaces, and what would make the price unjustifiable. A future workflow subscription would reopen the current Cloud/action-pack monetization decision; it is not implicitly approved by this roadmap.

The acquisition channel for these 30 days is founder-led observation and referrals from the existing pilots. Ask each of the three for two introductions and recruit the remaining participant directly. Do not buy ads or rely on App Store discovery. A listing gives access; it does not establish demand. Do not rebrand this month. Reconsider the HealthyFlow name only if evidence supports a lasting business-workflow direction.

**Fresh verification from this assessment**

- Frontend and backend TypeScript checks passed.
- Frontend suite: 479 passed, 1 failed out of 480. The failure is `keeps app and widget release identity aligned`; the current project contains two build-number 5 settings and two build-number 6 settings.
- Web production build passed, with a bundle-size warning. This did not sync or build iOS and is not native release evidence.
- Backend non-live suite: 111 suites and 1,008 tests passed (`npm --prefix backend run test:ci`). Live-model tests were excluded by that command.
- Test runners initially could not open local sockets under the sandbox; reruns received local execution permission. No live-model evaluation, Salesforce transaction, new signed iOS build or physical-device test was performed for this report.

The useful outcome of the month is a smaller app promise that real people repeatedly trust. Ten more completed feature tickets would not answer that question.
