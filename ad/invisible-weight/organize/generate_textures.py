#!/usr/bin/env python3
"""Generate the 28 plane textures for the S9 organization scene (M4 art).

Reads blender/s9_config.json for the "rows" order (14 items, final top-to-
bottom column order) and writes, per index i:
  organize/textures/note_XX.png  — the floating note-card look (off-white,
                                    matches notes_config.json's card style)
  organize/textures/row_XX.png   — the HealthyFlow timeline-row look
                                    (teal-black card, cyan time chip; one
                                    green check row, one amber rollover row)

Usage: python3 generate_textures.py [s9_config.json] [out_dir]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"
REGULAR, BOLD = 0, 1
SYMBOL_FONT = "/System/Library/Fonts/SFNS.ttf"  # HelveticaNeue lacks U+21BB (rollover arrow)
ROLLOVER_GLYPH = "↻"

TEX_W, TEX_H = 1200, 336

# Per-title schedule: (time label or None, kind) — kind in "normal","check","rollover"
SCHEDULE = {
    "Pay rent":              ("9:00 AM", "normal"),
    "Dentist at 3 PM":       ("3:00 PM", "normal"),
    "Reply to Alex":         ("9:30 AM", "normal"),
    "Prepare for meeting":   ("10:00 AM", "normal"),
    "Finish project":        (None, "rollover"),
    "Answer email":          ("1:00 PM", "normal"),
    "Log lunch":             ("12:30 PM", "normal"),
    "Buy groceries":         ("5:30 PM", "normal"),
    "Workout":                ("6:00 AM", "normal"),
    "Go to the gym":         ("6:00 PM", "normal"),
    "Drink water":           ("7:00 AM", "check"),
    "Schedule appointment":  ("2:00 PM", "normal"),
    "Call Mom":              ("7:30 PM", "normal"),
    "Call family":           ("8:00 PM", "normal"),
}
# Row titles drop redundant time phrases baked into the note text.
ROW_TITLE = {"Dentist at 3 PM": "Dentist appointment"}

NOTE_STYLE = {
    "fill": (246, 244, 238), "opacity": 0.92,
    "text_color": (42, 50, 56), "radius": 40, "font_size": 76,
}
ROW_BG = (7, 18, 25)
ROW_TITLE_COLOR = (223, 228, 231)
CYAN = (34, 211, 238)
GREEN = (74, 222, 128)
AMBER = (251, 191, 36)
DARK_CHIP_TEXT = (7, 18, 25)


def font(size, weight=REGULAR):
    return ImageFont.truetype(FONT, size, index=weight)


def rgba(rgb, alpha_frac=1.0):
    return tuple(rgb) + (round(255 * alpha_frac),)


def note_texture(text):
    img = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    margin = 16
    d.rounded_rectangle(
        [margin, margin, TEX_W - margin, TEX_H - margin],
        radius=NOTE_STYLE["radius"], fill=rgba(NOTE_STYLE["fill"], NOTE_STYLE["opacity"]),
    )
    f = font(NOTE_STYLE["font_size"])
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((TEX_W - tw) / 2 - bbox[0], (TEX_H - th) / 2 - bbox[1]), text, font=f,
           fill=rgba(NOTE_STYLE["text_color"]))
    return img


def row_texture(title, time_label, kind):
    img = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    margin = 12
    d.rounded_rectangle(
        [margin, margin, TEX_W - margin, TEX_H - margin],
        radius=32, fill=rgba(ROW_BG),
    )

    pad = 40
    chip_font = font(48, BOLD)
    title_font = font(56)
    chip_fill = AMBER if kind == "rollover" else CYAN

    if kind == "rollover":
        glyph_font = ImageFont.truetype(SYMBOL_FONT, 48)
        gb = d.textbbox((0, 0), ROLLOVER_GLYPH, font=glyph_font)
        glyph_w = gb[2] - gb[0]
        chip_text = "Tomorrow"
        gap = 14
    else:
        glyph_font, gb, glyph_w, gap = None, None, 0, 0
        chip_text = time_label

    cb = d.textbbox((0, 0), chip_text, font=chip_font)
    chip_tw, chip_th = cb[2] - cb[0], cb[3] - cb[1]
    chip_pad_x, chip_pad_y = 28, 16
    content_w = glyph_w + gap + chip_tw if kind == "rollover" else chip_tw
    chip_w, chip_h = content_w + 2 * chip_pad_x, max(chip_th, 48) + 2 * chip_pad_y
    chip_x0, chip_y0 = pad, (TEX_H - chip_h) / 2
    d.rounded_rectangle(
        [chip_x0, chip_y0, chip_x0 + chip_w, chip_y0 + chip_h],
        radius=chip_h / 2, fill=rgba(chip_fill),
    )
    cursor_x = chip_x0 + chip_pad_x
    text_mid_y = chip_y0 + chip_h / 2
    if kind == "rollover":
        d.text((cursor_x - gb[0], text_mid_y - (gb[3] - gb[1]) / 2 - gb[1]), ROLLOVER_GLYPH,
               font=glyph_font, fill=rgba(DARK_CHIP_TEXT))
        cursor_x += glyph_w + gap
    d.text((cursor_x - cb[0], text_mid_y - chip_th / 2 - cb[1]), chip_text,
           font=chip_font, fill=rgba(DARK_CHIP_TEXT))

    right_reserved = 0
    if kind == "check":
        r = 34
        cx, cy = TEX_W - pad - r, TEX_H / 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgba(GREEN))
        d.line([cx - r * 0.45, cy, cx - r * 0.1, cy + r * 0.35], fill=(7, 18, 25, 255), width=8)
        d.line([cx - r * 0.1, cy + r * 0.35, cx + r * 0.5, cy - r * 0.35], fill=(7, 18, 25, 255), width=8)
        right_reserved = 2 * r + pad

    title_x0 = chip_x0 + chip_w + 36
    title_x1 = TEX_W - pad - right_reserved - 20
    tb = d.textbbox((0, 0), title, font=title_font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    while tw > (title_x1 - title_x0) and title_font.size > 28:
        title_font = font(title_font.size - 4)
        tb = d.textbbox((0, 0), title, font=title_font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text((title_x0 - tb[0], (TEX_H - th) / 2 - tb[1]), title, font=title_font,
           fill=rgba(ROW_TITLE_COLOR))
    return img


def main():
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "blender" / "s9_config.json"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "textures"
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(cfg_path.read_text())

    for i, text in enumerate(cfg["rows"]):
        note_texture(text).save(out_dir / f"note_{i:02d}.png")
        time_label, kind = SCHEDULE[text]
        title = ROW_TITLE.get(text, text)
        row_texture(title, time_label, kind).save(out_dir / f"row_{i:02d}.png")
        print(f"{i:02d}  note_{i:02d}.png / row_{i:02d}.png  <- \"{text}\"  ({kind})")

    print(f"wrote {2 * len(cfg['rows'])} textures to {out_dir}")


if __name__ == "__main__":
    main()
