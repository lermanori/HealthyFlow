#!/usr/bin/env bash
# Assemble the ~37s master from normalized plates + overlays.
# Stages (run in order as assets become ready):
#   ./assemble.sh spine     — concat plates to the beat map (needs plates/S*.mp4)
#   ./assemble.sh overlay   — composite the notes layer (needs notes render)
#   ./assemble.sh grade     — LUT + grain + vignette cohesion pass
#   ./assemble.sh final     — stitch S1 + graded spine + S9 + S10 + S11
#   ./assemble.sh vo        — place the two VO takes on the timeline -> audio/vo.wav
#   ./assemble.sh scratch   — placeholder synth mix for timing review (no stems)
#   ./assemble.sh audio     — mix stems + VO, loudness-normalize (needs audio/)
#   ./assemble.sh cutdown   — 15s Story teaser from the master
#
# There is deliberately no `freeze` stage: the cut contains no frozen segment
# anymore (S1 and the climax are both live -- see README M5.1 fixes 7 and 10).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build

# The one unifying look (PRODUCTION.md palette: "muted warm palette with cool
# teal shadows"). Must be applied identically everywhere real footage appears:
# the `grade` stage (spine) and the `final` stage (S10) — if this changes,
# rebuild BOTH or the timeline splits into two looks.
LOOK="colorbalance=rs=-0.06:gs=0.02:bs=0.10:rh=0.06:gh=0.015:bh=-0.07,eq=saturation=0.85:contrast=1.03,noise=alls=6:allf=t,vignette=PI/5"

