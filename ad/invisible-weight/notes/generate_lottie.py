#!/usr/bin/env python3
"""Generate the floating-notes Lottie animation from notes_config.json.

Output: notes_master.json — a 1080x1920 @ 24fps Lottie with one card+text
pair per note. Each note fades in and rises at its birth time, bobs on an
offset sine cycle (baked as keyframes, no expressions, so any renderer
works), shrinks slightly as it ages, and freezes dead at freeze_at.

Render to alpha for compositing, e.g. with python-lottie:
    lottie_convert.py notes_master.json notes_%04d.png   # PNG sequence
or with lottie-web / puppeteer, or import straight into CapCut/AE.

Usage:  python3 generate_lottie.py [config.json] [out.json]
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).parent


def kf(frame, value, ease=True):
    """One position/scalar keyframe with smooth easing."""
    k = {"t": round(frame, 2), "s": value if isinstance(value, list) else [value]}
    if ease:
        k["i"] = {"x": [0.4], "y": [1.0]}
        k["o"] = {"x": [0.3], "y": [0.0]}
    return k


def note_layers(idx, note, cfg, op_frame):
    """Build the two layers (card shape, text) for one note."""
    fps = cfg["fps"]
    card = cfg["card"]
    born_f = note["born"] * fps
    freeze_f = cfg["freeze_at"] * fps
    fade_f = cfg["birth"]["fade_s"] * fps
    rise = cfg["birth"]["rise_px"]

    # --- geometry: estimate card size from text length ---
    text_w = len(note["text"]) * card["font_size"] * 0.52
    w = text_w + 2 * card["pad_x"]
    h = card["font_size"] + 2 * card["pad_y"]

    # --- opacity: 0 -> card opacity over fade duration ---
    opacity = {"a": 1, "k": [kf(born_f, 0), kf(born_f + fade_f, card["opacity"])]}
    text_opacity = {"a": 1, "k": [kf(born_f, 0), kf(born_f + fade_f, 100)]}

    # --- position: birth rise, then baked sine bob until the freeze ---
    x, y = note["x"], note["y"]
    amp = cfg["bob"]["amplitude_px"]
    period_f = cfg["bob"]["period_s"] * fps
    phase = (idx * 0.37) % 1.0  # deterministic per-note phase offset
    pos_keys = [kf(born_f, [x, y + rise]), kf(born_f + fade_f, [x, y])]
    # bob keyframes every quarter period from settle to freeze
    t = born_f + fade_f
    step = period_f / 4.0
    while t + step < freeze_f:
        t += step
        offset = amp * math.sin(2 * math.pi * ((t - born_f) / period_f + phase))
        pos_keys.append(kf(t, [x, y + offset]))
    pos_keys.append(kf(freeze_f, [x, y]))  # frozen resting position
    position = {"a": 1, "k": pos_keys}

    # --- scale: age shrink ---
    to_pct = cfg["age_scale"]["to_pct"]
    over_f = cfg["age_scale"]["over_s"] * fps
    scale = {
        "a": 1,
        "k": [
            {"t": round(born_f, 2), "s": [100, 100, 100],
             "i": {"x": [0.4, 0.4, 0.4], "y": [1, 1, 1]},
             "o": {"x": [0.3, 0.3, 0.3], "y": [0, 0, 0]}},
            {"t": round(min(born_f + over_f, freeze_f), 2),
             "s": [to_pct, to_pct, to_pct]},
        ],
    }

    def transform(op):
        return {
            "o": op,
            "p": position,
            "s": scale,
            "a": {"a": 0, "k": [0, 0, 0]},
            "r": {"a": 0, "k": 0},
        }

    fill = hex_to_lottie(card["fill"])
    card_layer = {
        "ddd": 0, "ty": 4, "nm": f"card_{idx:02d}",
        "ip": round(born_f, 2), "op": op_frame, "st": 0, "sr": 1,
        "ks": transform(opacity),
        "shapes": [{
            "ty": "gr", "nm": "card",
            "it": [
                {"ty": "rc", "d": 1,
                 "s": {"a": 0, "k": [w, h]},
                 "p": {"a": 0, "k": [0, 0]},
                 "r": {"a": 0, "k": card["corner_radius"]}},
                {"ty": "fl", "c": {"a": 0, "k": fill}, "o": {"a": 0, "k": 100}},
                {"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]},
                 "s": {"a": 0, "k": [100, 100]}, "r": {"a": 0, "k": 0},
                 "o": {"a": 0, "k": 100}},
            ],
        }],
    }

    text_layer = {
        "ddd": 0, "ty": 5, "nm": f"text_{idx:02d}",
        "ip": round(born_f, 2), "op": op_frame, "st": 0, "sr": 1,
        "ks": transform(text_opacity),
        "t": {"d": {"k": [{"t": 0, "s": {
            "t": note["text"], "f": "sans", "s": card["font_size"],
            "j": 2, "tr": 0, "lh": card["font_size"] * 1.2,
            "fc": hex_to_lottie(card["text_color"]),
        }}]}, "p": {}, "m": {"g": 1, "a": {"a": 0, "k": [0, 0]}}, "a": []},
    }
    # center text vertically on the card (justification j=2 centers x)
    text_layer["ks"]["a"] = {"a": 0, "k": [0, -card["font_size"] * 0.38, 0]}
    return [card_layer, text_layer]


def hex_to_lottie(h):
    h = h.lstrip("#")
    return [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)] + [1]


def main():
    cfg_path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "notes_config.json"
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "notes_master.json"
    cfg = json.loads(cfg_path.read_text())

    op_frame = round(cfg["duration"] * cfg["fps"], 2)
    layers = []
    for idx, note in enumerate(cfg["notes"]):
        layers.extend(note_layers(idx, note, cfg, op_frame))
    # text layers should sit above their cards; Lottie draws top-of-list first
    layers.reverse()

    doc = {
        "v": "5.7.4", "nm": "invisible-weight-notes",
        "fr": cfg["fps"], "ip": 0, "op": op_frame,
        "w": cfg["width"], "h": cfg["height"], "ddd": 0,
        "fonts": {"list": [{"fName": "sans", "fFamily": "Helvetica Neue, Arial",
                             "fStyle": "Regular", "ascent": 72}]},
        "layers": layers, "assets": [],
    }
    out_path.write_text(json.dumps(doc, separators=(",", ":")))
    n = len(cfg["notes"])
    print(f"wrote {out_path} — {n} notes, {len(layers)} layers, "
          f"{cfg['duration']}s @ {cfg['fps']}fps, freeze at {cfg['freeze_at']}s")


if __name__ == "__main__":
    main()
