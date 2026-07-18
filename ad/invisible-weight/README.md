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
      timing, freeze at 0:30). Regenerate after edits: `python3 notes/generate_lottie.py`
- [x] M3b — notes rendered to alpha ✔ `notes/notes_master.webm` (VP9/yuva420p, 1080×1920
      @24fps, verified transparent). No python-lottie available, so
      `notes/render_notes.py` rasterizes the same config directly with Pillow instead
      of going through the Lottie JSON. **Decoding this file requires forcing the
      alpha-aware decoder: `ffmpeg -c:v libvpx-vp9 -i notes_master.webm ...`** —
      ffmpeg's default native `vp9` decoder silently drops the alpha plane.
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
- [ ] M5 — assembly: `scripts/assemble.sh spine|freeze|overlay|grade`. Unblocked
      now that all M1/M2 plates exist — not yet run.
- [ ] M6 — VO + stems in `audio/`, then `assemble.sh audio` and `cutdown`

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
