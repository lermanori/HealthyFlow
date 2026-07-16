# The Invisible Weight — Production Script
### HealthyFlow · Cinematic Instagram ad · 45s master (9:16)

**Logline:** A functional person moves through an ordinary morning while floating notes — everything they must remember — quietly multiply around them, until silence falls and the chaos organizes itself into HealthyFlow.

**Emotional promise:** *Take back control of your day.*

---

## Format decisions

| Decision | Choice | Why |
|---|---|---|
| Placement | **Reel** (master), Story = 15s teaser cutdown | The arc needs 40–50s to breathe; Stories cap engagement at ~15s/frame and would chop the build |
| Length | 45 seconds | Long enough for the overload to accumulate, short enough for Reels completion rates |
| Aspect | 9:16, 1080×1920 | Native vertical |
| Dialogue | VO only, 2 lines | The brief's silence is the star — protect it |
| Text on screen | Notes + end card only | Per the brief: no feature callouts, no UI tour |

**The retention problem to solve:** Reels punish slow openings. The fix is *not* to speed up the arc — it's to open with a 1-second cold flash of the climax (the character surrounded by notes, frozen) before cutting to the calm morning. Viewers subconsciously know chaos is coming, which buys you the slow build.

---

## Beat map (45s)

| Time | Beat | Feeling |
|---|---|---|
| 0:00–0:01 | Cold flash: frozen overload frame | curiosity hook |
| 0:01–0:08 | Ordinary morning | familiar calm |
| 0:08–0:14 | First notes appear | small interruptions |
| 0:14–0:24 | Notes multiply, follow through rooms | growing load |
| 0:24–0:30 | Crowded frame, layered sound | overload |
| 0:30–0:33 | Freeze. Total silence. VO line 1 | silence |
| 0:33–0:39 | Notes drift together, organize into one clean structure | organization |
| 0:39–0:45 | End card, VO line 2, resolved music | relief |

---

## Shot list with AI-generation prompts

> **Critical workflow note — read before generating:** Do **not** ask the video model to render the floating notes. AI video renders legible text badly and inconsistently. Generate **clean footage of the character only**, then composite the notes in post (CapCut / After Effects / DaVinci). This gives you: readable text, control over timing and count, and one consistent note style across every shot. All prompts below therefore describe *empty* space where notes will live.

**Consistent style block** — append to every prompt:

> *Cinematic lifestyle commercial, soft natural window light, muted warm palette with cool teal shadows, shallow depth of field, 35mm lens feel, slow controlled camera movement, realistic apartment interior, no text, no graphics, filmed like a high-end brand film. Vertical 9:16.*

**Consistent character block** — append to every prompt (adjust to taste, keep identical across shots):

> *A woman in her early 30s, shoulder-length dark hair, plain sage-green crewneck sweater, calm neutral expression, natural minimal look.*

*(One character, one outfit, one location = the cheapest way to fake continuity with AI video. Morning-to-desk in the same apartment reads as one day.)*

### Shots

**S1 · 0:00–0:01 · Cold flash (reuse of S8 frame)**
Freeze frame from S8 with full note composite, desaturated 10%, hard cut out. No generation needed — it's a still from S8.

**S2 · 0:01–0:04 · Waking / kitchen**
- *Action:* She pours coffee at the counter, morning light through the window. Slow push-in.
- *Prompt:* "Slow dolly push-in on a woman pouring coffee into a ceramic mug at a bright kitchen counter, steam rising, morning sunlight through sheer curtains, relaxed unhurried movement" + style + character blocks.
- *Sound:* coffee pour, birds faint, room tone.

**S3 · 0:04–0:08 · Phone check**
- *Action:* Leaning on the counter, she glances at her phone, small exhale, puts it face-down. First hint of "remembering something."
- *Prompt:* "Medium close-up, a woman leans against a kitchen counter checking her smartphone, slight pause, places the phone face down, soft window light, quiet domestic moment" + blocks.
- *Sound:* single soft phone vibration (this vibration is the *first note trigger* in post).
- *Post:* **Note 1 fades in** upper third: `Dentist at 3 PM`.

