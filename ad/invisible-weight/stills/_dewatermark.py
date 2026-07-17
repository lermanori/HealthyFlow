#!/usr/bin/env python3
"""Remove Gemini's sparkle badge from a raw generated still via clone-stamp,
then crop/resize to the 1080x1920 mezzanine spec and save into stills/.

The badge lands at a roughly fixed position near the bottom-right of the
frame regardless of content. Usage:
  python3 _dewatermark.py <raw_input.png> <target_x0> <target_y0> <target_x1> <target_y1> <source_dx> <source_dy> <out_name>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent


def clone_stamp(img, tx0, ty0, tx1, ty1, dx, dy):
    w, h = tx1 - tx0, ty1 - ty0
    sx0, sy0 = tx0 + dx, ty0 + dy
    patch = img.crop((sx0, sy0, sx0 + w, sy0 + h))

    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    pad = max(6, w // 8)
    d.ellipse([pad, pad, w - pad, h - pad], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(pad / 1.5))

    out = img.copy()
    out.paste(patch, (tx0, ty0), mask)
    return out


def crop_resize(img, target_w=1080, target_h=1920):
    w, h = img.size
    target_ratio = target_w / target_h
    th = round(w / target_ratio)
    if th <= h:
        top = (h - th) // 2
        img = img.crop((0, top, w, top + th))
    else:
        tw = round(h * target_ratio)
        left = (w - tw) // 2
        img = img.crop((left, 0, left + tw, h))
    return img.resize((target_w, target_h), Image.LANCZOS)


def main():
    raw_path, tx0, ty0, tx1, ty1, dx, dy, out_name = sys.argv[1:9]
    img = Image.open(raw_path).convert("RGB")
    img = clone_stamp(img, int(tx0), int(ty0), int(tx1), int(ty1), int(dx), int(dy))
    img = crop_resize(img)
    out_path = HERE / out_name
    img.save(out_path)
    print(f"wrote {out_path} {img.size}")


if __name__ == "__main__":
    main()
