# Handoff — Calendar and sync, 2026-09-10 to 2026-09-13

**Dated snapshot. Not maintained.** It describes where things stood on
2026-09-13; the code and the board are the current truth.

`main` at `d450425`. Backend deployed to Railway 2026-09-12 and healthy. All
migrations applied.

---

## What shipped

Nine issues, every one verified on a physical iPhone by the founder.

| # | What | Note |
|---|---|---|
| 249 | Guest action grant reserved per network for 24h (ADR-0023) | Apple DeviceCheck dropped, removing its server-key gate from the launch path |
| 265 | Item Calendar status names the provider that handled it | |
| 266 | Account→EventKit path proved, not assumed | The bug it was opened for had already been fixed by #263 |
| 267 | Device Calendar reconciles both ways, last-save-wins | Also fixed an **infinite loop** this work had itself shipped |
| 268 | Cloud replicates the Local day, never replaces it | |
| 272 | A HealthyFlow event whose Item is gone is visible again | |
| 273 | No stale `In Calendar` after Calendar access is revoked | |
| 278 | Other devices' work arrives on foreground, not only cold start | |
| 279 | The Local day accepts writes with no network | Three layered causes |

Alongside those:

- **Sync watermarks rewritten.** `updated_at` was being used both to decide which
  edit wins *and* as a position in a stream, compared against a server clock. Two
  devices stopped seeing each other's work, permanently. The server now stamps
  its own `synced_at` and filters pulls on it; the client tracks `pushedAt` on its
  own clock. `updated_at` went back to deciding conflicts only.
- **Cloud is grantable again.** The free-v1 migration had deactivated *every*
  subscription on 2026-09-07, so the "founder legacy exception" the docs describe
  had no row behind it. A toggle in Token Manager → User management now grants and
  revokes it, with a log line.
- **Direct Google Calendar detached from iPhone** — structurally, not behind a
  flag. `VITE_NATIVE_GOOGLE_CALENDAR_ENABLED` deleted. Untouched for web.
- **Observability that did not exist.** No request logging anywhere, and neither
  `sync.ts` nor `routes/sync.ts` used the project's own leveled logger. Both now
  traced at `debug`, plus a client startup line reporting the resolved API and
  Cloud flag, and a reason printed whenever the sync loop declines to run.
- **`build:ios:local` and `build:ios:device`** (the latter authored by Ori),
  because `build:local` writes `dist/` only and the iOS app serves
  `ios/App/App/public`.

## The pattern worth carrying forward

Nearly every bug here was **a state that stopped being true with nothing marking
it as such**, or **a trigger that never fired**. Not broken logic.

- #265, #273: badges outliving their evidence
- #279: three separate silent pauses, each hiding the next
- #278: the exchange was correct and simply never asked for
- #267's loop: a comparison between two quantities that were never equal

The through-line is that a *silent* wrong state costs far more than a loud one.
The release gate said "Local day rendered during a transient disconnected launch"
— it tested reading offline, which is why writing offline was broken for the
entire life of the feature and nobody noticed. That gate now demands writing.

---

## What is left

### Blocking launch — all three need the founder

| # | What | Blocked on |
|---|---|---|
| **235** | Verified email and self-serve recovery | **Choosing a transactional email sender.** Blocked for this whole session; the only thing gating the date |
| **237** | App Store declarations | Founder/legal. Now also needs a call on the Cloud capability: the build can transmit day data for an entitled account, so App Privacy and the "Cloud backup and transfer are not available" line both need review |
| **238** | Archive, upload, submit, verify | Apple, after 235 and 237 |

### Held by decision

**#269** — Calendar events as first-class Items. ADR-0024 records the accepted
direction; the founder held it because the current read-only `Fixed` row is
wanted. One consequence worth remembering: because it is held, Device Calendar
stays **read-only** in the App Store privacy inventory, so #237's existing answers
remain correct.

### Owed and not done

Two guards, both flagged repeatedly and never built:

1. **A check that fails when `ios/App/App/public` is older than `dist/`.** A
   change not reaching the simulator cost several rounds across this session,
   including one where the agent itself verified with `npm run build` and never
   ran `cap sync`. The symptom is always confusing at runtime and trivial at
   build time.
2. **An issue for the backend suite's order-dependent flakiness.** One or two
   failures per full run, a different test each time, all passing in isolation.
   Present on clean `main` before any of this work. It will make #238's release
   gate noisy, so file it before reaching that gate rather than during it.

### Known and accepted

- A conflict from two-way reconciliation is **recorded and badged, but there is no
  resolution flow** — the person resolves it by editing one side. Conflicts are
  hard to reach by hand and are covered by tests rather than device checks.
- Apple DeviceCheck remains the better instrument against reinstall farming than
  the per-network reservation (ADR-0023). It was rejected on cost of carry, and
  the upgrade path is deliberately left open behind the same eligibility flag.

---

## Notes for whoever picks this up

**Build scripts.** `build:production` and `build:local` write `dist/` only.
Anything with `ios` in the name also runs `cap sync`. If it does not have `ios`
in the name, it does not reach the app.

**Reading the device.** The Xcode console carries `[build]`, `[sync]` and
`[http]` lines; filtering to those makes the state legible immediately. The
`[build]` line reports the resolved API base, which settles "is this a stale
bundle?" in one glance.

**Production logging is quiet by design.** The traces are `logger.debug` and
Railway runs at `info`. Set `LOG_LEVEL=debug` temporarily to watch an exchange
there.

**Migration ordering.** On 2026-09-10 a migration was applied while the matching
backend was not yet deployed, and every new Guest's first AI action returned 503
until it was. Both orders have now caused an incident. Check
`supabase migration list --linked` against the deployed commit before assuming
either is safe.
