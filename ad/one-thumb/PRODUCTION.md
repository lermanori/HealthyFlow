# One Thumb — HealthyFlow · 20s Instagram Reel (9:16)

**Logline:** A day happens in five moments. Each one takes a second to capture.
At the end, they're all one day.

**Working title:** One Thumb. **Length:** 20.0s. **Format:** 1080×1920, 24fps,
yuv420p.

---

## The spine

Life is varied; capturing it is always the same small motion. Every beat is a
different room, a different framing and a different time of day — set against an
identical thumb-tap. The light runs morning to evening, so **the ad is a day**,
which is the product thesis stated as form: *the day is the unit.*

**What it has to prove:** that this is not a calendar and not a task list. It
does that by breadth — weight, water, food, work, training in one timeline —
plus rollover in the payoff. Those are the two things a calendar cannot do.

---

## Lessons carried from "The Invisible Weight" (see `../invisible-weight/README.md`)

1. **AI video cannot render legible text or UI.** Every app element in this ad is
   composited in post. The model only ever generates *her*. Prompts explicitly
   exclude screens, numbers and interfaces.
2. **"Most of the scenes look the same"** was a shot-variety problem, not a grade
   problem — ad #1 had ~4 distinct setups across 9 live shots. Here the five
   beats are five different rooms, scales and angles by construction.
3. **"Too much AI vibe"** is worst on faces held across shots. **Four of the five
   beats are tight on hands, feet or objects** — far more reliable from AI video,
   and it is also the "one thumb" motif. Only the payoff would need a face, and
   the payoff is graphics.
4. **Plate durations drive the edit.** Ad #1's plates came back 3–5s and the
   whole timeline had to adapt. Generate ~4s per shot; trim to the beat sheet.
5. Pipeline gotchas that cost real time last round — force `-pix_fmt yuv420p` on
   every encode; never single-pass `loudnorm` a mix with a silence beat; the
   `loudnorm`/`adelay`/`atrim` PTS trap. All documented in the invisible-weight
   README; reuse `norm_linear` and the `vo` stage from its `assemble.sh`.

---

## Beat sheet

Targets, to be locked once plates exist. Each beat = a life moment then a
full-screen app insert. Beats **accelerate** — the cut gets tighter as the day
fills up.

| Beat | In–Out | Life moment (Kling) | App insert (composited) |
|------|--------|---------------------|-------------------------|
| 1 | 0.00–2.40 | ~7am. Bare feet step onto a bathroom scale. Low, tight. | **68.2 kg ▼** (1.80–2.40) |
| 2 | 2.40–4.60 | ~8am. A glass fills at the tap, hands. | **Drink water · 6-day streak** (4.00–4.60) |
| 3 | 4.60–6.60 | ~12:30. Top-down, a fork set down on a finished plate. | **Log lunch · 540 kcal** (6.05–6.60) |
| 4 | 6.60–8.50 | ~3pm. Side profile, a laptop lid closing. | **Prepare for meeting ✓** (8.00–8.50) |
| 5 | 8.50–10.30 | ~6pm. Tight on hands racking a dumbbell. | **Workout ✓ 45 min** (9.80–10.30) |
| — | 10.30–15.50 | **Payoff.** Pull back to the full timeline: those five rows now sitting in one day with everything else. One row reads **↻ Tomorrow**. | graphics only |
| — | 15.50–20.00 | **End card.** | graphics only |

**Opening on the scale is deliberate** — it is the single most "this is not a
to-do list" image available, and a Reel is won or lost in the first second.

---

## Voiceover

No VO over the beats. The rhythm and the taps carry them, and the ad must work
muted. VO lands **once**, at the payoff:

| At | Line |
|----|------|
| 11.00 | "Tasks, food, training, weight." |
| 13.40 | "Your whole day, in one place." |

~4s of speech. This is the committed positioning one-liner nearly verbatim
(`MARKETING.md` §3 / the product thesis).

