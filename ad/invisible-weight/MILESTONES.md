# The Invisible Weight — Build Plan
### Milestones with copy-paste prompts · image gen → Kling → Lottie → Blender → ffmpeg

Work order matters: stills are locked before any video is generated, video is locked before any compositing, picture is locked before any sound. Never work on two layers at once.

---

## The two reusable blocks

Append these to **every** image prompt. Consistency comes from repetition, not luck.

**STYLE BLOCK**
```
cinematic lifestyle commercial still, soft natural window light, muted warm
palette with cool teal shadows, shallow depth of field, 35mm lens, realistic
modern apartment, quiet premium mood, generous negative space, vertical 9:16,
photorealistic, no text, no graphics, no watermark
```

**CHARACTER BLOCK**
```
a woman in her early 30s, shoulder-length dark hair, plain sage-green crewneck
sweater, natural minimal makeup, calm neutral expression
```

**Negative prompt (where supported):**
```
text, letters, UI, phone screen content, neon, cyberpunk, dramatic expression,
crying, smiling broadly, extra fingers, warped face, busy background, clutter
```

---

## M0 — Setup (30 min)

- [ ] Create the working tree:
  ```
  ad/
    stills/        # hero keyframes (M1)
    plates/        # Kling outputs (M2)
    notes/         # Lottie renders w/ alpha (M3)
    organize/      # Blender S9 renders + end card (M4)
    audio/         # stems + VO (M6)
    build/         # ffmpeg outputs
  ```
- [ ] Lock the spec now: **1080×1920, 24 fps, yuv420p**. Everything gets normalized to this before assembly.
- [ ] Copy the two blocks above into a `prompts.txt` you paste from every time.

**Done when:** folders exist, spec written down.

---

## M1 — Hero still set (the continuity milestone)

Generate stills only. Iterate ruthlessly here — this is the cheapest place to fix face, light, and framing, and the last chance to do so. Generate 4–8 variants per still, pick for **same face + same light**, not per-image beauty. If your image tool supports a character/style reference, generate `H1` first and reference it in all others.

| ID | Still | Prompt (prepend CHARACTER, append STYLE block) |
|---|---|---|
| **H1** | Kitchen — coffee pour | `pouring coffee from a moka pot into a ceramic mug at a bright kitchen counter, steam rising, morning sunlight through sheer curtains, seen from a slight side angle, medium shot, upper third of frame empty` |
| **H2** | Kitchen — phone check | `leaning against the kitchen counter looking down at her smartphone held in one hand, other hand around the mug, soft window light, medium close-up, slight pensive pause, upper third of frame empty` |
| **H3** | Hallway — walking (start frame) | `walking down a sunlit apartment hallway carrying a coffee mug, plants along the wall, relaxed pace, full body, camera at chest height, left half of frame open` |
| **H4** | Desk — seated (end frame for the walk) | `sitting down at a tidy home office desk with a closed laptop, placing the mug beside it, warm daylight from a window on the left, medium wide, space above and around her head` |
| **H5** | Desk — typing, distracted | `typing on a laptop at the desk, caught mid-pause staring slightly past the screen with a blank distracted micro-expression, hands still on the keyboard, medium shot over the desk` |
| **H6** | Kitchen — water refill (wide) | `wide shot refilling a glass of water at the kitchen sink, midday light, small figure in the lower half of the frame, large amounts of empty wall and air around her` |
| **H7** | Desk — weary close-up (freeze frame) | `close-up seated at the desk holding her phone loosely, weary but composed expression, eyes looking just past the camera, slightly tense shoulders, late-afternoon warm light, shallow focus` |
| **H8** | Desk — the exhale (relief) | `close-up, exhaling slowly with shoulders visibly dropping, expression softening into quiet relief, faint beginning of a smile, warm golden light, serene` |

- [ ] All 8 picked, same face/sweater/apartment, saved as `stills/H1.png … H8.png`
- [ ] Sanity check: put them side by side — do they read as *one person, one day*? If not, regenerate the outliers before proceeding.

**Done when:** the 8-up contact sheet looks like one film.

---

## M2 — Kling motion pass (image-to-video)

