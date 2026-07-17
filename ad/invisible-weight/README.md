# The Invisible Weight — ad production workspace

Cinematic 45s Instagram Reel for HealthyFlow (+ 15s Story cutdown).
Concept, script and plan live here; generated media stays local (gitignored).

- **PRODUCTION.md** — the director's script: beat map, 11-shot list, VO, sound cues
- **MILESTONES.md** — the build plan M0–M6 with acceptance criteria per step
- **prompts/prompts.txt** — copy-paste prompt bank (stills, Kling, VO)

## Status

- [x] M0 — workspace + spec locked (1080×1920, 24fps, yuv420p)
- [ ] M1 — hero stills H1–H8 → `stills/` **(you: image generation)**
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
      1080×1920, EEVEE, backdrop uses the flat placeholder fallback since H7
      doesn't exist yet — rebuild once the real still lands). End card rendered
      ✔ `organize/S11.mp4` (5s) via `organize/generate_endcard.py`.
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