**ElevenLabs settings** — same as ad #1, which came out right: mid-register
conversational voice (Shelly), stability ~80, style 0, speed ~0.97,
Multilingual v2. Generate each line separately; **check the two takes' loudness
against each other** (ad #1's came back 6.8 LU apart). `assemble.sh vo` in the
invisible-weight folder already loudnorms each line before placing — reuse it.

---

## Sound design

| At | Cue |
|----|-----|
| throughout | One short, satisfying **tap** per capture. Same sound every time — it is the audio version of the motif. |
| beats | Light diegetic per moment: scale creak, water, cutlery, laptop lid, dumbbell on rack. Kept dry and close. |
| 0.00→10.30 | Music builds with the accelerating cut. |
| 10.30 | Music opens up at the payoff — the release is the whole day appearing at once. |
| 15.50→20.00 | Resolves under the end card. |

No hard-silence beat in this one — that was ad #1's device and it belongs to
that ad.

---

## Kling prompts

**STYLE BLOCK** — append to every shot:

```
tactile close-up lifestyle footage, natural window light, shallow depth of
field, 50mm feel, subtle handheld movement, real domestic textures,
photorealistic, vertical 9:16, no text, no numbers, no screens, no user
interface, no graphics, no watermark
```

**CHARACTER BLOCK** — append to every shot. Minimal on purpose: mostly hands and
feet, so continuity levers are skin, nails and sleeves rather than a face.

```
a woman in her early 30s, natural minimal look, plain neutral clothing, no
jewellery, short unpainted nails
```

**NEGATIVE PROMPT (where supported):**

```
text, numbers, letters, UI, phone screen content, watermark, logos, brand
names, extra fingers, warped hands, clutter
```

### Shots — generate ~4s each, 3–4 variants, pick for hand/skin consistency

**P1 · scale**
> "Low tight angle, bare feet stepping onto a small bathroom scale on a tiled
> floor, early morning light, weight settling onto the scale, display not
> visible" + blocks

*Frame so the scale's display is out of frame or defocused — the number is
delivered by the app insert, never by the model.*

**P2 · water**
> "Close-up, a glass filling with water at a kitchen tap, one hand holding it
> steady, bright morning light, water catching the light" + blocks

**P3 · plate**
> "Top-down overhead shot, a hand sets a fork down on a nearly finished plate of
> food on a wooden table, midday light" + blocks

**P4 · laptop**
> "Side profile close-up, a hand closes a laptop lid on a desk, late afternoon
> light, unhurried motion" + blocks

**P5 · dumbbell**
> "Tight close-up, hands returning a dumbbell to a rack, home workout space,
> evening light, faint sheen of effort on the skin" + blocks

Five plates total (ad #1 needed seven). The payoff and end card are graphics.

---

## App inserts

Five full-screen inserts, ~0.5–0.6s each. Each shows **one row being captured**
— large, legible, unmistakable. These are generated locally, never by AI.

| # | Row | Chip |
|---|-----|------|
| 1 | Weight | `68.2 kg ▼` |
| 2 | Drink water | `6-day streak` |
| 3 | Log lunch | `540 kcal` |
| 4 | Prepare for meeting | `✓` |
| 5 | Workout | `✓ 45 min` |

**Reuse:** `../invisible-weight/organize/generate_textures.py` already renders
exactly this visual language — category accent bar plus the chip types
`time / kcal / streak / done / weight / rollover`. Adapt it rather than starting
over; the two ads should look like the same product.

**Payoff graphic (10.30–15.50):** the full day timeline, the five captured rows
among the rest, one row showing `↻ Tomorrow`. Same row art, assembled and
revealed.

---

## End card (15.50–20.00)

1. **HealthyFlow** (wordmark)
2. DM "FLOW" for early access.

Reuse `../invisible-weight/organize/generate_endcard.py`. Note ad #1's end-card
copy was cut down to this single CTA line — keep them consistent.

---

## Build order

Never work two layers at once. Stills → video → composite → picture lock → sound.

- [ ] **M1 — plates.** Generate P1–P5 in Kling. Normalize to 1080×1920/24fps/
      yuv420p (reuse `../invisible-weight/scripts/normalize.sh`).
- [ ] **M2 — app inserts.** Adapt `generate_textures.py`; render the five inserts
      plus the payoff timeline.
- [ ] **M3 — end card.** Reuse `generate_endcard.py`.
- [ ] **M4 — assemble.** New `scripts/assemble.sh` modelled on ad #1's, but far
      simpler: no Blender, no alpha overlay, no crossfade. Straight concat of
      beat/insert pairs + payoff + end card. Carry over `norm_linear` and the
      `vo` stage verbatim.
- [ ] **M5 — picture lock.** Per-second frame sweep before declaring anything
      done; that is what caught both of ad #1's invisible bugs.
- [ ] **M6 — sound.** VO (2 lines), taps, diegetic, music.

---

## What this ad deliberately doesn't do

- No face held across shots — that is where AI video breaks.
- No abstract metaphor layer. Ad #1 spent its whole runtime on one; this one
  shows the product doing the thing.
- No hard-silence beat, no freeze — those belong to ad #1.
- No competitor comparison.
