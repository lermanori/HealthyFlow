import React from 'react';
import type {Caption} from '@remotion/captions';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import raw from './captions/social.json';
import {Captions, clamp, Outro, Phone, ScreenHeader, useSpring} from './shared';
import {category, color, font} from './theme';
import {FPS, msToFrame, voiceover} from './timing';

const captions = raw as Caption[];
const vo = voiceover(captions);

// Scene cuts, driven by the voiceover itself.
const now = vo.word('now');
const gym = vo.word('gym', now.startMs);
const lunch = vo.word('lunch', gym.startMs);
const and = vo.word('and', lunch.startMs);
const then = vo.word('then', and.startMs);
const brand = vo.word('healthyflow', then.startMs);

const cut = {
	talk: msToFrame(now.startMs) - 6,
	dictateFromMs: gym.startMs,
	dictateToMs: lunch.endMs,
	timeline: msToFrame(and.startMs) - 4,
	capacity: msToFrame(then.startMs) - 2,
	outro: msToFrame(brand.startMs) - 4,
};

export const SOCIAL_DURATION = msToFrame(vo.endMs) + 2 * FPS + 15;

/* ---------------------------------------------------------------- Hook */

const apps = [
	{label: 'Tasks', glyph: '✓', bg: category.work},
	{label: 'Calendar', glyph: '17', bg: category.health},
	{label: 'Food', glyph: '🥗', bg: category.food},
	{label: 'Gym', glyph: '🏋️', bg: category.training},
	{label: 'Weight', glyph: '⚖️', bg: category.personal},
];

const AppIcon: React.FC<{app: (typeof apps)[number]; index: number; fallStart: number}> = ({app, index, fallStart}) => {
	const frame = useCurrentFrame();
	const pop = useSpring(index * 3, 11);
	const fall = interpolate(frame, [fallStart + index * 2, fallStart + index * 2 + 16], [0, 1], clamp);
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 18,
				transform: `translateY(${fall * 1400}px) rotate(${fall * (index % 2 ? 40 : -35)}deg) scale(${pop})`,
			}}
		>
			<div
				style={{
					width: 200,
					height: 200,
					borderRadius: 52,
					background: app.bg,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: 96,
					fontFamily: font.display,
					fontWeight: 700,
					color: color.onAccent,
					boxShadow: '0 24px 48px rgba(26,25,23,0.18)',
				}}
			>
				{app.glyph}
			</div>
			<div style={{fontFamily: font.body, fontSize: 36, fontWeight: 500, color: color.ink2}}>{app.label}</div>
		</div>
	);
};

const Hook: React.FC = () => {
	const frame = useCurrentFrame();
	const fallStart = cut.talk - 14;
	return (
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 90}}>
			<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 44, width: 860}}>
				{apps.map((app, index) => (
					<AppIcon key={app.label} app={app} index={index} fallStart={fallStart} />
				))}
			</div>
			<div
				style={{
					fontFamily: font.display,
					fontWeight: 700,
					fontSize: 108,
					letterSpacing: '-0.03em',
					color: color.ink,
					opacity: interpolate(frame, [8, 16, fallStart, fallStart + 8], [0, 1, 1, 0], clamp),
				}}
			>
				5 apps. 1 day.
			</div>
		</AbsoluteFill>
	);
};

/* ---------------------------------------------------------------- Talk */

