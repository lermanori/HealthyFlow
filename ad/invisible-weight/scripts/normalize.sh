#!/usr/bin/env bash
# Normalize any source clip (Kling output, Blender render, phone footage) to
# the mezzanine spec: 1080x1920, 24fps, yuv420p, high-quality h264.
# Usage: ./normalize.sh input.mp4 [output.mp4]
set -euo pipefail
in="$1"
out="${2:-${in%.*}_norm.mp4}"
ffmpeg -y -i "$in" \
  -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24,format=yuv420p" \
  -c:v libx264 -crf 16 -preset slow -an "$out"
echo "normalized -> $out"
