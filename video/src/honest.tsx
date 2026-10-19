import React from 'react';
import type {Caption} from '@remotion/captions';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import raw from './captions/honest.json';
import {Captions, clamp, Outro, Phone, ScreenHeader, useSpring} from './shared';
import {category, color, font} from './theme';
import {FPS, msToFrame, voiceover} from './timing';

const captions = raw as Caption[];
const vo = voiceover(captions);

// Scene cuts, driven by the voiceover itself.
const theyre = vo.word("they're");
const guessing = vo.word('guessing', theyre.startMs);
const counts = vo.word('healthyflow', guessing.startMs);
const gym = vo.word('gym', counts.startMs);
const standup = vo.word('standup', gym.startMs);
const lunch = vo.word('lunch', standup.startMs);
const meeting = vo.word('meeting', lunch.startMs);
const three = vo.word('3', meeting.startMs);
const because = vo.word('because', three.startMs);
const call = vo.word('call', because.startMs);
const give = vo.word('give', call.startMs);
const exact = vo.word('exact', give.startMs);
const brand = vo.word('healthyflow', exact.startMs);

const at = {
	stamp: msToFrame(theyre.startMs),
	phone: msToFrame(counts.startMs) - 6,
	gym: msToFrame(gym.startMs),
	standup: msToFrame(standup.startMs),
	lunch: msToFrame(lunch.startMs),
	meeting: msToFrame(meeting.startMs),
	bound: msToFrame(three.startMs),
	reason: msToFrame(because.startMs),
	callMom: msToFrame(call.startMs),
	tap: msToFrame(give.startMs),
	exact: msToFrame(exact.startMs) - 4,
	outro: msToFrame(brand.startMs) - 4,
};

export const HONEST_DURATION = msToFrame(vo.endMs) + 2 * FPS + 10;

/* ---------------------------------------------------------------- The other planner */

const OtherPlanner: React.FC = () => {
	const frame = useCurrentFrame();
	const enter = useSpring(0, 15);
	const stamp = useSpring(at.stamp, 9);
	const leave = interpolate(frame, [at.phone - 3, at.phone + 8], [0, 1], clamp);
	return (
		<AbsoluteFill style={{alignItems: 'center', paddingTop: 170}}>
			<div
				style={{
					width: 780,
					height: 1180,
					borderRadius: 64,
					background: '#FFFFFF',
					boxShadow: '0 40px 100px rgba(26,25,23,0.18)',
					overflow: 'hidden',
					transform: `translateY(${(1 - enter) * 300 + leave * -80}px) translateX(${leave * -1200}px) rotate(${leave * -8}deg)`,
					opacity: enter,
				}}
			>
				<div
					style={{
						height: 230,
						background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
						padding: '70px 56px 0',
						fontFamily: font.display,
						fontSize: 64,
						fontWeight: 700,
						color: '#FFFFFF',
					}}
				>
					My Planner ✨
				</div>
				<div
					style={{
						margin: '44px 48px 0',
						padding: '36px 40px',
						borderRadius: 36,
						background: '#FDF2F8',
						fontFamily: font.display,
						fontSize: 54,
						fontWeight: 700,
						color: '#9D174D',
						lineHeight: 1.2,
					}}
				>
					You're free all afternoon! 🎉
				</div>
				<div style={{margin: '40px 48px 0'}}>
					{[12, 13, 14, 15, 16, 17, 18].map((h) => (
						<div
							key={h}
							style={{
								height: 92,
								borderTop: '2px solid #F1F1F4',
								fontFamily: font.body,
								fontSize: 28,
								color: '#A1A1AA',
								paddingTop: 8,
							}}
						>
							{h}:00
						</div>
					))}
				</div>
			</div>
			<div
				style={{
					position: 'absolute',
					top: 760,
					padding: '18px 54px',
					border: '12px solid #C4302B',
					borderRadius: 28,
					color: '#C4302B',
					fontFamily: font.display,
					fontWeight: 700,
					fontSize: 150,
					letterSpacing: '0.04em',
					opacity: frame >= at.stamp ? 1 - leave : 0,
					transform: `rotate(-12deg) scale(${3 - 2 * stamp}) translateX(${leave * -900}px)`,
					background: 'rgba(255,255,255,0.75)',
				}}
			>
				GUESS
			</div>
		</AbsoluteFill>
	);
};

