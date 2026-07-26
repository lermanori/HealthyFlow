#!/usr/bin/env python3
"""Synthesize a SCRATCH audio bed for the silent master — timing reference only.

This is not the finished sound design. It exists so the cut can be judged with
sound before real stems are recorded/licensed: placeholder blips for each note
birth, a rising overload drone, the hard silence, the lock-in, and a warm pad.
The two VO slots are left as true silence (speech can't be synthesized here) — see
VO_SLOTS below for where the lines land.

All cue times are MASTER timeline seconds, derived from the real configs:
  note births   = notes_config.json "born" + 1.0s (the S1 cold flash)
  S9 frame 0    = 1.0 + spine 22.25 - xfade 0.5      = 22.75
  last card     = S9 frame 0 + converge + stagger    = 25.81
  S10 / S11     = 28.75 / 31.7917,  end              = 36.7917
Re-derive these (scripts/assemble.sh, blender/s9_config.json) if the cut changes.

Usage: python3 generate_scratch.py [out.wav]
"""
import sys
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
SR = 48000

DURATION = 36.791667
S1_OUT = 1.0          # cold flash hard-cuts here
SILENCE_AT = 22.75    # the stack stops dead as the dissolve starts
VO1_AT = 23.75        # 1 full second of silence before the first line
LOCKIN_AT = 25.81     # last card settles — the most important sound in the ad
PAD_AT = 26.30        # warm bed enters only AFTER organizing has happened
VO2_AT = 26.60
S10_AT = 28.75        # release — room tone/birds return
S11_AT = 31.791667    # end card

NOTE_BIRTHS = [4.71, 7.68, 8.79, 9.90, 11.75, 12.87, 13.61, 14.35,
               15.83, 16.58, 17.32, 18.06, 18.80, 19.54]
# Vary the pitch so the stack reads as different alert types, not one repeat.
BLIP_FREQS = [880, 1046, 784, 1174, 659, 987, 1318, 740,
              880, 1046, 622, 1174, 831, 987]

VO_SLOTS = [
    (VO1_AT, 2.50, "The hardest part of modern life isn't doing everything."),
    (VO2_AT, 1.50, "It's remembering everything."),
]

n_total = int(DURATION * SR)
buf = np.zeros((n_total, 2), dtype=np.float64)
rng = np.random.default_rng(7)


def _slice(t0, dur):
    i0 = max(0, int(t0 * SR))
    i1 = min(n_total, i0 + int(dur * SR))
    return i0, i1


def add(t0, samples, pan=0.0):
    """Mix mono samples in at t0. pan -1..1."""
    i0 = max(0, int(t0 * SR))
    i1 = min(n_total, i0 + len(samples))
    if i1 <= i0:
        return
    s = samples[: i1 - i0]
    left, right = (1 - pan) / 2 + 0.5, (1 + pan) / 2 + 0.5
    buf[i0:i1, 0] += s * left
    buf[i0:i1, 1] += s * right


def blip(freq, level=0.13, decay=0.32):
    """Bell-ish notification: fundamental + 2nd harmonic, exponential decay."""
    t = np.arange(int(decay * 1.6 * SR)) / SR
    env = np.exp(-t / (decay * 0.34))
    tone = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t)
    click = np.zeros_like(t)
    click[: int(0.002 * SR)] = rng.uniform(-1, 1, int(0.002 * SR)) * 0.5
    return (tone * env + click * np.exp(-t / 0.004)) * level


def room_tone(t0, t1, amp, rate=110):
    """Low rumble — the room being present.

    Noise is generated at `rate` Hz and interpolated up to SR, so there is
    almost no energy above ~rate/2. This matters: a broadband bed (or a gentle
    6dB/oct one-pole, which was the first attempt) leaves 500Hz-5kHz content
    that the ear hears as RUNNING WATER, not as a room. Real room tone is
    nearly all sub-200Hz. `amp` is the target amplitude, not a filter level.
    """
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    k = max(2, int((t1 - t0) * rate))
    coarse = rng.normal(0, 1, k)
    b = np.interp(np.linspace(0, k - 1, n), np.arange(k), coarse)
    add(t0, b * amp)


