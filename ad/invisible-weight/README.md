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
      - **Fix 3 — real grade.** `grade` was only noise+vignette. There is now
        a single `LOOK` variable at the top of `assemble.sh` (colorbalance:
        teal-shifted shadows, warm highlights; eq: saturation 0.85, contrast
        1.03; plus the existing grain+vignette) applied identically in the
        `grade` stage and to S10 inside `final` — if the look changes,
        rebuild both stages or the timeline splits into two looks. S1 and
        the freeze hold inherit it automatically (sourced from the graded
        master's last frame). A `scripts/grade.cube` LUT still overrides the
        inline look if one is ever dropped in. Note: `organize/S9.mp4`'s
        backdrop is ungraded `stills/H7.png` baked into the Blender render —
        regrading it would need a texture regrade + re-render (not done;
        acceptable since S9 is a stylized UI moment).
      - **Fix 4 — S9 render was near-black (client "not working at all").** A
        per-second frame sweep of the master showed the whole organize
        sequence (~t=25–34s) and the S11 endcard rendering on near-black: the
        note cards and the H7 backdrop were several stops underexposed. Cause:
        `build_s9.py` shaded the card/backdrop planes with **Principled BSDF
        lit by a single weak area light**, so the flat UI art came through
        dark. Fix: make the materials **shadeless/emissive** — drive the
        texture into `Emission Color` (base color black, `Emission Strength`
        from `backdrop.dim_to` for the backdrop, 1.0 for cards) so every plane
        renders at its native brightness regardless of scene lighting. Also
        bumped `backdrop.scale` 9→18 (it was only filling a center strip),
        `dim_to` 0.35→0.55, and camera `fstop` 1.8→8.0 (the backdrop was so
        defocused it read as a dark smear). Re-render + re-encode:
        `blender -b blender/s9.blend -o //render/s9_ -F PNG -x 1 -a`,
        `ffmpeg -framerate 24 -i blender/render/s9_%04d.png -crf 16
        -pix_fmt yuv420p organize/S9.mp4`, then regenerate the endcard from
        the new settled frame:
        `python3 organize/generate_endcard.py blender/render/s9_0144.png
        organize/S11.mp4`, then `assemble.sh final`. Verified with a fresh
        per-second sweep t=25–38s — cards legible, timeline column + cyan
        chips + green check + amber rollover all read, endcard composite
        correct. `blender/render/` and `blender/test/` are gitignored.
      - **Fix 5 — first ~24s played as a single frozen frame.** The graded
        spine (`master_silent.mp4`) and `S10_graded.mp4` were **yuv444p** while
        every other segment (coldflash, freeze hold, S9, S11) was yuv420p:
        `libx264` preserves the decoded 4:4:4 unless told otherwise, and the
        two `grade`/S10 ffmpeg calls never forced a format. The `final` concat
        (`-c copy`) then produced a stream that switches pixel format
        mid-play; players init their decoder from the first (yuv420p) segment,
        can't decode the following yuv444p spine, and hold the last good frame
        — so the whole 1s coldflash + 22.25s spine read as one frozen frame
        until the yuv420p freeze hold resumed at ~23.25s. (4:4:4 H.264 is also
        outside the profiles QuickTime/Instagram will play.) Fix: added
        `-pix_fmt yuv420p` to the `grade` output and the S10 grade in `final`.
        Verified: all six segments now yuv420p, full-file decode is clean, all
        943 frames present, PTS continuous and monotonic across the old
        boundary. **Any new re-encode in this pipeline must force
        `-pix_fmt yuv420p`.**
      - **Fix 6 — S9 read as frozen + column too tall.** Two client notes on
        the organize section (~t=25–31s): (1) the backdrop looked frozen while
        only the cards moved, and (2) the settled timeline column was too tall
        with too much vertical gap between rows, overflowing the frame.
        Causes/fixes:
        - *Frozen:* S9's backdrop is a single H7 still by design, and it was
          the one segment with **no grain and no perceptible motion**. The
          Blender camera `drift_z` was only -0.35 (~3% push-in, imperceptible,
          same failure as the old freeze hold). Bumped `drift_z` -0.35→-0.7 for
          a visible slow push-in on the whole composition, and added a
          moving-grain pass to S9 in the `final` stage (`build/S9_graded.mp4` =
          `noise=alls=6:allf=t,vignette=PI/5` — grain+vignette only, no color
          shift, to keep the UI cards clean). Every frame now changes.
        - *Too tall:* measured the settled column at ~147px/row → 14 rows
          overflow the 1920px frame. Reduced `column.row_gap` 0.34→0.24 (~30%
          tighter) and nudged `top_y` 1.6→1.55 to re-center; the list now fits
          with top/bottom margins. Both are baked into the Blender layout, so
          this needs a re-render: `blender -b -P blender/build_s9.py` then the
          render/encode/endcard/`final` chain from Fix 4. Verified against
          frames t=25.5–31s.
      - **Fix 7 — killed the freeze frames; live climax (client: "i don't
        like the freeze frames at all").** The whole climax used to be frozen:
        a 2s held still (23–25s) then S9's organize playing over a *frozen* H7
        still (25–31s) — ~8s of dead picture. Reworked so nothing freezes:
        - `build_s9.py` gained a **transparent mode**
          (`backdrop.transparent: true` → `film_transparent`, RGBA out, skip
          the backdrop plane). S9 now renders the note-cards on **alpha**, not
          baked over a still.
        - The `final` stage composites those alpha cards over the **live S8
          plate slowed ~2×** (`setpts=2.0*PTS`; S8 is 3.04s, filling S9's 6s
          gives a reflective slow-mo and no loop seam), then applies the
          unifying `LOOK` over the whole composite — same `composite→grade`
          order as the spine, so S9's backdrop and cards match S8 in the spine
          and share its grain. She's alive/breathing behind the settling
          timeline.
        - **Deleted the 2s freeze hold** entirely — with a live climax it was
          dead weight. Spine now flows straight into S9 (one live→live cut).
          Master 39.29s → **37.29s**.
        - Camera `drift_z` dropped -0.7→-0.15 (cards stay a stable UI; the live
          plate carries the motion now). `row_gap` 0.24 kept (tight column).
        - S11 endcard regenerated from the new alpha settled frame
          (`s9_0144.png`) — its ghosted-column background now comes through the
          card alpha, cleaner over the dark ground.
        - Rebuild: `blender -b -P blender/build_s9.py` → render alpha PNGs →
          `generate_endcard.py blender/render/s9_0144.png organize/S11.mp4` →
          `assemble.sh final`. Verified t=22.5–31s: live motion throughout,
          uniform yuv420p, clean decode.
        - **Organize starts on the cut.** `converge_start_s` was 1.0, so S9's
          cards sat static in their scattered pose for the first second (plus
          per-card stagger) before moving — that static pre-roll read as the
          overlay "freezing" from ~23.5–25s. Set `converge_start_s` 1.0→0.0 and
          `stagger_s` 0.08→0.04 so convergence begins the instant the spine
          cuts to S9. Verified: card motion from the first S9 frame, no static
          hold.
        - **Still open (deferred):** S1 is still the 1s frozen cold-open flash
          — the client chose to decide that separately.
      - **Fix 8 — organize starts on the cut + endcard copy trimmed.**
        - The cards used to hold static in their scattered positions for the
          first ~1s of S9 (`converge_start_s: 1.0` + per-card stagger), so
          right after the spine→S9 cut (~23.5–25s) the overlay read as frozen.
          Set `converge_start_s` 1.0→0 and `stagger_s` 0.08→0.04 so convergence
          begins on the cut — cards fly in and organize immediately.
        - Endcard: dropped the "I'm looking for the first 10 people who want
          less noise and more control." lead-in; the CTA is now just
          `DM "FLOW" for early access.` (single centered line in
          `generate_endcard.py`).
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