/* ---------------------------------------------------------------- HealthyFlow's Today */

// Shown day: it is 13:20, the planning window ends at 18:00 → 280 min remain.
// The meeting (60 min) is known; "Call mom" has no duration → at most 220 min (3h 40m).
// Giving "Call mom" 20 min makes it exact: 200 min (3h 20m).
const HOUR_PX = 56;
const FIRST_HOUR = 7;
const NOW = 13 + 20 / 60;
const y = (h: number) => (h - FIRST_HOUR) * HOUR_PX;

type Item = {title: string; start: number; end: number | null; hue: string; tag: string; at: number; calendar?: boolean};
const items: Item[] = [
	{title: 'Gym', start: 7, end: 8, hue: category.training, tag: 'Training', at: at.gym},
	{title: 'Standup', start: 9.5, end: 9.75, hue: category.work, tag: 'Work', at: at.standup},
	{title: 'Lunch', start: 12.5, end: 13.25, hue: category.food, tag: 'Food', at: at.lunch},
	{title: 'Design review', start: 14, end: 15, hue: category.work, tag: 'Calendar', at: at.meeting, calendar: true},
	{title: 'Call mom', start: 17.5, end: null, hue: category.personal, tag: 'Personal', at: at.callMom - 10},
];

const fmt = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min) % 60).padStart(2, '0')}m`;
const clock = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

const ItemCard: React.FC<{item: Item; local: (f: number) => number}> = ({item, local}) => {
	const frame = useCurrentFrame();
	const s = useSpring(local(item.at), 12);
	const past = item.end !== null && item.end <= NOW;
	const isCallMom = item.end === null;
	const giveSpring = useSpring(local(at.tap) + 8, 13);
	const given = isCallMom ? giveSpring : 0;
	const missing = isCallMom && frame < local(at.tap) + 8;
	const flag = isCallMom ? interpolate(frame, [local(at.reason), local(at.reason) + 6], [0, 1], clamp) : 0;
	const height = isCallMom ? 58 + given * 6 : Math.max(((item.end ?? item.start) - item.start) * HOUR_PX - 6, 50);
	return (
		<div
			style={{
				position: 'absolute',
				top: y(item.start) + 3,
				left: 96,
				right: 0,
				height,
				borderRadius: 20,
				background: color.raised,
				border: missing ? `3px dashed ${flag ? '#C4302B' : color.line}` : '3px solid transparent',
				borderLeft: `14px solid ${item.hue}`,
				boxShadow: '0 8px 20px rgba(26,25,23,0.10)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				padding: '0 22px',
				opacity: s * (past ? 0.6 : 1),
				transform: `scale(${1.2 - 0.2 * s})`,
			}}
		>
			<span style={{fontFamily: font.display, fontSize: 32, fontWeight: 600, color: color.ink}}>
				{past ? '✓ ' : ''}
				{item.title}
			</span>
			<span style={{fontFamily: font.body, fontSize: 22, color: missing && flag ? '#C4302B' : color.ink3, fontWeight: missing ? 600 : 400}}>
				{isCallMom
					? missing
						? 'no duration'
						: `17:30–17:50 · 20 min`
					: `${clock(item.start)}${item.calendar ? ' · 📅 Calendar' : ` · ${item.tag}`}`}
			</span>
		</div>
	);
};

const CapacityCard: React.FC<{local: (f: number) => number}> = ({local}) => {
	const frame = useCurrentFrame();
	const bound = frame >= local(at.bound);
	const exactNow = frame >= local(at.exact);
	const count = interpolate(frame, [local(at.bound), local(at.bound) + 14], [0, 220], clamp);
	const drop = interpolate(frame, [local(at.exact), local(at.exact) + 10], [220, 200], clamp);
	const minutes = exactNow ? drop : count;
	const chip = interpolate(frame, [local(at.reason), local(at.reason) + 8, local(at.exact) - 2, local(at.exact) + 6], [0, 1, 1, 0], clamp);
	const tick = useSpring(local(at.exact) + 6, 10);
	return (
		<div
			style={{
				position: 'absolute',
				top: 290,
				left: 48,
				right: 48,
				padding: '26px 34px 28px',
				borderRadius: 36,
				background: color.ink,
				color: color.onAccent,
			}}
		>
			<div style={{fontFamily: font.body, fontSize: 26, color: '#BDB6A8', fontWeight: 500}}>
				{!bound ? 'Counting your day…' : exactNow ? 'Exactly left · until 18:00' : 'At most left · until 18:00'}
			</div>
			<div style={{display: 'flex', alignItems: 'center', gap: 20, height: 104}}>
				<div style={{fontFamily: font.display, fontSize: 88, fontWeight: 700, letterSpacing: '-0.03em'}}>
					{bound ? `${exactNow ? '' : '≤ '}${fmt(minutes)}` : '—'}
				</div>
				{exactNow ? (
					<div
						style={{
							width: 72,
							height: 72,
							borderRadius: 999,
							background: '#A9C7B6',
							color: '#14201A',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: 44,
							fontWeight: 700,
							transform: `scale(${tick})`,
						}}
					>
						✓
					</div>
				) : null}
			</div>
			<div
				style={{
					height: chip * 64,
					opacity: chip,
					overflow: 'hidden',
					marginTop: chip * 6,
				}}
			>
				<div
					style={{
						display: 'inline-block',
						padding: '12px 22px',
						borderRadius: 16,
						background: '#3A2523',
						color: '#F2B8B5',
						fontFamily: font.body,
						fontSize: 26,
						fontWeight: 600,
					}}
				>
					⚠ "Call mom" has no duration
				</div>
			</div>
		</div>
	);
};

const TodayScreen: React.FC = () => {
	const frame = useCurrentFrame();
	const local = (f: number) => f - at.phone;
	const tap = interpolate(frame, [local(at.tap), local(at.tap) + 5, local(at.tap) + 14, local(at.tap) + 22], [0, 1, 1, 0], clamp);
	return (
		<AbsoluteFill>
			<ScreenHeader title="Today" sub="Friday, 17 October" />
			<CapacityCard local={local} />
			<div style={{position: 'absolute', top: 600, left: 48, right: 48}}>
				{Array.from({length: 12}, (_, i) => FIRST_HOUR + i).map((h) => (
					<div
						key={h}
						style={{
							position: 'absolute',
							top: y(h),
							left: 0,
							right: 0,
							borderTop: `2px solid ${color.line}`,
							fontFamily: font.body,
							fontSize: 22,
							color: color.ink3,
							paddingTop: 2,
						}}
					>
						{h}:00
					</div>
				))}
				<div style={{position: 'absolute', top: y(NOW), left: 70, right: 0, height: 4, background: color.accent, zIndex: 2}}>
					<div
						style={{
							position: 'absolute',
							right: 0,
							top: -16,
							padding: '4px 10px',
							borderRadius: 10,
							background: color.accent,
							color: color.onAccent,
							fontFamily: font.body,
							fontSize: 20,
							fontWeight: 600,
						}}
					>
						13:20
					</div>
				</div>
				{items.map((it) => (
					<ItemCard key={it.title} item={it} local={local} />
				))}
				<div
					style={{
						position: 'absolute',
						top: y(17.5) - 10,
						right: 120,
						width: 90,
						height: 90,
						borderRadius: 999,
						background: 'rgba(26,25,23,0.25)',
						border: '4px solid rgba(255,255,255,0.9)',
						opacity: tap,
						transform: `scale(${1.3 - 0.3 * tap})`,
						zIndex: 5,
					}}
				/>
			</div>
		</AbsoluteFill>
	);
};

export const HealthyFlowHonestClock: React.FC = () => (
	<AbsoluteFill style={{background: color.canvas}}>
		<Audio src={staticFile('vo-honest.mp3')} />
		<Sequence durationInFrames={at.phone + 6}>
			<OtherPlanner />
		</Sequence>
		<Sequence from={at.phone} durationInFrames={at.outro - at.phone + 6}>
			<Phone exitAt={at.outro - at.phone}>
				<TodayScreen />
			</Phone>
		</Sequence>
		<Sequence durationInFrames={at.outro}>
			<Captions captions={captions} />
		</Sequence>
		<Sequence from={at.outro}>
			<Outro lead="" punch="The honest clock." />
		</Sequence>
	</AbsoluteFill>
);