# Two-pass loudnorm: measure, then apply a LINEAR gain.
# Never use single-pass `loudnorm=I=-14` on this mix. Single-pass runs in
# dynamic mode and lifts quiet passages -- it raised the 22.75s hard silence
# from -91dB to -43dB, i.e. it destroys the one beat the entire sound design is
# built around ("the brief's silence is the star"). Linear mode applies one
# constant gain, so silence stays silent and the -12dB->silence->lock-in
# dynamic contrast survives.
# $1 = input audio file, $2 = output wav
norm_linear() {
  local meas filt
  meas=$(ffmpeg -hide_banner -nostats -i "$1" \
           -af loudnorm=I=-14:TP=-1.5:print_format=json -f null - 2>&1 \
         | awk '/^[[:space:]]*\{/,/^[[:space:]]*\}/')
  filt=$(printf '%s' "$meas" | python3 -c "
import json,sys
m=json.load(sys.stdin)
print('loudnorm=I=-14:TP=-1.5:linear=true:'
      'measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s'
      % (m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh']))")
  ffmpeg -y -v error -i "$1" -af "$filt" -ar 48000 -c:a pcm_s16le "$2"
}

case "${1:-}" in

spine)
  # Canonical beat-map order, S2..S8 only (ends at the climax). S7 folds into
  # S8's push-in. S1 (cold flash), S9 (organize), S10 (release) and S11 (end
  # card) are NOT part of this stage -- S1 is cut from the *graded* spine and
  # S9/S11 are motion graphics, and S10 comes narratively *after* S9's organize
  # sequence, not straight after S8 -- they're joined by `final`.
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
  # NOTHING in this timeline freezes. The climax used to hold a frozen still
  # for 2s and then play S9 over another frozen still (H7) -- ~8s of dead
  # picture -- and S1 was a frozen grab on top of that. Now: S9's organizing
  # cards composite over LIVE S8, and S1 is the LIVE last second of the graded
  # spine rather than a held frame.
  CARDS="blender/render/s9_0001.png"
  for f in build/master_silent.mp4 "$CARDS" organize/S11.mp4 plates/S10.mp4 plates/S8.mp4; do
    [ -f "$f" ] || { echo "missing $f -- run earlier stages / render alpha cards (blender) first"; exit 1; }
  done
  # S1 cold flash, LIVE: the last 1s of the graded, note-composited spine --
  # the overwhelmed peak with the full note cloud and the tightest push-in,
  # desaturated 10%. Same content the old freeze was grabbed from, but moving.
  # Keeps the flash-forward hook (see the peak, then cut back to the calm
  # morning) without opening the ad on a frozen frame.
  ffmpeg -y -sseof -1.0 -i build/master_silent.mp4 \
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
  # Crossfade the spine -> S9 boundary. Both sides are the same S8 shot, but
  # the spine ends on the TIGHT end of its push-in while S9 restarts S8 wide,
  # so a hard cut there reads as a jump. A short dissolve hides it almost
  # completely -- and thematically the static note cloud melts into the
  # scattered cards as they start organizing. This is the one boundary that
  # can't be stream-copied, so fade the two into a single segment here and let
  # the rest of the concat stay -c copy.
  # xfade eats the overlap: output = 22.25 + 6 - XFADE_S.
  XFADE_S="${2:-0.5}"
  SPINE_S=$(ffprobe -v error -show_entries format=duration -of csv=p=0 build/master_silent.mp4)
  OFFSET=$(python3 -c "print(f'{$SPINE_S - $XFADE_S:.6f}')")
  ffmpeg -y -i build/master_silent.mp4 -i build/S9_live.mp4 \
    -filter_complex "[0:v][1:v]xfade=transition=fade:duration=$XFADE_S:offset=$OFFSET,format=yuv420p[v]" \
    -map "[v]" -c:v libx264 -crf 16 -pix_fmt yuv420p build/spine_s9.mp4
  cat > build/final_concat.txt <<-LIST
	file '$(pwd)/build/S1_coldflash.mp4'
	file '$(pwd)/build/spine_s9.mp4'
	file '$(pwd)/build/S10_graded.mp4'
	file '$(pwd)/organize/S11.mp4'
	LIST
  ffmpeg -y -f concat -safe 0 -i build/final_concat.txt -c copy build/master_full_silent.mp4
  echo "-> build/master_full_silent.mp4  (complete silent timeline, QA before audio)"
  ;;

vo)
  # Place the two raw VO takes on the master timeline -> audio/vo.wav, padded
  # to full length so the `audio` stage can mix it with no delay offsets.
  # Line 2 sits at 27.600s, NOT the 26.600s originally planned: line 1 runs
  # 2.873s from 23.750s and would have collided. 27.600 leaves a ~0.98s breath
  # between the lines (the 45s script had ~1.1s -- "the pause is doing the
  # work") and lands the punchline on the settled timeline as she exhales.
  # Re-check these if the takes are ever re-recorded at a different length.
  L1="${2:-audio/vo_line1.mp3}"
  L2="${3:-audio/vo_line2.mp3}"
  for f in "$L1" "$L2"; do
    [ -f "$f" ] || { echo "missing $f -- drop the two ElevenLabs takes in audio/"; exit 1; }
  done
  VO1_MS=23750
  VO2_MS=27600
  # Per-line loudnorm BEFORE placing: separate ElevenLabs generations can come
  # back several LU apart (these two were 6.8 LU apart -- line 1 -32.3 LUFS vs
  # line 2 -25.5), which reads as the VO jumping level mid-thought. Matching
  # them here keeps the two lines one voice; the `audio` stage still does the
  # final -14 LUFS pass over the whole mix.
  # Two ffmpeg ordering traps here, both of which silently misplace the lines:
  #  1. loudnorm resamples to 192kHz, so force 48k AFTER it, never before.
  #  2. loudnorm leaves a non-zero start PTS, and `atrim` works on absolute
  #     PTS -- so trimming after adelay lops exactly the delay off the front
  #     (36.792 - 23.750 = 13.042s file, speech at ~2.7s instead of 23.8s).
  #     `asetpts=N/SR/TB` regenerates timestamps from the sample count and
  #     must sit between adelay and apad/atrim.
  ffmpeg -y -i "$L1" -i "$L2" -filter_complex "\
    [0:a]loudnorm=I=-20:TP=-2.0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=$VO1_MS|$VO1_MS[a1];\
    [1:a]loudnorm=I=-20:TP=-2.0,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=$VO2_MS|$VO2_MS[a2];\
    [a1][a2]amix=inputs=2:normalize=0,asetpts=N/SR/TB,apad,atrim=0:36.791667[a]" \
    -map "[a]" -ar 48000 -c:a pcm_s16le audio/vo.wav
  echo "-> audio/vo.wav  (line1 @${VO1_MS}ms, line2 @${VO2_MS}ms)"
  ;;

scratch)
  # Placeholder sound for timing review only -- NOT the finished mix. Synth bed
  # (note blips, overload drone, hard silence, lock-in, warm pad) with the two
  # VO slots left silent. Regenerate the bed whenever the cut changes: its cue
  # times are hardcoded from this timeline (see audio/generate_scratch.py).
  python3 audio/generate_scratch.py audio/scratch_bed.wav
  if [ -f audio/vo.wav ]; then
    # Real VO over the placeholder bed -- duck the bed under the lines so the
    # words sit forward, the way the finished mix will.
    ffmpeg -y -v error -i audio/scratch_bed.wav -i audio/vo.wav \
      -filter_complex "[0:a][1:a]sidechaincompress=threshold=0.05:ratio=3:attack=20:release=350[duck];[duck][1:a]amix=inputs=2:normalize=0[a]" \
      -map "[a]" -ar 48000 -c:a pcm_s16le build/scratch_mix.wav
    LABEL="real VO + SCRATCH bed -- bed is placeholder"
  else
    cp audio/scratch_bed.wav build/scratch_mix.wav
    LABEL="SCRATCH audio -- timing reference, not final"
  fi
  norm_linear build/scratch_mix.wav build/scratch_mix_norm.wav
  ffmpeg -y -v error -i build/master_full_silent.mp4 -i build/scratch_mix_norm.wav \
    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest build/master_scratch.mp4
  echo "-> build/master_scratch.mp4  ($LABEL)"
  ;;

