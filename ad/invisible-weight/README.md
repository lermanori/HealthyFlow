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
- [ ] M3b — render notes to alpha (`notes_master.webm` or PNG seq) for compositing
- [x] M4 (code) — Blender scene-builder ready: `blender -b -P blender/build_s9.py`
- [ ] M4 (art) — export card/row textures to `organize/textures/`, render S9 + end card
- [ ] M5 — assembly: `scripts/assemble.sh spine|freeze|overlay|grade`
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
