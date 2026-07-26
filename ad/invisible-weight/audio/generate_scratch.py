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


def _bandnoise(n, lo_rate, hi_smooth=1):
    """Noise shaped by generating coarse and smoothing — cheap band control."""
    k = max(2, int(n / max(1, SR // lo_rate)))
    coarse = rng.normal(0, 1, k)
    s = np.interp(np.linspace(0, k - 1, n), np.arange(k), coarse)
    if hi_smooth > 1:
        ker = np.ones(hi_smooth) / hi_smooth
        s = np.convolve(s, ker, mode="same")
    return s


def coffee_pour(dur=2.4, level=0.10):
    """Liquid into a mug: a body of moving noise + irregular bubbles.

    Deliberately gurgly and short with a clear start/stop. A smooth sustained
    hiss here would be the 'running water' failure again -- what makes this
    read as a pour is the amplitude movement and the bubbles, not the band.
    """
    n = int(dur * SR)
    t = np.arange(n) / SR
    body = _bandnoise(n, 4200, 4)
    # pour envelope: quick start, wobble, taper as the mug fills
    env = np.clip(np.minimum(t / 0.12, (dur - t) / 0.35), 0, 1)
    wobble = 1 + 0.35 * np.sin(2 * np.pi * 7.3 * t) + 0.2 * _bandnoise(n, 40)
    sig = body * env * wobble
    # bubbles: short pitched blips that rise as the level comes up
    for _ in range(int(dur * 9)):
        at = rng.uniform(0.1, dur - 0.2)
        f = rng.uniform(380, 900) * (1 + 0.5 * at / dur)
        bl = int(0.045 * SR)
        bt = np.arange(bl) / SR
        i0 = int(at * SR)
        sig[i0:i0 + bl] += (np.sin(2 * np.pi * f * bt * (1 + 3 * bt))
                            * np.exp(-bt / 0.010) * rng.uniform(0.25, 0.6))
    return sig * level


def key_click(level=0.055):
    """One keystroke: noise transient + a small plastic body."""
    n = int(0.055 * SR)
    t = np.arange(n) / SR
    tick = _bandnoise(n, 9000, 2) * np.exp(-t / 0.0028)
    body = np.sin(2 * np.pi * rng.uniform(140, 210) * t) * np.exp(-t / 0.008) * 0.5
    return (tick + body) * level


def footstep(level=0.075):
    """Soft step on a hard floor: low thud + heel scuff."""
    n = int(0.30 * SR)
    t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * rng.uniform(62, 88) * t) * np.exp(-t / 0.045)
    scuff = _bandnoise(n, 6000, 3) * np.exp(-t / 0.020) * 0.5
    return (thud + scuff) * level


def chair(level=0.09):
    """Weight settling onto a wooden chair."""
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    creak = _bandnoise(n, 1400, 4) * np.exp(-t / 0.14)
    low = np.sin(2 * np.pi * 74 * t) * np.exp(-t / 0.10)
    return (creak * 0.7 + low) * level


def piano_note(freq, dur, level=0.10):
    """Felt-piano-ish struck note: harmonics that decay faster as they rise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for h in range(1, 9):
        amp = 1.0 / (h ** 1.7)
        dec = 0.9 / (h ** 0.6)
        sig += np.sin(2 * np.pi * freq * h * t) * np.exp(-t / dec) * amp
    atk = int(0.006 * SR)
    sig[:atk] *= np.linspace(0, 1, atk)
    return sig * level


def reverb(sig, decay=0.40, mix=0.26):
    """Cheap room: convolve with a decaying-noise IR via FFT.

    Without this every sound sits ON the picture instead of in her kitchen.
    """
    ir_n = int(decay * SR)
    it = np.arange(ir_n) / SR
    ir = rng.normal(0, 1, ir_n) * np.exp(-it / (decay * 0.30))
    ir[: int(0.004 * SR)] = 0            # small pre-delay
    ir /= np.abs(ir).sum() / 8           # keep energy sane
    out = np.zeros_like(sig)
    for ch in range(sig.shape[1]):
        wet = np.fft.irfft(np.fft.rfft(sig[:, ch], len(sig) + ir_n)
                           * np.fft.rfft(ir, len(sig) + ir_n))[: len(sig)]
        out[:, ch] = sig[:, ch] * (1 - mix) + wet * mix
    return out


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

# ---- diegetic layer: the world she's actually in --------------------------
# Placed against the picture (shot bounds: S2 1.00-6.04, S3 -11.08, S4 -14.13,
# S5 -17.17, S6 -20.21, S8 -23.25) and against what's on screen in each --
# she pours at ~2s, sits at ~11s, types from ~14.4s. Goes through reverb so it
# sits in the room; the synth stack above stays dry and "in her head".
_main_buf = buf
buf = np.zeros_like(_main_buf)                # temporarily collect diegetics

add(1.85, coffee_pour(), pan=-0.15)           # S2: moka pot into the mug
for k, at in enumerate([9.95, 10.40, 10.85]):  # S4: crossing to the table
    add(at, footstep(level=0.075 - k * 0.008), pan=0.25 - k * 0.15)
add(11.15, chair(), pan=0.1)                  # settling in
kt = 14.40                                    # S5/S6: typing
while kt < 17.00:
    add(kt, key_click(level=rng.uniform(0.040, 0.065)), pan=rng.uniform(-0.35, 0.35))
    kt += rng.uniform(0.055, 0.165)           # human, not metronomic
for k, f in enumerate([2093, 2637, 3136]):     # S10: faint birds, like S2
    add(29.35 + k * 0.85, blip(f, level=0.016, decay=0.15), pan=(k - 1) * 0.7)

_diegetic = reverb(buf)
buf = _main_buf + _diegetic

# ---- the payoff ----------------------------------------------------------
add(LOCKIN_AT, thock())
room_tone(S10_AT, DURATION, 0.017)           # the world comes back

# Music: a real progression, not one held chord. Struck felt-piano voicings
# over a sustaining pad, resolving home under the end card.
#   D (26.30) -> G (29.00) -> A (31.70) -> D (34.20, holds to the end)
CHORDS = [
    (26.30, [146.83, 220.00, 293.66, 369.99]),   # D
    (29.00, [196.00, 246.94, 293.66, 392.00]),   # G
    (31.70, [220.00, 277.18, 329.63, 440.00]),   # A
    (34.20, [146.83, 220.00, 293.66, 369.99]),   # D, home
]
_music = np.zeros_like(buf)
_keep = buf
buf = _music
for ci, (at, voicing) in enumerate(CHORDS):
    hold = (CHORDS[ci + 1][0] - at) if ci + 1 < len(CHORDS) else (DURATION - at)
    for ni, f in enumerate(voicing):            # slight roll, like a real hand
        add(at + ni * 0.045, piano_note(f, min(hold + 1.4, 3.6), level=0.075 / (ni * 0.35 + 1)),
            pan=(ni - 1.5) * 0.18)
    pad(at, at + hold + 0.5, voicing, 0.030, attack=0.5, release=0.6)
_music = reverb(buf, decay=0.75, mix=0.30)      # more space on the music
buf = _keep + _music


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
