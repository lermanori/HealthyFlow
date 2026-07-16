#!/usr/bin/env bash
# Assemble the 45s master from normalized plates + overlays.
# Stages (run in order as assets become ready):
#   ./assemble.sh spine     — concat plates to the beat map (needs plates/S*.mp4)
#   ./assemble.sh freeze    — build S8 freeze + speed ramp
#   ./assemble.sh overlay   — composite the notes layer (needs notes render)
#   ./assemble.sh grade     — LUT + grain + vignette cohesion pass
#   ./assemble.sh audio     — mix stems + VO, loudness-normalize (needs audio/)
#   ./assemble.sh cutdown   — 15s Story teaser from the master
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build

case "${1:-}" in

spine)
  # Beat map: S1 cold flash (1s, from freeze frame) + S2..S8. Trim durations here.
  # S1 requires build/freeze_frame.png (made by the freeze stage) — run once
  # without S1, pick the freeze frame, then rebuild.
  ls plates/S*.mp4 || { echo "put normalized Kling clips in plates/ first"; exit 1; }
  printf "file '%s'\n" plates/S*.mp4 > build/concat.txt
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
  VF="noise=alls=6:allf=t,vignette=PI/5"
  [ -f "$LUT" ] && VF="lut3d=$LUT,$VF"
  ffmpeg -y -i build/composited.mp4 -vf "$VF" \
    -c:v libx264 -crf 16 build/master_silent.mp4
  echo "-> build/master_silent.mp4  (QA on a phone, full screen, muted)"
  ;;

audio)
  # Stems expected in audio/: bed.wav (room tone + notification stack built in
  # your DAW/CapCut, silent from 30.000s), vo.wav (starts at 31.0s), music.wav
  # (enters ~36s). Adjust delays below if your stems aren't pre-placed.
  ffmpeg -y -i build/master_silent.mp4 -i audio/bed.wav -i audio/vo.wav -i audio/music.wav \
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
