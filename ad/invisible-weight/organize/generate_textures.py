#!/usr/bin/env python3
"""Generate the plane textures for the S9 organization scene (M4 art).

Reads blender/s9_config.json for the "rows" order (final top-to-bottom column
order) and writes, per index i:
  organize/textures/note_XX.png  — the floating note-card look (off-white,
                                    matches notes_config.json's card style):
                                    the vague to-do, the "before".
  organize/textures/row_XX.png   — the HealthyFlow timeline-row look: a
                                    *tracked* item, the "after". Category
                                    accent bar + a chip that varies by type
                                    (time / kcal / habit streak / logged /
                                    weight / rollover) so the column reads as a
                                    whole-self day, not a monochrome calendar.

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

# Per-title metadata: (category, chip_text, kind).
#   category -> accent-bar / chip colour (the closed CONTEXT category set)
#   kind     -> chip style: time | kcal | streak | done | weight | rollover
# Ordering of the column itself lives in s9_config.json "rows" (time-ordered so
# the day reads as one woven timeline).
META = {
    "Workout":              ("fitness",   "45 min",       "done"),
    "Drink water":          ("health",    "6-day streak", "streak"),
    "Weight":               ("health",    "68.2 kg",      "weight"),
    "Pay rent":             ("personal",  "8:30 AM",      "time"),
    "Reply to Alex":        ("work",      "9:00 AM",      "time"),
    "Prepare for meeting":  ("work",      "10:00 AM",     "time"),
    "Log lunch":            ("nutrition", "540 kcal",     "kcal"),
    "Answer email":         ("work",      "1:00 PM",      "time"),
    "Schedule appointment": ("personal",  "2:00 PM",      "time"),
    "Dentist at 3 PM":      ("personal",  "3:00 PM",      "time"),
    "Buy groceries":        ("grocery",   "5:30 PM",      "time"),
    "Go to the gym":        ("fitness",   "6:00 PM",      "time"),
    "Call Mom":             ("personal",  "7:30 PM",      "time"),
    "Call family":          ("personal",  "8:00 PM",      "time"),
    "Finish project":       ("work",      "Tomorrow",     "rollover"),
}
# Row titles drop redundant time phrases baked into the note text.
ROW_TITLE = {"Dentist at 3 PM": "Dentist appointment"}

CAT = {
    "work":      (91, 141, 239),
    "fitness":   (232, 145, 91),
    "nutrition": (79, 176, 160),
    "health":    (111, 191, 115),
    "personal":  (155, 140, 239),
    "grocery":   (217, 178, 76),
}

NOTE_STYLE = {
    "fill": (246, 244, 238), "opacity": 0.92,
    "text_color": (42, 50, 56), "radius": 40, "font_size": 76,
}
ROW_BG = (22, 29, 36)
ROW_TITLE_COLOR = (224, 228, 232)
DONE_BG = (20, 44, 30)
DONE_CHECK = (150, 225, 165)
AMBER_BG = (110, 82, 28)
AMBER_TEXT = (240, 205, 120)
MUTED_TEXT = (150, 160, 167)


def font(size, weight=REGULAR):
    return ImageFont.truetype(FONT, size, index=weight)


def rgba(rgb, alpha_frac=1.0):
    return tuple(rgb) + (round(255 * alpha_frac),)


def tint(rgb, frac):
    return tuple(round(c * frac) for c in rgb)


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


def _chip(d, text, kind, cat_rgb, right_x, mid_y):
    """Draw a right-anchored chip; return its left x (so the title can clear it)."""
    chip_font = font(52, BOLD)
    cb = d.textbbox((0, 0), text, font=chip_font)
    tw, th = cb[2] - cb[0], cb[3] - cb[1]
    pad_x, pad_y = 30, 18
    extra = 0
    glyph_font = None
    if kind == "rollover":
        glyph_font = ImageFont.truetype(SYMBOL_FONT, 52)
        gb = d.textbbox((0, 0), ROLLOVER_GLYPH, font=glyph_font)
        extra = (gb[2] - gb[0]) + 16
    elif kind == "done":
        extra = 56  # check mark
    elif kind == "weight":
        extra = 40  # down triangle

    chip_w = tw + extra + 2 * pad_x
    chip_h = max(th, 52) + 2 * pad_y
    x1 = right_x
    x0 = x1 - chip_w
    y0, y1 = mid_y - chip_h / 2, mid_y + chip_h / 2

    if kind == "time":
        bg, txt = cat_rgb, (10, 16, 22)
    elif kind in ("kcal", "streak"):
        bg, txt = tint(cat_rgb, 0.28), cat_rgb
    elif kind == "weight":
        bg, txt = tint(cat_rgb, 0.28), cat_rgb
    elif kind == "done":
        bg, txt = DONE_BG, MUTED_TEXT
    elif kind == "rollover":
        bg, txt = AMBER_BG, AMBER_TEXT
    else:
        bg, txt = cat_rgb, (10, 16, 22)
    d.rounded_rectangle([x0, y0, x1, y1], radius=chip_h / 2, fill=rgba(bg))

    cx = x0 + pad_x
    if kind == "done":
        r = 22
        d.line([cx, mid_y + 2, cx + r * 0.5, mid_y + r * 0.6], fill=rgba(DONE_CHECK), width=8)
        d.line([cx + r * 0.5, mid_y + r * 0.6, cx + r * 1.3, mid_y - r * 0.7], fill=rgba(DONE_CHECK), width=8)
        cx += extra
    elif kind == "rollover":
        gb = d.textbbox((0, 0), ROLLOVER_GLYPH, font=glyph_font)
        d.text((cx - gb[0], mid_y - (gb[3] - gb[1]) / 2 - gb[1]), ROLLOVER_GLYPH,
               font=glyph_font, fill=rgba(txt))
        cx += extra
    d.text((cx - cb[0], mid_y - th / 2 - cb[1]), text, font=chip_font, fill=rgba(txt))
    if kind == "weight":
        tx = cx + tw + 14
        d.polygon([(tx, mid_y - 8), (tx + 22, mid_y - 8), (tx + 11, mid_y + 10)], fill=rgba(txt))
    return x0


def row_texture(title, cat, chip_text, kind):
    img = Image.new("RGBA", (TEX_W, TEX_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    margin = 12
    d.rounded_rectangle(
        [margin, margin, TEX_W - margin, TEX_H - margin], radius=32, fill=rgba(ROW_BG),
    )
    cat_rgb = CAT[cat]
    # left category accent bar
    d.rounded_rectangle([margin + 20, margin + 46, margin + 34, TEX_H - margin - 46],
                        radius=7, fill=rgba(cat_rgb))

    pad = 44
    mid_y = TEX_H / 2
    chip_x0 = _chip(d, chip_text, kind, cat_rgb, TEX_W - pad, mid_y)

    title_x0 = margin + 34 + 40
    title_x1 = chip_x0 - 36
    title_font = font(60)
    tb = d.textbbox((0, 0), title, font=title_font)
    tw, th = tb[2] - tb[0], tb[3] - tb[1]
    while tw > (title_x1 - title_x0) and title_font.size > 30:
        title_font = font(title_font.size - 4)
        tb = d.textbbox((0, 0), title, font=title_font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
    d.text((title_x0 - tb[0], mid_y - th / 2 - tb[1]), title, font=title_font,
           fill=rgba(ROW_TITLE_COLOR))
    return img


def main():
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "blender" / "s9_config.json"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "textures"
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(cfg_path.read_text())

    for i, text in enumerate(cfg["rows"]):
        note_texture(text).save(out_dir / f"note_{i:02d}.png")
        cat, chip_text, kind = META[text]
        title = ROW_TITLE.get(text, text)
        row_texture(title, cat, chip_text, kind).save(out_dir / f"row_{i:02d}.png")
        print(f"{i:02d}  note/row  <- \"{text}\"  ({cat}/{kind})")

    print(f"wrote {2 * len(cfg['rows'])} textures to {out_dir}")


if __name__ == "__main__":
    main()