Use **image-to-video with the still as first frame**; use **first+last frame** where the shot travels (S4). Kling motion prompts should describe *motion only* — the image already carries the look. Keep them short; long prompts cause drift. Generate 2–3 takes per shot, judge on face stability first.

| Shot | Input | Duration | Kling motion prompt |
|---|---|---|---|
| S2 | first: H1 | 4s | `slow smooth dolly push-in, steam drifts up from the coffee, she finishes pouring and lifts the mug slightly, subtle natural body movement, camera glides forward slowly` |
| S3 | first: H2 | 4s | `she glances at the phone, small exhale, turns the phone face down on the counter, minimal camera drift, calm natural motion` |
| S4 | first: H3 → last: H4 | 5–6s | `she walks down the hallway and sits at the desk, smooth lateral tracking camera follows her, steady pace, natural walk` |
| S5 | first: H5 | 5s | `she types, pauses mid-motion staring blankly for two seconds, then resumes typing, camera static, very subtle handheld breathing` |
| S6 | first: H6 | 5s | `wide static shot, she fills the glass, turns off the tap, takes a sip, unhurried movements, camera locked` |
| S7→S8 | first: H7 | 5s | `very slow push-in toward her face, she barely moves, blinks once, gaze fixed just past camera, tension held still` — **or skip Kling: do this as a Blender/2.5D push-in on H7** (recommended; steadier) |
| S10 | first: H8 | 4s | `she exhales, shoulders drop and relax, expression softens, slight settle of posture, gentle warmth, camera almost still` |

- [ ] Save picks to `plates/S2.mp4 …` — then **normalize immediately**:
  ```
  ffmpeg -i in.mp4 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24" \
    -c:v libx264 -crf 16 -pix_fmt yuv420p plates/S2.mp4
  ```
- [ ] Rough-cut the spine to the beat map (any editor, or ffmpeg concat) and watch it *without any notes or sound*. The human story must already work naked.

**Done when:** a 40s silent rough cut of plates exists and the timing feels right.

---

## M3 — Notes layer (Lottie → alpha overlay)

The 14 notes, their birth times (relative to the master timeline), and where they live:

| # | Text | Born at | # | Text | Born at |
|---|---|---|---|---|---|
| 1 | Dentist at 3 PM | 0:05 | 8 | Drink water | 0:18 |
| 2 | Reply to Alex | 0:09 | 9 | Finish project | 0:20 |
| 3 | Buy groceries | 0:10.5 | 10 | Schedule appointment | 0:21 |
| 4 | Workout | 0:12 | 11 | Log lunch | 0:22 |
| 5 | Call Mom | 0:14.5 | 12 | Prepare for meeting | 0:23 |
| 6 | Pay rent | 0:16 | 13 | Answer email | 0:24 |
| 7 | Go to the gym | 0:17 | 14 | Call family | 0:25 |

Design rules: off-white translucent rounded card, clean sans, birth = 300ms fade + 4px rise, idle = 2–3px sine bob with a random phase per note, newer notes larger/sharper, older ones drift back and soften.

If you're using a text2lottie tool, prompt per note (or per stage):
```
minimal off-white rounded rectangle card (12px radius, 92% opacity, soft drop
shadow) with the text "Dentist at 3 PM" in a clean dark grey sans-serif,
fade in over 300ms while rising 4px, then loop a gentle vertical bob of 3px
over 3 seconds, transparent background, 1080x1920 canvas
```
…but the better path: **ask me — I'll generate the master Lottie JSON directly** with all 14 notes on the beat-map timing, positions per shot, and the hallway "follow" keyframes. One file, fully editable.

- [ ] Render to alpha: Lottie → PNG sequence or `libvpx-vp9` WebM with `yuva420p` → `notes/notes_master.webm`
- [ ] Test-composite over the rough cut: `ffmpeg -i spine.mp4 -i notes_master.webm -filter_complex overlay build/test1.mp4`

**Done when:** the rough cut plays with the note cloud escalating 1→4→8→12→14 on the beat map, text crisp.

---

## M4 — The organization (S9) + end card

The payoff shot. Blender, ~30 textured planes, one camera, f-curves.