const TalkScreen: React.FC = () => {
	const frame = useCurrentFrame();
	const nowMs = ((frame + cut.talk) / FPS) * 1000;
	const words = captions.filter((c) => c.startMs >= cut.dictateFromMs && c.endMs <= cut.dictateToMs + 1);
	const spoken = words.filter((w) => w.startMs <= nowMs);
	const listening = nowMs < cut.dictateToMs + 200;
	const pulse = listening ? 1 + 0.08 * Math.sin(frame / 3) : 1;
	const leave = interpolate(frame, [cut.timeline - cut.talk - 6, cut.timeline - cut.talk + 6], [0, 1], clamp);

	return (
		<AbsoluteFill style={{opacity: 1 - leave, transform: `translateY(${-leave * 120}px)`}}>
			<ScreenHeader title="Talk" sub="Say your day, any order" />
			<div
				style={{
					margin: '60px 48px 0',
					padding: '44px 48px',
					minHeight: 360,
					borderRadius: 44,
					background: color.raised,
					border: `2px solid ${color.line}`,
					fontFamily: font.body,
					fontSize: 52,
					lineHeight: 1.35,
					fontWeight: 500,
					color: spoken.length ? color.ink : color.ink3,
				}}
			>
				{spoken.length ? spoken.map((w) => w.text).join('') : 'Listening…'}
				<span style={{opacity: Math.round(frame / 8) % 2 ? 1 : 0, color: color.accent}}>|</span>
			</div>
			<div style={{position: 'absolute', bottom: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
				<div
					style={{
						position: 'absolute',
						width: 190,
						height: 190,
						borderRadius: 999,
						background: color.accent,
						opacity: listening ? 0.18 : 0,
						transform: `scale(${1.25 + 0.25 * Math.sin(frame / 4)})`,
					}}
				/>
				<div
					style={{
						width: 190,
						height: 190,
						borderRadius: 999,
						background: color.accent,
						transform: `scale(${pulse})`,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
				>
					<svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={color.onAccent} strokeWidth="2" strokeLinecap="round">
						<rect x="9" y="2" width="6" height="12" rx="3" />
						<path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
					</svg>
				</div>
			</div>
		</AbsoluteFill>
	);
};

/* ---------------------------------------------------------------- Timeline */

const HOUR_PX = 56;
const FIRST_HOUR = 7;
const items = [
	{title: 'Gym', start: 7, end: 8, hue: category.training, tag: 'Training'},
	{title: 'Standup', start: 9.5, end: 10, hue: category.work, tag: 'Work'},
	{title: 'Salad for lunch', start: 12.5, end: 13, hue: category.food, tag: 'Food'},
	{title: 'Call mom', start: 17.5, end: 18, hue: category.personal, tag: 'Personal'},
];
const hhmm = (h: number) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;

const TimelineItemCard: React.FC<{item: (typeof items)[number]; index: number}> = ({item, index}) => {
	const s = useSpring(6 + index * 7, 12);
	return (
		<div
			style={{
				position: 'absolute',
				top: (item.start - FIRST_HOUR) * HOUR_PX + 4,
				left: 96,
				right: 0,
				height: Math.max((item.end - item.start) * HOUR_PX - 8, 58),
				borderRadius: 22,
				background: color.raised,
				borderLeft: `14px solid ${item.hue}`,
				boxShadow: '0 10px 24px rgba(26,25,23,0.10)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0 26px',
				transform: `translateY(${(1 - s) * -260}px) scale(${0.85 + 0.15 * s})`,
				opacity: s,
			}}
		>
			<span style={{fontFamily: font.display, fontSize: 36, fontWeight: 600, color: color.ink}}>{item.title}</span>
			<span style={{fontFamily: font.body, fontSize: 24, color: color.ink3}}>
				{hhmm(item.start)} · {item.tag}
			</span>
		</div>
	);
};

const TimelineScreen: React.FC = () => {
	const frame = useCurrentFrame();
	const appear = interpolate(frame, [0, 10], [0, 1], clamp);
	const capacityIn = frame >= cut.capacity - cut.timeline;
	const shift = useSpring(cut.capacity - cut.timeline, 18);

	return (
		<AbsoluteFill style={{opacity: appear}}>
			<ScreenHeader title="Today" sub="Friday, 17 October" />
			{capacityIn ? <CapacityCard /> : null}
			<div style={{position: 'absolute', top: 330 + shift * 210, left: 48, right: 48}}>
				{Array.from({length: 12}, (_, i) => FIRST_HOUR + i).map((h) => (
					<div
						key={h}
						style={{
							position: 'absolute',
							top: (h - FIRST_HOUR) * HOUR_PX,
							left: 0,
							right: 0,
							borderTop: `2px solid ${color.line}`,
							fontFamily: font.body,
							fontSize: 24,
							color: color.ink3,
							paddingTop: 4,
						}}
					>
						{h}:00
					</div>
				))}
				{items.map((item, index) => (
					<TimelineItemCard key={item.title} item={item} index={index} />
				))}
			</div>
		</AbsoluteFill>
	);
};

/* ---------------------------------------------------------------- Capacity */

const FREE_MIN = 220;

const CapacityCard: React.FC = () => {
	const frame = useCurrentFrame() - (cut.capacity - cut.timeline);
	const s = useSpring(cut.capacity - cut.timeline, 15);
	const fill = interpolate(frame, [6, 40], [0, 1], {...clamp, easing: (t) => 1 - Math.pow(1 - t, 3)});
	const mins = Math.round(FREE_MIN * fill);
	return (
		<div
			style={{
				position: 'absolute',
				top: 300,
				left: 48,
				right: 48,
				padding: '30px 36px',
				borderRadius: 36,
				background: color.ink,
				color: color.onAccent,
				transform: `scale(${0.8 + 0.2 * s})`,
				opacity: s,
			}}
		>
			<div style={{fontFamily: font.body, fontSize: 26, color: '#BDB6A8', fontWeight: 500}}>Actually left today</div>
			<div style={{fontFamily: font.display, fontSize: 88, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1}}>
				{Math.floor(mins / 60)}h {String(mins % 60).padStart(2, '0')}m
			</div>
			<div style={{marginTop: 14, height: 18, borderRadius: 9, background: '#4A4741', overflow: 'hidden'}}>
				<div style={{width: `${fill * 38}%`, height: '100%', background: '#A9C7B6', borderRadius: 9}} />
			</div>
		</div>
	);
};

export const HealthyFlowSocial: React.FC = () => (
	<AbsoluteFill style={{background: color.canvas}}>
		<Audio src={staticFile('vo.mp3')} />
		<Sequence durationInFrames={cut.talk}>
			<Hook />
		</Sequence>
		<Sequence from={cut.talk} durationInFrames={cut.outro - cut.talk + 6}>
			<Phone exitAt={cut.outro - cut.talk}>
				<Sequence durationInFrames={cut.timeline - cut.talk + 8}>
					<TalkScreen />
				</Sequence>
				<Sequence from={cut.timeline - cut.talk}>
					<TimelineScreen />
				</Sequence>
			</Phone>
		</Sequence>
		<Sequence durationInFrames={cut.outro}>
			<Captions captions={captions} />
		</Sequence>
		<Sequence from={cut.outro}>
			<Outro lead="Say it. It lands on" punch="one honest clock." />
		</Sequence>
	</AbsoluteFill>
);