def drone(t0, t1, freq, l0, l1):
    """Low, almost-subliminal pressure that rises through the overload."""
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    t = np.arange(n) / SR
    env = np.linspace(l0, l1, n)
    tone = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 1.5 * t)
    add(t0, tone * env)


def thock(level=0.40):
    """The lock-in. Tactile, felt more than heard — low body + soft transient."""
    t = np.arange(int(0.45 * SR)) / SR
    body = np.sin(2 * np.pi * 92 * t) * np.exp(-t / 0.055)
    sub = np.sin(2 * np.pi * 58 * t) * np.exp(-t / 0.10)
    tick = rng.uniform(-1, 1, len(t)) * np.exp(-t / 0.0035) * 0.30
    return (body + 0.7 * sub + tick) * level


def pad(t0, t1, freqs, level, attack=1.6, release=1.2):
    """Warm resolved chord — enters only after the day is organized."""
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    t = np.arange(n) / SR
    env = np.ones(n)
    a = min(int(attack * SR), n)
    env[:a] = np.linspace(0, 1, a) ** 2
    r = min(int(release * SR), n)
    env[-r:] *= np.linspace(1, 0, r) ** 1.5
    mix = np.zeros(n)
    for k, f in enumerate(freqs):
        det = 1 + (0.0015 * (k - len(freqs) / 2))  # slight detune = warmth
        mix += np.sin(2 * np.pi * f * det * t + k) * (1.0 / (k + 1.6))
    add(t0, mix * env * level)


# ---- 0:00–0:01  S1 cold flash: the peak of the stack, hard out ------------
for k, f in enumerate([1046, 880, 1318, 740, 987, 1174]):
    add(0.02 + k * 0.06, blip(f, level=0.16, decay=0.28), pan=(k % 3 - 1) * 0.5)
room_tone(0.0, S1_OUT, 0.030)
drone(0.0, S1_OUT, 62, 0.055, 0.055)

# ---- 0:01–22.75  the morning: calm, then the stack builds -----------------
room_tone(S1_OUT, 12.0, 0.024)
room_tone(12.0, SILENCE_AT, 0.014)          # room tone thins as pressure rises
drone(9.0, SILENCE_AT, 58, 0.010, 0.085)     # low drone climbs to the peak

for k, (t0, f) in enumerate(zip(NOTE_BIRTHS, BLIP_FREQS)):
    lvl = 0.11 + 0.055 * (k / len(NOTE_BIRTHS))   # each arrival lands harder
    add(t0, blip(f, level=lvl), pan=((k * 0.37) % 1.0 - 0.5) * 1.3)
    if k >= 8:   # last notes overlap into a stack with no gaps
        add(t0 + 0.20, blip(f * 1.5, level=lvl * 0.55, decay=0.22), pan=-0.4)
    if k >= 11:
        add(t0 + 0.42, blip(f * 0.75, level=lvl * 0.45, decay=0.20), pan=0.55)

# ---- 22.75  HARD SILENCE — everything stops, including room tone ----------
buf[int(SILENCE_AT * SR):int(LOCKIN_AT * SR)] = 0.0

# ---- the payoff ----------------------------------------------------------
add(LOCKIN_AT, thock())
pad(PAD_AT, DURATION - 0.35, [146.83, 220.00, 293.66, 369.99], 0.085)
room_tone(S10_AT, DURATION, 0.017)           # the world comes back
for k, f in enumerate([2093, 2637, 3136]):   # faint birds, like S2
    add(S10_AT + 0.5 + k * 0.9, blip(f, level=0.020, decay=0.16), pan=(k - 1) * 0.7)
pad(S11_AT, DURATION, [146.83, 220.00, 293.66], 0.055, attack=1.0, release=1.6)


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "scratch_bed.wav"
    peak = np.max(np.abs(buf))
    mixed = buf / peak * 0.72 if peak > 0 else buf   # headroom for the real VO
    pcm = (np.clip(mixed, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(out), "w") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {out}  ({DURATION:.2f}s, peak {peak:.3f})")
    print(f"  silence  {SILENCE_AT}s -> {LOCKIN_AT}s   lock-in {LOCKIN_AT}s   pad {PAD_AT}s")
    for t0, dur, line in VO_SLOTS:
        print(f"  VO slot  {t0:.2f}s +{dur:.2f}s (silent): \"{line}\"")


if __name__ == "__main__":
    main()
