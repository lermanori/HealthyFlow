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
- [ ] M2 — Kling motion pass → `plates/`, then `scripts/normalize.sh` each **(you: Kling)**
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
- [ ] M5 — assembly: `scripts/assemble.sh spine|freeze|overlay|grade` (blocked on
      M1/M2 plates for `spine`; `overlay`/`grade` follow once spine exists)
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