**S4 · 0:08–0:14 · Walking to desk**
- *Action:* She carries the mug down a hallway to a desk, sits. Camera tracks laterally, calm.
- *Prompt:* "Smooth lateral tracking shot, a woman carries a coffee mug down a sunlit apartment hallway and sits at a tidy home office desk, plants, laptop closed, natural light" + blocks.
- *Sound:* footsteps, chair, one message ping, one calendar chime.
- *Post:* Notes 2–4 appear in her wake, trailing her through the hallway: `Reply to Alex` · `Buy groceries` · `Workout`. They *follow* — parented loosely to her movement, lagging half a second behind.

**S5 · 0:14–0:19 · Working, notes accumulating**
- *Action:* She types, pauses mid-motion, stares at nothing for a beat (forgot what she was doing), resumes.
- *Prompt:* "Static medium shot over a desk, a woman typing on a laptop pauses mid-motion staring blankly for a moment before resuming, subtle tired micro-expression, soft daylight" + blocks.
- *Sound:* keyboard, overlapping: vibration, ping, second calendar alert. Room tone starts thinning.
- *Post:* Notes 5–8: `Call Mom` · `Pay rent` · `Answer email` · `Drink water`. They now occupy the middle third, gently bobbing.

**S6 · 0:19–0:24 · Kitchen return — the notes came too**
- *Action:* She refills water, and the frame is noticeably populated. She doesn't react to the notes — that's the point.
- *Prompt:* "Wide shot, a woman refills a glass of water at the kitchen sink, calm functional movements, generous negative space around her, midday light" + blocks. *(Ask for negative space explicitly — you need room for the composite.)*
- *Sound:* +2 more layers: email whoosh, second vibration pattern. Sounds begin overlapping without gaps.
- *Post:* Notes 9–12: `Finish project` · `Schedule appointment` · `Log lunch` · `Prepare for meeting`. Older notes drift closer to her.

**S7 · 0:24–0:28 · Crowded**
- *Action:* Back at the desk, phone in hand, slow push-in begins. Her shoulders are slightly higher than in S2 — quiet tiredness, not panic.
- *Prompt:* "Slow push-in, a woman sits at her desk holding her phone loosely, weary but composed expression, slightly tense shoulders, late-afternoon warm light, melancholic quiet mood" + blocks.
- *Sound:* full stack — 6+ overlapping notification layers, keyboard ghosts, a low almost-subliminal room drone rising. Uncomfortable but never distorted.
- *Post:* All ~14 notes now ring her, edges of the frame crowded, notes overlapping each other, subtle slow drift inward.

**S8 · 0:28–0:31 · The freeze**
- *Action:* Push-in continues to a close-up. She stops. Looks slightly past camera. Everything freezes on her blink.
- *Prompt:* "Continuing slow push-in to close-up, a woman stops moving and gazes just past the camera with a tired, mentally overloaded but composed expression, shallow focus, held stillness" + blocks.
- *Sound:* the stack peaks — then **hard cut to absolute silence** at 0:30. No room tone. Nothing.
- *Post:* Notes freeze mid-drift. Grade this frame slightly cooler. **This frozen frame is also your S1 cold-open and your ad thumbnail.**
- **VO (0:31, calm, unhurried):** *"The hardest part of modern life isn't doing everything."*

**S9 · 0:31–0:37 · The organization**
- *Action:* Pure motion-graphics beat over the frozen close-up (or a clean plate of the desk): the notes glide toward one point, align, stack, and settle into a single clean structure — a day. One column, ordered by time, the HealthyFlow timeline silhouette.
- *Build:* No AI video here — animate the same note comps in After Effects/CapCut: ease-in-out curves, notes decelerating into place, chaos → grid. As they settle, each note reshapes into a timeline row (time chip + title). Use the app's real look: deep teal-black card, cyan `#22D3EE` time chips, green check on one completed row, one amber row marked *rolls to tomorrow ↻* — the product truth inside the metaphor.
- *Sound:* one soft, deeply satisfying sound as they lock in — a single felt-piano note or a soft "thock." Then warm resolved music bed fades in.
- **VO (0:35):** *"It's remembering everything."*

