#!/usr/bin/env python3
"""Render notes_config.json straight to an alpha video, no Lottie runtime needed.

Mirrors generate_lottie.py's animation math frame-by-frame (birth fade + rise,
sine bob on a per-note phase, age-based scale shrink, freeze at freeze_at) and
rasterizes each note as a rounded card + text with Pillow. Frames after
freeze_at are identical, so only one is drawn and then copied.

Usage:  python3 render_notes.py [config.json] [out.webm] [--frames-dir DIR] [--keep-frames]
Requires: ffmpeg with libvpx-vp9 on PATH, Pillow.
"""
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT_REGULAR = ("/System/Library/Fonts/HelveticaNeue.ttc", 0)


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def note_state(idx, note, cfg, t):
    """Return (x, y, scale_pct, card_alpha_pct, text_alpha_pct) or None if not yet born."""
    born = note["born"]
    if t < born:
        return None
    freeze_at = cfg["freeze_at"]
    te = min(t, freeze_at)
    age = te - born

    fade_s = cfg["birth"]["fade_s"]
    rise = cfg["birth"]["rise_px"]
    amp = cfg["bob"]["amplitude_px"]
    period = cfg["bob"]["period_s"]
    phase = (idx * 0.37) % 1.0
    to_pct = cfg["age_scale"]["to_pct"]
    over_s = cfg["age_scale"]["over_s"]
    opacity_max = cfg["card"]["opacity"]

    if age < fade_s:
        frac = age / fade_s
        card_alpha = opacity_max * frac
        text_alpha = 100 * frac
        y_off = rise * (1 - frac)
        bob = 0.0
    else:
        card_alpha = opacity_max
        text_alpha = 100
        y_off = 0.0
        bob = amp * math.sin(2 * math.pi * ((age - fade_s) / period + phase))

    scale_frac = min(age / over_s, 1.0) if over_s > 0 else 1.0
    scale_pct = 100 + (to_pct - 100) * scale_frac

    x = note["x"]
    y = note["y"] + y_off + bob
    return x, y, scale_pct, card_alpha, text_alpha


def render_frame(cfg, t, fonts):
    img = Image.new("RGBA", (cfg["width"], cfg["height"]), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    card_cfg = cfg["card"]
    fill_rgb = hex_to_rgb(card_cfg["fill"])
    text_rgb = hex_to_rgb(card_cfg["text_color"])

    for idx, note in enumerate(cfg["notes"]):
        state = note_state(idx, note, cfg, t)
        if state is None:
            continue
        x, y, scale_pct, card_alpha, text_alpha = state
        scale = scale_pct / 100.0
        font_size = round(card_cfg["font_size"] * scale)
        font = fonts.get(font_size)
        if font is None:
            font = ImageFont.truetype(FONT_REGULAR[0], font_size, index=FONT_REGULAR[1])
            fonts[font_size] = font

        text = note["text"]
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        pad_x = card_cfg["pad_x"] * scale
        pad_y = card_cfg["pad_y"] * scale
        w = text_w + 2 * pad_x
        h = font_size + 2 * pad_y
        radius = card_cfg["corner_radius"] * scale

        left, top = x - w / 2, y - h / 2
        draw.rounded_rectangle(
            [left, top, left + w, top + h], radius=radius,
            fill=fill_rgb + (round(card_alpha / 100 * 255),),
        )
        tx = x - text_w / 2 - bbox[0]
        ty = y - text_h / 2 - bbox[1]
        draw.text((tx, ty), text, font=font, fill=text_rgb + (round(text_alpha / 100 * 255),))

    return img


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    keep_frames = "--keep-frames" in sys.argv
    cfg_path = Path(args[0]) if len(args) > 0 else HERE / "notes_config.json"
    out_path = Path(args[1]) if len(args) > 1 else HERE / "notes_master.webm"
    cfg = json.loads(cfg_path.read_text())

    fps = cfg["fps"]
    total_frames = round(cfg["duration"] * fps)
    freeze_frame_idx = round(cfg["freeze_at"] * fps)

    frames_dir = Path(tempfile.mkdtemp(prefix="notes_frames_"))
    fonts = {}
    frozen_path = None

    print(f"rendering {total_frames} frames ({cfg['width']}x{cfg['height']}) -> {frames_dir}")
    for i in range(total_frames):
        out = frames_dir / f"frame_{i:05d}.png"
        if i >= freeze_frame_idx and frozen_path is not None:
            shutil.copy(frozen_path, out)
            continue
        t = i / fps
        img = render_frame(cfg, t, fonts)
        img.save(out)
        if i >= freeze_frame_idx:
            frozen_path = out
        if i % 120 == 0:
            print(f"  frame {i}/{total_frames} (t={t:.1f}s)")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-framerate", str(fps),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0", "-crf", "28", "-b:v", "0",
        str(out_path),
    ]
    print("encoding:", " ".join(cmd))
    subprocess.run(cmd, check=True)

    if keep_frames:
        print(f"frames kept at {frames_dir}")
    else:
        shutil.rmtree(frames_dir)

    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