audio)
  # Real stems in audio/, pre-placed on the master timeline (i.e. each file
  # starts at 0:00 with its own leading silence) -- simplest thing that mixes
  # correctly and the reason there are no delay offsets here.
  #   bed.wav   room tone + notification stack. MUST be silent from 22.750s
  #             (the hard cut to silence) until the world returns at 28.750s.
  #   vo.wav    line 1 at 23.750s, line 2 at 26.600s.
  #   music.wav enters no earlier than 26.300s -- never before the day
  #             organizes -- and resolves under the end card (31.792-36.792s).
  # The lock-in "thock" at 25.810s (the last card settling) belongs in bed.wav
  # and is the single most important sound in the ad.
  # These times come from the current cut; re-derive from `final` if it moves.
  for f in audio/bed.wav audio/vo.wav audio/music.wav; do
    [ -f "$f" ] || { echo "missing $f -- see the cue sheet in README (M6); or run './assemble.sh scratch' for a placeholder mix"; exit 1; }
  done
  # Duck bed+music under the VO, then normalise with the LINEAR two-pass (see
  # norm_linear above -- single-pass loudnorm would raise the hard silence).
  ffmpeg -y -v error -i audio/bed.wav -i audio/vo.wav -i audio/music.wav \
    -filter_complex "[0:a][2:a]amix=inputs=2:normalize=0[bedmus];\
[bedmus][1:a]sidechaincompress=threshold=0.05:ratio=3:attack=20:release=350[duck];\
[duck][1:a]amix=inputs=2:normalize=0[a]" \
    -map "[a]" -ar 48000 -c:a pcm_s16le build/final_mix.wav
  norm_linear build/final_mix.wav build/final_mix_norm.wav
  ffmpeg -y -v error -i build/master_full_silent.mp4 -i build/final_mix_norm.wav \
    -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest build/master_final.mp4
  echo "-> build/master_final.mp4"
  ;;

cutdown)
  # 15s Story teaser. Default in-point 21.7917s runs to the exact end of the
  # 36.7917s master (= 15.000s) and covers the whole payoff arc: tail of the
  # overload -> hard silence -> organize -> release -> end card.
  # (The old default of 28.0 predates the freeze-less recut and would now yield
  # an 8.8s clip, not 15s -- the master is shorter than the timeline it assumed.)
  # Prefers the real mix; falls back to the scratch mix so the Story cut can be
  # previewed before stems exist.
  IN="${2:-21.791667}"
  SRC=build/master_final.mp4
  [ -f "$SRC" ] || SRC=build/master_scratch.mp4
  [ -f "$SRC" ] || { echo "no master_final.mp4 or master_scratch.mp4 -- run 'audio' or 'scratch' first"; exit 1; }
  ffmpeg -y -ss "$IN" -i "$SRC" -t 15 \
    -c:v libx264 -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k build/story_15s.mp4
  echo "-> build/story_15s.mp4  (from $(basename "$SRC"))"
  ;;

*)
  grep -E '^#   ' "$0"
  ;;
esac
