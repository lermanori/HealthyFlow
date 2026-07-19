# The Invisible Weight — ad production workspace

Cinematic 45s Instagram Reel for HealthyFlow (+ 15s Story cutdown).
Concept, script and plan live here; generated media stays local (gitignored).

- **PRODUCTION.md** — the director's script: beat map, 11-shot list, VO, sound cues
- **MILESTONES.md** — the build plan M0–M6 with acceptance criteria per step
- **prompts/prompts.txt** — copy-paste prompt bank (stills, Kling, VO)

## Status

- [x] M0 — workspace + spec locked (1080×1920, 24fps, yuv420p)
- [x] M1 — hero stills ✔ `stills/H1.png … H8.png`, all 1080×1920. Generated with
      Gemini 2.5 Flash Image ("nano banana") at gemini.google.com, one continuous
      chat thread — later prompts referenced "the exact same woman... next frame
      of the same film" rather than uploading a reference image (no reliable way
      to drive a native file-picker from the browser extension), and consistency
      held up well across all 8 without it. Contact-sheet checked: reads as one
      person, one day. **Gemini bakes a visible sparkle badge into a fixed pixel
      region near the bottom-right of every generation** (roughly
      (1215,2435)-(1375,2570) on the raw ~1536×2752 output) — removed with a
      clone-stamp from clean sweater fabric nearby; see `stills/_dewatermark.py`.
- [x] M2 — Kling motion pass ✔ `plates/S2.mp4, S3.mp4, S4.mp4, S5.mp4, S6.mp4,
      S8.mp4, S10.mp4`, all normalized to 1080×1920/24fps/yuv420p. Generated with
      Kling 3.0 (Start/End Frame mode) via openart.ai, one still-to-plate at a
      time, each normalized and renamed to its canonical filename immediately
      after download. Notes on the pass:
      - **Duration is a per-generation slider (1–10s), not a fixed 5s** — the UI
        looks like a static pill but is draggable/typeable; defaulted to 3s
        (720p, 105 credits) after the first couple shots to control cost.
      - **S4 (H3→H4, walk+sit) hallucinated a chair mid-shot** — Kling's
        Start/End interpolation has no anchor for objects absent from the start
        frame, so it invented one and it visibly solidified over ~1s instead of
        being established. Fix: split into two single-frame clips instead of one
        interpolated shot — `plates/S4.mp4` is H4 only ("she settles into her
        seat," chair already fully in frame, no interpolation ambiguity). The
        H3-only hallway-walk half (`plates/alt/S4a_walk.mp4`, 3s) was generated
        first and kept as an optional B-roll cutaway, but isn't wired into the
        spine — deemed redundant with S3 and cut for pacing. **If you use
        Start/End Frame mode again, keep both anchor frames' visible content
        consistent** (same objects in frame) or expect this same artifact.
      - **S7-S8 (H7 push-in) is saved as `plates/S8.mp4`**, not S7 — matches
        `assemble.sh freeze`'s hardcoded `plates/S8.mp4` reference, since the
        director's script treats S7→S8 as one continuous push-in, not two shots.
      - **S10 (H8 exhale) first take rendered visible breath/steam vapor** near
        her mouth — likely literal misreading of "exhales" compounded by
        thread-context bias (S2's prompt used "steam drifts up from the coffee"
        earlier in the same chat). Fixed by dropping "exhale" entirely from the
        prompt, describing only body language, and adding an explicit "no
        visible breath or steam" negative — verified clean by scrubbing the full
        clip before accepting.
- [x] M3 — notes layer: `notes/notes_master.json` generated ✔ (14 notes, beat-map
      timing). Regenerate after edits: `python3 notes/generate_lottie.py`.
      **Retimed once real footage existed** — `notes_config.json` originally
      assumed the planned ~30s pre-freeze runtime (shots at 4-6s each); actual
      Kling output came in at 22.25s (3-5s clips, cost-driven). Rescaled every
      `born` time and `freeze_at` by 22.25/30.0 (≈0.742) to match. If plates
      get regenerated at different durations, re-derive this scale factor
      against the new `build/spine.mp4` length and rerun both generators below.
- [x] M3b — notes rendered to alpha ✔ `notes/notes_master.webm` (VP9/yuva420p, 1080×1920
      @24fps, 22.25s, verified transparent and correctly timed against the real
      spine — see M5). No python-lottie available, so `notes/render_notes.py`
      rasterizes the same config directly with Pillow instead of going through
      the Lottie JSON. **Decoding this file requires forcing the alpha-aware
      decoder: `ffmpeg -c:v libvpx-vp9 -i notes_master.webm ...`** — ffmpeg's
      default native `vp9` decoder silently drops the alpha plane.
      `scripts/assemble.sh overlay` already does this correctly.
- [x] M4 (code) — Blender scene-builder ready: `blender -b -P blender/build_s9.py`
      (patched for Blender 5.1: `BLENDER_EEVEE_NEXT` enum and the layered-action
      `fcurves` API changed since the script was written)
- [x] M4 (art) — `organize/generate_textures.py` generates all 28 card/row PNGs
      (note_00–13, row_00–13) from `blender/s9_config.json`'s "rows" list — cyan
      time chips, one green check row (Drink water), one amber "↻ Tomorrow"
      rollover row (Finish project). S9 rendered ✔ `organize/S9.mp4` (6s,
      1080×1920, EEVEE) — `organize/textures/backdrop.png` is now `stills/H7.png`,
      so the real frozen close-up sits behind the organizing notes as designed.
      End card rendered ✔ `organize/S11.mp4` (5s) via `organize/generate_endcard.py`.
- [x] M5 — assembly: `scripts/assemble.sh spine|freeze|overlay|grade|final` ✔
      `build/master_full_silent.mp4` (40.3s, silent). Ran the full chain:
      - `spine` — **S2→S3→S4→S5→S6→S8 only (22.25s), not S10.** S9 (organize)
        and S10 (release) come narratively *after* the freeze, not straight
        after S8 — the beat map is S1(freeze)→S9(organize)→S10(release)
        →S11(end card), so S10 can't just be concatenated onto the pre-freeze
        spine. Fixed two bugs while running it: (1) the concat demuxer
        resolves relative paths in the list file relative to the list file's
        own directory (`build/`), not the caller's cwd, so `plates/S2.mp4`
        entries silently failed to open — now writes absolute paths; (2)
        `plates/S*.mp4` glob sorts lexically (`S10.mp4` before `S2.mp4`) —
        `ls -v` doesn't fix this on macOS (BSD `ls -v` isn't GNU natural sort,
        it means something else entirely) — replaced with a hardcoded
        canonical shot order.
      - `freeze` — ran at `T=2.9` (near the end of S8's push-in — the default
        `T=4.5` assumes the original 5s S8, ours is 3.04s). Its outputs
        (`S8_ramped.mp4`, `S8_hold.mp4`) ended up unused (see `final` below);
        `build/freeze_frame.png` is still worth keeping as an early thumbnail
        reference (undesaturated, pre-grade).
      - `overlay` — `build/composited.mp4`, spine + notes. Confirmed by
        scrubbing that note count/timing tracks the beat map (0 during the
        pour, a handful by the phone check, ~14 crowding the frame by the
        close-up push-in).
      - `grade` — `build/master_silent.mp4` (22.25s), noise+vignette (no
        `grade.cube` LUT present, used the documented fallback).
      - **`final` (new stage, not in the original script)** — stitches the
        complete silent timeline: S1 cold flash + graded/note-composited spine
        + freeze hold + `organize/S9.mp4` + graded `plates/S10.mp4` +
        `organize/S11.mp4`. This didn't exist before — `spine`/`freeze`
        /`overlay`/`grade` only ever built the pre-freeze portion. Notably,
        **S1 and the freeze hold are sourced from `master_silent.mp4`'s own
        last frame**, not `freeze` stage's `build/freeze_frame.png` — S1 is
        specified as "freeze frame from S8 with full note composite," which
        doesn't exist until *after* `overlay`+`grade` run, so the original
        `freeze` stage's output was the wrong source for it. Verified frame-by
        -frame across all 6 segments (S1 → spine → hold → S9 → S10 → S11) —
        transitions and note timing are all correct. Total 40.3s vs. the
        planned 45s — short because plates were generated at 3-5s each rather
        than the originally scoped 4-6s (see M2).
