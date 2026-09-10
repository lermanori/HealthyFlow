# ADR 0023 — the Guest action grant is reserved per network

**Status**: Accepted

**Decision date**: 2026-09-10

**Supersedes nothing.** Narrows the "once" in
[ADR-0018](./0018-a-guest-receives-ten-actions-once.md).

## Context

ADR-0018 gives a Guest ten AI actions once. "Once" was keyed only to the `users`
row, and a Guest row costs nothing to create: deleting and reinstalling the app
mints a new row and a new ten-action grant. One person can repeat that
indefinitely, and every action is paid for by the founder.

The bill is already bounded — `GLOBAL_DAILY_COST_CEILING_USD` caps all users at
$25 in a UTC day — so the exposure is not an unbounded charge. It is
**availability**: `guestLimiter` permits 5 Guest creations per address per 15
minutes, so about 480 a day. At the most expensive action class that is roughly
$9.36 a day from a single address, and about three addresses can exhaust the
global ceiling and refuse AI to every honest user until midnight UTC.

Apple's DeviceCheck was evaluated first and is the better instrument for this
threat, because reinstall farming is per-device and DeviceCheck's bit survives
reinstalls. It was rejected for v1 on cost of carry, not on correctness: it needs
an Apple server key, a JWT signer, a native bridge, and a founder credential gate
that blocks submission, and it adds a per-grant network call to Apple whose
failure — under this project's no-fallback rule — means no grant at all.

## Decision

### 1. A network holds the Guest grant for 24 hours

The first Guest created from a client address wins that network's reservation and
is eligible for the ten-action grant. Another Guest from the same address inside
`GUEST_GRANT_IP_WINDOW_HOURS` is created **without** grant eligibility.

### 2. The reservation is taken at Guest creation, not at the first action

Creation is the one moment the client address is naturally in hand, so nothing
has to be threaded through the AI call path. It is also the kinder boundary: a
person who starts on café WiFi and later acts on cellular keeps the grant they
were already given, because eligibility was decided once and stored on the row.

The grant itself stays lazy, exactly as ADR-0018 specifies. Only *eligibility* is
resolved early.

### 3. The address is never stored

`guest_grant_ips` is keyed by an HMAC of the address under a server secret. A
bare SHA-256 would not be enough: the IPv4 space is 2^32, so an unkeyed digest
inverts in seconds and the table would become a log of who used HealthyFlow from
where. The secret is `GUEST_GRANT_IP_SECRET`, falling back to `JWT_SECRET`, and
the server refuses to derive a key if neither is set rather than hashing
unprotected or using a per-boot random value.

### 4. Losing the reservation withholds actions, never entry

A Guest who does not win the reservation still gets their full Local day. Only
the ten AI actions are withheld.

### 5. An unreserved network is its own typed cause

`network_limited` is distinct from `claimed` (the ten actions were received and
spent) and from `unavailable` (a read broke). The app tells such a person that
their **network** already used the free actions and offers Claim, which grants 15
actions a month keyed to the account rather than the network.

Collapsing this into ordinary exhaustion would tell everyone behind a shared NAT
that they spent ten actions they never received.

### 6. A broken reservation withholds the grant

If the reservation store is unreachable the Guest is created unreserved. An
unavailable read is not evidence that a network is free; treating it as such
would reopen farming for exactly as long as the outage lasts.

## Consequences

- **A shared network yields one Guest grant per day.** Carrier-grade NAT, an
  office, a school, a café, or a conference will produce `network_limited` for
  everyone after the first person that day. This is the accepted cost of the
  decision, and the reason §5 exists. Most iPhone users on IPv4 cellular are
  behind CGNAT; those on IPv6 are keyed by their own prefix and are unaffected.
- Claim becomes the path for anyone the guard catches, and Claim through Sign in
  with Apple is itself a stronger anti-farming identity than either IP or
  DeviceCheck, because an Apple ID survives reinstall *and* device change.
- The guard is coarse and evadable by anyone with a proxy pool. It stops
  opportunistic reinstall farming, which is the realistic threat; it is not a
  defence against a determined attacker.
- `GUEST_GRANT_IP_WINDOW_HOURS` is the tuning knob. Raising it hardens the guard
  and widens the false-positive window; lowering it does the reverse.
- If Guest conversion data later shows the false-positive cost is real, the
  upgrade path is a per-device axis — an iOS Keychain identifier, which survives
  reinstall and needs no Apple key, or DeviceCheck itself. Both slot in behind
  the same `guest_grant_ip_reserved` eligibility flag.
