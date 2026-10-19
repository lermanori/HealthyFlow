// Transcribes a clip's voiceover into word-level captions at src/captions/<clip>.json.
// Usage: node scripts/transcribe.mjs <clip>
import {execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
	downloadWhisperModel,
	installWhisperCpp,
	toCaptions,
	transcribe,
} from '@remotion/install-whisper-cpp';

const root = path.resolve(import.meta.dirname, '..');
const whisperPath = path.join(root, '.whisper');
const version = '1.7.5';
const model = 'medium.en';

// Each clip: its voiceover, and the closing line Whisper tends to drop.
const clips = {
	social: {audio: 'public/vo.mp3', lastLine: 'HealthyFlow.'},
	honest: {audio: 'public/vo-honest.mp3', lastLine: 'The honest clock.'},
	rollover: {audio: 'public/vo-rollover.mp3', lastLine: 'Nothing silently dropped.'},
};
const clipName = process.argv[2];
const clip = clips[clipName];
if (!clip) throw new Error(`Unknown clip "${clipName}". Use one of: ${Object.keys(clips).join(', ')}`);

await installWhisperCpp({to: whisperPath, version});
await downloadWhisperModel({folder: whisperPath, model});

const wav = path.join(whisperPath, `${clipName}.wav`);
execSync(`ffmpeg -y -i ${clip.audio} -ar 16000 -ac 1 ${wav}`, {cwd: root, stdio: 'ignore'});

const output = await transcribe({
	inputPath: wav,
	whisperPath,
	whisperCppVersion: version,
	model,
	tokenLevelTimestamps: true,
});
const {captions: tokens} = toCaptions({whisperCppOutput: output});

// Whisper emits sub-word tokens ("G", "ym") and stray quotes; fold them into whole words.
const captions = [];
let afterQuote = false;
for (const t of tokens) {
	if (/^\s*"\s*$/.test(t.text)) {
		afterQuote = true;
		continue;
	}
	const prev = captions[captions.length - 1];
	const continues = prev && !t.text.startsWith(' ') && !afterQuote;
	afterQuote = false;
	if (continues) {
		prev.text += t.text;
		prev.endMs = t.endMs;
	} else {
		captions.push({...t, text: t.text.startsWith(' ') || !prev ? t.text : ' ' + t.text});
	}
}

// Whisper sometimes drops the closing line. Recover it from the audio itself: the speech
// after the last silence is that line, shown as one caption.
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const tail = captions.slice(-clip.lastLine.split(' ').length).map((c) => c.text).join('');
if (norm(tail) !== norm(clip.lastLine)) {
	const probe = execSync(
		`ffmpeg -i ${clip.audio} -af silencedetect=n=-35dB:d=0.25 -f null - 2>&1`,
		{cwd: root},
	).toString();
	const ends = [...probe.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
	const duration = Number(
		execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${clip.audio}`, {cwd: root}),
	) * 1000;
	const startMs = Math.round(ends[ends.length - 1]);
	const last = captions[captions.length - 1];
	last.endMs = Math.min(last.endMs, startMs);
	captions.push({text: ' ' + clip.lastLine, startMs, endMs: Math.round(duration), timestampMs: startMs, confidence: null});
}

// House spellings Whisper cannot know.
for (let i = captions.length - 1; i > 0; i--) {
	if (/^\s*Healthy$/i.test(captions[i - 1].text) && /^\s*flow\b/i.test(captions[i].text)) {
		captions[i - 1].text = captions[i - 1].text.replace(/healthy/i, 'Healthy') + captions[i].text.trim().replace(/^flow/i, 'Flow');
		captions[i - 1].endMs = captions[i].endMs;
		captions.splice(i, 1);
	}
}
for (const c of captions) {
	c.text = c.text
		.replace(/(\d)\.(\d\d)/, '$1:$2')
		.replace(/calendar\?/, 'calendar.')
		.replace(/Call$/, '"call')
		.replace(/Mom$/, 'mom"')
		.replace(/Honest/, 'honest')
		.replace(/Clock/, 'clock');
}
fs.writeFileSync(path.join(root, `src/captions/${clipName}.json`), JSON.stringify(captions, null, 2));
console.log(captions.map((c) => `${c.startMs}-${c.endMs} ${c.text}`).join('\n'));
