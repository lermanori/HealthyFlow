#!/usr/bin/env python3
"""Build S11, the end card (M4 art). 5s @ 24fps, 1080x1920.

#071219 ground, the settled S9 timeline column at 20% opacity behind, then
type-on in three beats: wordmark -> tagline -> small CTA line. Renders a PNG
sequence with Pillow and encodes to organize/S11.mp4 with ffmpeg.

Usage: python3 generate_endcard.py [s9_last_frame.png] [out.mp4]
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"
REGULAR, BOLD = 0, 1

W, H = 1080, 1920
FPS = 24
DURATION_S = 5.0
GROUND = (7, 18, 25)

WORDMARK_TEXT = "HealthyFlow"
TAGLINE_TEXT = "Take back control of your day."
CTA_LINE2 = 'DM "FLOW" for early access.'

BEATS = {  # (fade_in_start_s, fade_in_end_s)
    "wordmark": (0.3, 1.1),
    "tagline": (1.6, 2.4),
    "cta": (3.1, 3.9),
}


def font(size, weight=REGULAR):
    return ImageFont.truetype(FONT, size, index=weight)


def ease(t, a, b):
    if t <= a:
        return 0.0
    if t >= b:
        return 1.0
    x = (t - a) / (b - a)
    return x * x * (3 - 2 * x)  # smoothstep


def build_background(column_frame_path):
    bg = Image.new("RGBA", (W, H), GROUND + (255,))
    if column_frame_path and column_frame_path.exists():
        column = Image.open(column_frame_path).convert("RGBA").resize((W, H))
        column = column.filter(ImageFilter.GaussianBlur(1))
        r, g, b, a = column.split()
        a = a.point(lambda v: int(v * 0.20))
        column.putalpha(a)
        bg = Image.alpha_composite(bg, column)
    return bg


def draw_centered(draw, text, y, f, fill, canvas_w=W):
    bbox = draw.textbbox((0, 0), text, font=f)
    tw = bbox[2] - bbox[0]
    draw.text(((canvas_w - tw) / 2 - bbox[0], y), text, font=f, fill=fill)


def wrap_text(draw, text, f, max_width):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=f) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def render_frame(bg, t):
    img = bg.copy()
    draw = ImageDraw.Draw(img)

    a1, a2 = BEATS["wordmark"]
    op = ease(t, a1, a2)
    if op > 0:
        f = font(112, BOLD)
        draw_centered(draw, WORDMARK_TEXT, 760, f, (247, 249, 249, round(255 * op)))

    a1, a2 = BEATS["tagline"]
    op = ease(t, a1, a2)
    if op > 0:
        f = font(56, REGULAR)
        draw_centered(draw, TAGLINE_TEXT, 910, f, (196, 204, 208, round(255 * op)))

    a1, a2 = BEATS["cta"]
    op = ease(t, a1, a2)
    if op > 0:
        f = font(34, REGULAR)
        # Single CTA line only -- the "looking for the first 10 people" lead-in
        # was cut per client note; keep just the DM ask.
        draw_centered(draw, CTA_LINE2, 1540, f, (150, 160, 167, round(255 * op)))

    return img


def main():
    args = sys.argv[1:]
    column_path = Path(args[0]) if len(args) > 0 else HERE / "render" / "s9_0144.png"
    out_path = Path(args[1]) if len(args) > 1 else HERE / "S11.mp4"

    bg = build_background(column_path)
    total_frames = round(DURATION_S * FPS)
    frames_dir = Path(tempfile.mkdtemp(prefix="s11_frames_"))

    print(f"rendering {total_frames} frames -> {frames_dir}")
    for i in range(total_frames):
        t = i / FPS
        render_frame(bg, t).convert("RGB").save(frames_dir / f"frame_{i:05d}.png")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p",
        str(out_path),
    ]
    subprocess.run(cmd, check=True)
    shutil.rmtree(frames_dir)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
