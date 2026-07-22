#!/usr/bin/env bash
# Assemble the 45s master from normalized plates + overlays.
# Stages (run in order as assets become ready):
#   ./assemble.sh spine     — concat plates to the beat map (needs plates/S*.mp4)
#   ./assemble.sh freeze    — build S8 freeze + speed ramp
#   ./assemble.sh overlay   — composite the notes layer (needs notes render)
#   ./assemble.sh grade     — LUT + grain + vignette cohesion pass
#   ./assemble.sh final     — stitch S1 + graded spine + freeze hold + S9 + S10 + S11
#   ./assemble.sh audio     — mix stems + VO, loudness-normalize (needs audio/)
#   ./assemble.sh cutdown   — 15s Story teaser from the master
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build

# The one unifying look (PRODUCTION.md palette: "muted warm palette with cool
# teal shadows"). Must be applied identically everywhere real footage appears:
# the `grade` stage (spine) and the `final` stage (S10) — if this changes,
# rebuild BOTH or the timeline splits into two looks.
LOOK="colorbalance=rs=-0.06:gs=0.02:bs=0.10:rh=0.06:gh=0.015:bh=-0.07,eq=saturation=0.85:contrast=1.03,noise=alls=6:allf=t,vignette=PI/5"

case "${1:-}" in

spine)
  # Beat map: S1 cold flash (1s, from freeze frame) + S2..S8. Trim durations here.
  # S1 requires build/freeze_frame.png (made by the freeze stage) — run once
  # without S1, pick the freeze frame, then rebuild.
  # Canonical beat-map order, S2..S8 only (ends at the freeze). S7 folds into
  # S8's push-in. S1 (cold flash), S9 (organize), S10 (release) and S11 (end
  # card) are NOT part of this stage -- S1/S9/S11 are motion graphics or reuse
  # the freeze frame, and S10 comes narratively *after* S9's organize
  # sequence, not straight after S8 -- they're joined in a later custom stitch.
  # Hardcoded rather than glob-sorted: plain glob sorts lexically (S10 before
  # S2), and macOS's BSD `ls -v` isn't GNU natural sort so it doesn't fix that.
  SHOTS="S2 S3 S4 S5 S6 S8"
  : > build/concat.txt
  for s in $SHOTS; do
    f="plates/$s.mp4"
    [ -f "$f" ] || { echo "missing $f -- put normalized Kling clips in plates/ first"; exit 1; }
    # Absolute paths: the concat demuxer resolves relative entries relative to
    # the list file's own directory (build/), not our cwd.
    printf "file '%s/%s'\n" "$(pwd)" "$f" >> build/concat.txt
  done
  ffmpeg -y -f concat -safe 0 -i build/concat.txt -c copy build/spine.mp4
  echo "-> build/spine.mp4  (watch it silent; fix pacing before anything else)"
  ;;

freeze)
  # Pick the freeze moment (default 4.5s into S8), extract the frame, build:
  # ramped last second (1.0 -> ~0.7x) + 3s hold.
  T="${2:-4.5}"
  ffmpeg -y -ss "$T" -i plates/S8.mp4 -frames:v 1 build/freeze_frame.png
  ffmpeg -y -i plates/S8.mp4 -vf "trim=0:$T,setpts=PTS/if(gte(T\,$T-1)\,1.3\,1)" \
    -c:v libx264 -crf 16 build/S8_ramped.mp4
  ffmpeg -y -loop 1 -i build/freeze_frame.png -t 3 -r 24 \
    -vf format=yuv420p -c:v libx264 -crf 16 build/S8_hold.mp4
  echo "-> build/freeze_frame.png (also the S1 cold flash + ad thumbnail)"
  ;;

overlay)
  # Composite the notes layer over the spine. notes_master.webm must be a
  # VP9 alpha render of notes/notes_master.json (or a PNG sequence).
  ffmpeg -y -i build/spine.mp4 -c:v libvpx-vp9 -i notes/notes_master.webm \
    -filter_complex "[0:v][1:v]overlay=0:0:format=auto" \
    -c:v libx264 -crf 16 build/composited.mp4
  echo "-> build/composited.mp4"
  ;;

