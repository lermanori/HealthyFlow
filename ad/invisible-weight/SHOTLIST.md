# The Invisible Weight — Shot List (SEE / HEAR)

HealthyFlow ad. Final length: **36.8 seconds**. Vertical 1080×1920, 24fps.

This describes **the cut as it actually exists** — not the original script, which
is no longer valid. Per the request: **composition and what happens only**. No
colour / style / grade descriptions.

**Concept:** a woman moves through an ordinary morning. Floating notes pile up
around her — everything she has to remember. The noise peaks, stops dead for a
beat of silence, and the notes organise themselves into a single timeline. She
breathes. There is no freeze frame anywhere in the film — the picture stays alive
throughout.

**Voiceover (two lines only, as recorded):**
1. "The hardest part of modern life isn't doing everything."
2. "It's remembering everything."

---

## The table

| # | Time | SEE (composition + action) | HEAR |
|---|------|---------------------------|------|
| **1** | 0:00–0:01 | **Face close-up.** She looks slightly past camera and blinks. The full note cloud is around her (14 notes). A flash-forward — hard cut out. | Peak of the notification stack, cut off mid-air. |
| **2** | 0:01–0:06 | **Medium, kitchen.** Standing at the counter in profile, pouring coffee from a moka pot into a mug. Plants on the windowsill, counter across the lower third. | Coffee pour. Quiet room tone.<br>**0:04.7** — first note: `Dentist at 3 PM` + alert sound. |
| **3** | 0:06–0:11 | **Medium, frontal.** Standing behind the counter facing camera, phone raised in her right hand, mug in her left. Shelving and plants behind her. She leaves the counter at the end of the shot. | **0:07.7** `Reply to Alex`<br>**0:08.8** `Buy groceries`<br>**0:09.9** `Workout`<br>Each note gets a different alert sound. From 0:09 a low drone enters and starts rising.<br>**0:09.9–0:10.9** footsteps — she crosses to the table. |
| **4** | 0:11–0:14 | **Wide, through a doorway.** Deep composition — a corridor wall in the foreground frames her from the left; she sits at the table deeper in frame on the right. Closed laptop in front of her, mug. | **0:11.2** chair (she sits down).<br>**0:11.8** `Call Mom`<br>**0:12.9** `Pay rent`<br>**0:13.6** `Go to the gym` |
| **5** | 0:14–0:17 | **Wide, same doorway framing.** Identical angle to shot 4 — the laptop is now open and she is typing. | Keyboard (irregular, human rhythm).<br>**0:14.4** `Drink water`<br>**0:15.8** `Finish project`<br>**0:16.6** `Schedule appointment`<br>Room tone starts thinning, the drone climbs. |
| **6** | 0:17–0:20 | **Wide, same doorway framing.** She is deeper in frame at the sink under the window, three-quarters back to camera. The smallest she appears in the whole film — the notes are at their most dominant. | **0:17.3** `Log lunch`<br>**0:18.1** `Prepare for meeting`<br>**0:18.8** `Answer email`<br>**0:19.5** `Call family`<br>The alerts now overlap with no gaps. |
| **7** | 0:20–0:23 | **Close-up, slow push-in.** She stops. Looks slightly past camera. All 14 notes are in the air around her — her face stays clear, no note covers it. | The stack peaks. Drone at its highest. Never distorted — just crowded. |
| **8** | **0:22.75** | **Transition (0.5s dissolve).** The static note cloud melts into the scattered cards as they begin to organise. | **Total silence.** Everything cuts — including room tone. |
| **9** | 0:22.75–0:28.75 | **Close-up — the same shot as 7 but at half speed (×2 slow), and she keeps moving. Not a freeze.** The notes fly in and align into a single column: a whole day as a timeline, 15 rows, ordered by time. Organising starts immediately on the cut — no waiting. | **0:23.9–0:26.5 — VO 1:**<br>*"The hardest part of modern life isn't doing everything."*<br>**0:25.8** — the lock-in sound: every row settles. The most important sound in the film.<br>**0:26.3** — warm music enters (only after the day is organised, never before).<br>**0:27.7** — VO 2 begins **while still in this shot** (see shot 10). |
| **10** | 0:28.75–0:31.8 | **Medium close-up, no notes.** She exhales, shoulders drop, expression softens. Present again. | **0:27.7–0:28.9 — VO 2** (starts at the end of shot 9, finishes just as shot 10 begins):<br>*"It's remembering everything."*<br>Birds and room tone return — the world sounds like shot 2 again. |
| **11** | 0:31.8–0:36.8 | **Full-screen graphics.** The timeline from the previous shot stays dimmed in the background. Text enters in three stages. | Music settles onto one warm chord and ends. |

---

## Shot number → file name mapping

The table above numbers shots 1–11 in sequence. **The files and code use a
different numbering** — there is no S7 (it was absorbed into S8's push-in). Use
the right-hand column when talking about files:

| In the table | In code / files | Note |
|--------------|-----------------|------|
| 1 | S1 | Cut from the last second of the spine (live, not a freeze) |
| 2–6 | S2, S3, S4, S5, S6 | `plates/S*.mp4` |
| 7 | **S8** | There is no S7 |
| 8 | — | The transition itself (dissolve), built in `assemble.sh final` |
| 9 | S9 | Blender render on alpha over live S8 underneath |
| 10 | S10 | `plates/S10.mp4` |
| 11 | S11 | `organize/generate_endcard.py` |

---

## On-screen text in shot 11 (end card)

In order, in three stages:

1. **HealthyFlow** (wordmark)
2. Take back control of your day.
3. DM "FLOW" for early access.

---

## The timeline in shot 9 — 15 rows in order

This is the point of the ad: not a sorted to-do list, but **a whole day being
tracked** — work, fitness, food, weight and habits in one column, ordered by
time. Each row has a category colour bar and a "chip" showing what is measured:

| Row | Chip | What it shows |
|-----|------|---------------|
| Workout | ✓ 45 min | A session already done and logged |
| Drink water | 6-day streak | A habit with a streak |
| **Weight** | 68.2 kg ▼ | **A weight measurement — the thing a calendar can never show** |
| Pay rent | 8:30 AM | Task |
| Reply to Alex | 9:00 AM | Task |
| Prepare for meeting | 10:00 AM | Task |
| **Log lunch** | 540 kcal | **Calories** |
| Answer email | 1:00 PM | Task |
| Schedule appointment | 2:00 PM | Task |
| Dentist appointment | 3:00 PM | Task |
| Buy groceries | 5:30 PM | Shopping |
| Go to the gym | 6:00 PM | Fitness |
| Call Mom | 7:30 PM | Personal |
| Call family | 8:00 PM | Personal |
| **Finish project** | ↻ Tomorrow | **What she didn't finish rolls itself to tomorrow** |

---

## Story version — 15 seconds

Cut from the master, **0:21.8 to the end** (exactly 15.000 seconds). Covers the
full arc: end of the overload → silence → organising → release → end card.

---

## Production notes

- **No freeze frame anywhere.** Even at the peak the picture keeps moving. This
  was an explicit decision after the frozen version looked like a stuck video.
- **The silence at 0:22.75 is the star.** True digital silence, not "quiet". A
  full second before the VO comes in — do not rush it.
- **The pause between the two VO lines is 1.16 seconds.** The pause does the
  work.
- **The current soundtrack is a synthesised scratch** (except the VO, which is
  real). It exists to check timing — it is not the final mix.
- `PRODUCTION.md` in this folder is **out of date**: it still describes a 3s
  freeze at 0:30 and an audio cue sheet built around it. Use this document and
  the README's M6 cue table instead.
