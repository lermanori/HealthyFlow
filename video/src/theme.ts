import {loadFont as loadDisplay} from '@remotion/google-fonts/SpaceGrotesk';
import {loadFont as loadBody} from '@remotion/google-fonts/Inter';

// Brand tokens, copied from public/landing.html (light theme).
export const color = {
	canvas: '#EDEAE3',
	surface: '#F7F5F0',
	raised: '#FFFEFB',
	line: '#DCD5C8',
	ink: '#1A1917',
	ink2: '#55524B',
	ink3: '#6B675C',
	accent: '#46655A',
	accentStrong: '#2F473F',
	accentSoft: '#E4EDE7',
	onAccent: '#F7F5F0',
};

// Category hues for the day's cards.
export const category = {
	training: '#C9733F',
	work: '#4A6FA5',
	food: '#46655A',
	personal: '#8A6BB0',
	health: '#B5545C',
};

export const font = {
	display: loadDisplay('normal', {weights: ['500', '600', '700'], subsets: ['latin']}).fontFamily,
	body: loadBody('normal', {weights: ['400', '500', '600'], subsets: ['latin']}).fontFamily,
};