- [ ] Export each note card as a PNG (from the Lottie assets) — these become plane textures.
- [ ] Build the scene: notes scattered in 3D around the frozen H7 close-up (use H7 as a backdrop plane), camera slowly drifting; at 0:33 all notes ease toward a single column, decelerating (ease-out, ~2.5s), snapping softly into a vertical stack.
- [ ] As each lands, swap its texture to a **timeline-row version**: deep teal-black card `#071219`, cyan time chip `#22D3EE`, one row with a green `#4ADE80` check, one amber `#FBBF24` row labeled `rolls to tomorrow ↻`. Use your real app's row layout — this is the only product image in the ad.
- [ ] Shallow depth of field (f/2 equivalent), 24fps, render 6s → `organize/S9.mp4`.
- [ ] End card (S11): static or near-static comp — `#071219` ground, the settled column at 20% opacity behind, type on: **HealthyFlow** → *Take back control of your day.* → small: *I'm looking for the first 10 people who want less noise and more control. DM "FLOW" for early access.* (Lottie or Blender, 4–5s.)
- [ ] If you want, I'll write the **Blender Python scene-builder** so note positions/timings come from a JSON config instead of hand-keyframing.

**Done when:** S9 gives you the little "ahh" feeling on loop, and the end card is readable on a phone at arm's length.

---

## M5 — Assembly + grade (ffmpeg)

- [ ] Freeze at 0:30: extract the exact frame from S8 and hold it — `-vf "tpad=stop_mode=clone:stop_duration=3"` on a trimmed S8, or loop the extracted PNG.
- [ ] Speed-ramp the last second before the freeze: `setpts` 1.0→0.7× (subtle).
- [ ] Concat: S1(=frozen frame, 1s) + S2…S8 + freeze + S9 + S10 + S11.
- [ ] Cohesion pass over the whole cut — one LUT + grain + vignette:
  ```
  ffmpeg -i cut.mp4 -vf "lut3d=grade.cube,noise=alls=6:allf=t,vignette=PI/5" \
    -c:v libx264 -crf 16 build/master_silent.mp4
  ```
- [ ] Watch it silent, full screen, on your phone. Fix pacing now — audio hides nothing.

**Done when:** the silent master looks like one film, not stitched clips.

---

## M6 — Audio, VO, and finals

**VO** — two lines. ElevenLabs-style direction prompt:
```
Calm, low, close-miked voice, mid register, conversational and unhurried, like
someone talking quietly to a friend late at night. No announcer energy.
Line 1: "The hardest part of modern life isn't doing everything."
[3 second pause]
Line 2: "It's remembering everything."
```
Settings: stability high, style low. Generate 5 takes, pick the flattest calm one.

**Stems** (place with `adelay`, mix with `amix`):
- [ ] Room tone + birds + coffee pour (record your own kitchen — beats stock)
- [ ] One birth-sound per note at its timestamp — rotate vibration / ping / chime / whoosh, never the same twice in a row
- [ ] Low drone rising 0:24→0:30 (volume envelope)
- [ ] **Hard silence at 0:30.000** — cut *everything*, including room tone, sample-accurate
- [ ] One soft tactile lock-in sound at ~0:35 (felt piano note / soft "thock") — audition ten, keep the one you can *feel*
- [ ] Warm resolved music bed entering ~0:36, resolving on a sustained chord under the end card

- [ ] Mux, then loudness-normalize for social: `ffmpeg -i master.mp4 -af loudnorm=I=-14:TP=-1.5 build/master_final.mp4`
- [ ] **15s Story cutdown:** frozen frame (2s) → VO line 1 → S9 organization (5s) → VO line 2 → end card (5s). Same audio rules.
- [ ] QA on a phone, sound ON and sound OFF (most Reels start muted — the notes must carry the story silently), captions if any VO isn't subtitled.

**Done when:** master + cutdown exported, watched on a phone both muted and unmuted, and the silence at 0:30 makes *you* exhale.

---

## Suggested calendar (solo, evenings)

| Evening | Milestone |
|---|---|
| 1 | M0 + M1 (stills are the whole game — give them a full session) |
| 2 | M2 (Kling passes + silent rough cut) |
| 3 | M3 (notes layer) — ask me for the Lottie JSON to shortcut this |
| 4 | M4 (Blender S9 + end card) — ask me for the scene-builder script |
| 5 | M5 + M6 (assembly, grade, sound, finals) |