grade)
  # One look across everything glues mismatched AI footage together.
  # Drop a grade.cube LUT next to this script, or skip the lut3d filter.
  LUT="scripts/grade.cube"
  VF="$LOOK"
  [ -f "$LUT" ] && VF="lut3d=$LUT,noise=alls=6:allf=t,vignette=PI/5"
  # -pix_fmt yuv420p is mandatory: without it libx264 preserves the decoded
  # 4:4:4 and the `final` concat (-c copy) then mixes 444/420 segments, which
  # players decode as a frozen first frame. yuv420p is also required for
  # QuickTime/Instagram playback at all.
  ffmpeg -y -i build/composited.mp4 -vf "$VF" \
    -c:v libx264 -crf 16 -pix_fmt yuv420p build/master_silent.mp4
  echo "-> build/master_silent.mp4  (QA on a phone, full screen, muted)"
  ;;

final)
  # Stitch the complete timeline: S1 cold flash + graded/composited spine
  # (S2..S8) + S9 (organize, LIVE) + S10 (release) + S11 (end card). None of
  # spine/overlay/grade cover this on their own -- they only build the
  # pre-climax portion (build/master_silent.mp4).
  #
  # No more freeze hold: the climax used to hold a frozen still for 2s and then
  # play S9 over another frozen still (H7), which read as ~8s of dead freeze.
  # Now nothing freezes -- S9's organizing cards composite over LIVE S8, so the
  # picture keeps moving through the whole climax. S1 is still the 1s cold-open
  # flash (a separate decision, left for later).
  CARDS="blender/render/s9_0001.png"
  for f in build/master_silent.mp4 "$CARDS" organize/S11.mp4 plates/S10.mp4 plates/S8.mp4; do
    [ -f "$f" ] || { echo "missing $f -- run earlier stages / render alpha cards (blender) first"; exit 1; }
  done
  ffmpeg -y -sseof -0.1 -i build/master_silent.mp4 -frames:v 1 build/master_last_frame.png
  ffmpeg -y -loop 1 -i build/master_last_frame.png -t 1 -r 24 \
    -vf "eq=saturation=0.9,format=yuv420p" -c:v libx264 -crf 16 build/S1_coldflash.mp4
  ffmpeg -y -i plates/S10.mp4 -vf "$LOOK" \
    -c:v libx264 -crf 16 -pix_fmt yuv420p build/S10_graded.mp4
  # S9 LIVE: the Blender note-cards are rendered on alpha (blender/render/,
  # transparent mode). Composite them over the S8 plate slowed ~2x to fill the
  # 6s organize beat (S8 is 3.04s; slow-mo gives a reflective feel and avoids a
  # loop seam), then apply the unifying LOOK over the whole composite -- same
  # pipeline as the spine (composite -> grade), so the S9 cards and backdrop
  # match S8 in the spine and pick up the same grain/motion.
  ffmpeg -y -framerate 24 -i "blender/render/s9_%04d.png" -i plates/S8.mp4 \
    -filter_complex "[1:v]setpts=2.0*PTS,fps=24[bg];[bg][0:v]overlay=0:0:format=auto,$LOOK,format=yuv420p[v]" \
    -map "[v]" -frames:v 144 -c:v libx264 -crf 16 -pix_fmt yuv420p build/S9_live.mp4
  cat > build/final_concat.txt <<-LIST
	file '$(pwd)/build/S1_coldflash.mp4'
	file '$(pwd)/build/master_silent.mp4'
	file '$(pwd)/build/S9_live.mp4'
	file '$(pwd)/build/S10_graded.mp4'
	file '$(pwd)/organize/S11.mp4'
	LIST
  ffmpeg -y -f concat -safe 0 -i build/final_concat.txt -c copy build/master_full_silent.mp4
  echo "-> build/master_full_silent.mp4  (complete silent timeline, QA before audio)"
  ;;

audio)
  # Stems expected in audio/: bed.wav (room tone + notification stack built in
  # your DAW/CapCut, silent from 30.000s), vo.wav (starts at 31.0s), music.wav
  # (enters ~36s). Adjust delays below if your stems aren't pre-placed.
  ffmpeg -y -i build/master_full_silent.mp4 -i audio/bed.wav -i audio/vo.wav -i audio/music.wav \
    -filter_complex "[1:a][2:a][3:a]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.5[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k build/master_final.mp4
  echo "-> build/master_final.mp4"
  ;;

cutdown)
  # 15s Story teaser: freeze (2s) -> S9 organization (~8s incl. VO) -> end card.
  # Simplest robust path: mark the in/out points after watching the master.
  IN="${2:-28.0}"
  ffmpeg -y -ss "$IN" -i build/master_final.mp4 -t 15 \
    -c:v libx264 -crf 16 -c:a aac build/story_15s.mp4
  echo "-> build/story_15s.mp4"
  ;;

*)
  grep -E '^#   ' "$0"
  ;;
esac