- [x] M5.1 — Tier 1 client fixes (feedback: "at second 24 the video freezes…
      too much AI vibe"):
      - **Fix 1 — live freeze hold.** The 3s `build/freeze_hold.mp4` was a
        looped still and read as a broken/frozen player. Replaced in the
        `final` stage with a 2s hold that has a ~3% `zoompan` push-in plus
        temporal grain (`noise=alls=4:allf=t`) so the frame keeps breathing.
        Gotcha: **upscale 2x (`scale=2160:3840`) before `zoompan`** — zoompan
        crops on integer pixel coordinates, so at native res the sub-pixel
        drift quantizes into visible stepping. Master is now 39.29s.
      - **Fix 2 — note declutter.** Several notes sat directly on her face in
        the S8 close-up/freeze (Dentist and Log lunch on the forehead, Buy
        groceries in her hair) and the top cluster overlapped card-on-card.
        Repositioned 7 notes in `notes_config.json` — all `born` times kept
        (the ×0.742 retime is untouched). Layout rule used: face oval
        x 350–750 / y 350–900 stays empty; x/y in the config are the **card
        center** (see `render_notes.py`), cards are ~96px tall with
        half-widths 120–190px, so centers must clear the oval by the card's
        half-extent. Top band cards sit at y=310 (birth rise 14px + bob 8px
        keeps the card just inside the 250px top safe zone). Verified against
        extracted frames at t=20.5/22.5/24 of the rebuilt master.
- [ ] M6 — VO + stems in `audio/`, then `assemble.sh audio` and `cutdown`
      (both stages now target `build/master_full_silent.mp4`, not
      `master_silent.mp4`, since audio needs to cover the complete timeline)

## Pipeline

```
image gen ──> stills/H1..H8 ──> Kling i2v ──> plates/S*.mp4 ──> normalize.sh
                                                                    │
notes_config.json ─> generate_lottie.py ─> alpha render ──────> assemble.sh
                                                                (spine → freeze
s9_config.json ───> build_s9.py ─> s9.blend ─> render ─────────  → overlay →
                                                                 grade → audio
audio stems + VO ──────────────────────────────────────────────  → cutdown)
```

Everything except M1/M2 (image + video generation) and the audio stems is
scriptable — configs in JSON, one command per stage.
