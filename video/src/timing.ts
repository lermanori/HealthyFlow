import type {Caption} from '@remotion/captions';

export const FPS = 30;

export const msToFrame = (ms: number) => Math.round((ms / 1000) * FPS);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Finds words in a clip's voiceover so scene cuts follow the narration.
// Throws when a word is missing, so a re-recorded voiceover cannot silently desync the cut.
export const voiceover = (captions: Caption[]) => {
	const word = (text: string, afterMs = 0): Caption => {
		const hit = captions.find((c) => c.startMs >= afterMs && norm(c.text) === norm(text));
		if (!hit) {
			throw new Error(`Voiceover has no word "${text}" after ${afterMs}ms`);
		}
		return hit;
	};
	const endMs = captions[captions.length - 1].endMs;
	return {word, endMs};
};
