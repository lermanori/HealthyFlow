# HealthyFlow social videos

Remotion project for 9:16 social clips. Standalone — not part of the app build.

| Clip | Composition | Voiceover | Scenes |
|---|---|---|---|
| `social` | `HealthyFlowSocial` | `public/vo.mp3` | `src/social.tsx` |
| `honest` | `HealthyFlowHonestClock` | `public/vo-honest.mp3` | `src/honest.tsx` |
| `rollover` | `HealthyFlowRollover` | `public/vo-rollover.mp3` | `src/rollover.tsx` |

Shared phone, captions and outro: `src/shared.tsx`.

- Voiceovers: ElevenLabs, voice Mark – Natural Conversations, Eleven v3.
- `npm run transcribe -- <clip>` — whisper.cpp word timings → `src/captions/<clip>.json` (needs `cmake`).
  Each clip's scene cuts are derived from these words, so a new voiceover re-times the video.
- `npm run dev` — Remotion Studio preview.
- `npm run render` / `render:honest` / `render:rollover` — MP4s in `out/` (1080×1920, 30fps).