**S10 · 0:37–0:41 · Release**
- *Action:* Unfreeze. She exhales, shoulders drop, the faintest smile — softening, not celebration. She looks back at her laptop, present again.
- *Prompt:* "Close-up, a woman exhales slowly, shoulders visibly relaxing, expression softening into quiet relief, warm golden light, serene atmosphere" + blocks.
- *Sound:* birds return, room tone returns — the world sounds like S2 again. Music warm and resolved.

**S11 · 0:41–0:45 · End card**
- Deep teal-black ground (`#071219`), the organized timeline structure from S9 gently settling at 20% opacity behind.
- Type on: **HealthyFlow** (logo/wordmark) → beat → **Take back control of your day.**
- Final line, small, human: *I'm looking for the first 10 people who want less noise and more control. DM "FLOW" for early access.*
- *Sound:* music resolves on a single sustained warm chord.

---

## Voiceover direction

Two lines, ~4 seconds of speech total. Delivery: low, close-mic'd, conversational — a person, not an announcer. The pause between the lines is doing the work; do not rush it. Record 5 takes, pick the one that sounds most like someone talking to a friend at midnight.

> "The hardest part of modern life isn't doing everything." *(3-second pause — the notes are organizing)* "It's remembering everything."

If you generate the VO (ElevenLabs etc.): mid-register voice, stability high, style low — you want flat calm, not performance.

## Sound design cue sheet

| Time | Layer in | Note |
|---|---|---|
| 0:01 | Room tone, birds, coffee pour | Real foley beats stock — record your own kitchen |
| 0:05 | Phone vibration #1 | Every note gets a birth-sound; vary them (vibration, ping, chime, whoosh) |
| 0:08–0:24 | +1 notification layer per note | Never louder — *denser*. Compress the bed so it thickens instead of peaking |
| 0:24–0:30 | Low drone rises under the stack | The pressure the viewer feels but can't name |
| 0:30 | **Hard silence** | Cut everything including room tone. 1 full second before VO |
| 0:35 | One soft lock-in sound | The single most important sound in the ad — make it tactile |
| 0:36–0:45 | Warm resolved music bed | Enters *after* organization begins, never before |

## Note design (the composite layer)

- One consistent style: soft off-white cards, slightly translucent, rounded 12px, subtle drop shadow, handwritten-adjacent clean sans — they should read as *thoughts*, not UI notifications.
- Birth animation: 300ms fade + 4px drift up. Death: none — they never disappear until the organization.
- Idle behavior: slow 2–3px bob on offset cycles so the cloud feels alive.
- Scale hierarchy: newer notes slightly larger and sharper; older ones drift back and soften — memory decay, literally.
- Count discipline: 1 → 4 → 8 → 12 → ~14. Never more; crowded is a feeling, not a wall of text.

## Build workflow (solo, ~2–4 evenings)

1. **Generate S2–S8, S10** with an AI video model (Veo, Kling, Runway…) using the shared style + character blocks. Generate 3–4 variants per shot; pick for *consistency of face and light* over individual shot beauty. If the model supports image-to-video, generate one hero still of the character first and drive every shot from it — best continuity lever available.
2. **Cut the spine** in CapCut/DaVinci to the beat map, lock timing before any compositing.
3. **Composite notes** as a single overlay pass across shots — same style, escalating count.
4. **Build S9 + S11** as motion graphics from your app's real palette and timeline rows.
5. **Sound pass last**, from the cue sheet. The silence at 0:30 and the lock-in at 0:35 are the two moments to obsess over.
6. **Cutdowns:** 15s Story teaser = S8 freeze (2s) → VO line 1 → S9 organization (5s) → VO line 2 → end card (5s). The Story links viewers to the full Reel.

## What this ad deliberately doesn't do

No feature list, no screen recording, no pricing, no "AI-powered." One product image total (the organized timeline), on screen for ~8 seconds. The ad sells the *feeling of the problem*; the DM conversation sells the app. That's also why the CTA is a one-word DM — it hands you the warm conversation your 10-tester plan runs on.
