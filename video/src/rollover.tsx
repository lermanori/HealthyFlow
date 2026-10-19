import React from 'react';
import type {Caption} from '@remotion/captions';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import raw from './captions/rollover.json';
import {Captions, clamp, Outro, Phone, ScreenHeader, useSpring} from './shared';
import {category, color, font} from './theme';
import {FPS, msToFrame, voiceover} from './timing';

const captions = raw as Caption[];
const vo = voiceover(captions);

// Scene cuts, driven by the voiceover itself.
const lose = vo.word('lose');
const bury = vo.word('bury', lose.startMs);
const carries = vo.word('healthyflow', bury.startMs);
const tomorrow = vo.word('tomorrow', carries.startMs);
const from = vo.word('from', tomorrow.startMs);
const habits = vo.word('habits', from.startMs);
const miss = vo.word('miss', habits.startMs);
const fresh = vo.word('fresh', miss.startMs);
const brand = vo.word('healthyflow', fresh.startMs);

const at = {
	lose: msToFrame(lose.startMs),
	bury: msToFrame(bury.startMs),
	phone: msToFrame(carries.startMs) - 6,
	flip: msToFrame(tomorrow.startMs),
	tag: msToFrame(from.startMs),
	habits: msToFrame(habits.startMs),
	miss: msToFrame(miss.startMs),
	fresh: msToFrame(fresh.startMs),
	outro: msToFrame(brand.startMs) - 4,
};

export const ROLLOVER_DURATION = msToFrame(vo.endMs) + 2 * FPS + 10;

const red = '#C4302B';

/* ---------------------------------------------------------------- Two bad options */

const Card: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
	<div
		style={{
			padding: '26px 30px',
			borderRadius: 26,
			background: color.raised,
			boxShadow: '0 10px 24px rgba(26,25,23,0.10)',
			fontFamily: font.display,
			fontSize: 44,
			fontWeight: 600,
			color: color.ink,
			...style,
		}}
	>
		{children}
	</div>
);

const overdue = ['Call the clinic back', 'Renew passport', 'Email Dana', 'Book dentist', 'Fix bike', 'Pay parking', 'Read contract', 'Order filters'];

const OverdueCard: React.FC<{title: string; index: number}> = ({title, index}) => {
	const drop = useSpring(at.bury + 4 + index * 4, 11);
	return (
		<Card
			style={{
				width: '100%',
				padding: '20px 24px',
				fontSize: 34,
				color: red,
				borderLeft: `10px solid ${red}`,
				background: '#FCEDEC',
				opacity: drop,
				transform: `translateY(${(1 - drop) * -300}px) rotate(${(1 - drop) * (index % 2 ? 6 : -6)}deg)`,
				marginTop: -4,
			}}
		>
			{title}
		</Card>
	);
};

const TwoBadOptions: React.FC = () => {
	const frame = useCurrentFrame();
	const enter = useSpring(0, 15);
	const vanish = interpolate(frame, [at.lose + 4, at.lose + 22], [0, 1], clamp);
	const leftLabel = useSpring(at.lose, 14);
	const rightLabel = useSpring(at.bury, 14);
	const leave = interpolate(frame, [at.phone - 4, at.phone + 8], [0, 1], clamp);
	const count = Math.round(interpolate(frame, [at.bury, at.bury + 40], [1, 14], clamp));
	return (
		<AbsoluteFill style={{padding: '0 40px 360px', justifyContent: 'center', opacity: 1 - leave, transform: `translateY(${-leave * 120}px)`}}>
			<div
				style={{
					fontFamily: font.display,
					fontSize: 80,
					fontWeight: 700,
					letterSpacing: '-0.02em',
					color: color.ink,
					textAlign: 'center',
					opacity: enter,
				}}
			>
				What you didn't finish…
			</div>
			<div style={{display: 'flex', gap: 36, marginTop: 80}}>
				<div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36}}>
					<div style={{fontFamily: font.display, fontSize: 60, fontWeight: 700, color: color.ink3, opacity: leftLabel, transform: `scale(${leftLabel})`}}>
						Lose it
					</div>
					<Card
						style={{
							width: '100%',
							opacity: enter * (1 - vanish),
							filter: `blur(${vanish * 18}px)`,
							transform: `scale(${1 + vanish * 0.15}) translateY(${vanish * -60}px)`,
						}}
					>
						Call the clinic back
					</Card>
					{vanish > 0.6 ? (
						<div style={{fontFamily: font.body, fontSize: 40, color: color.ink3, opacity: (vanish - 0.6) / 0.4}}>
							…gone.
						</div>
					) : null}
				</div>
				<div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18}}>
					<div style={{fontFamily: font.display, fontSize: 52, fontWeight: 700, color: red, whiteSpace: 'nowrap', opacity: rightLabel, transform: `scale(${rightLabel})`}}>
						Bury you in red
					</div>
					<div
						style={{
							fontFamily: font.display,
							fontSize: 40,
							fontWeight: 700,
							color: '#FFFFFF',
							background: red,
							borderRadius: 999,
							padding: '8px 26px',
							opacity: rightLabel,
						}}
					>
						OVERDUE · {count}
					</div>
					{overdue.map((title, index) => (
						<OverdueCard key={title} title={title} index={index} />
					))}
				</div>
			</div>
		</AbsoluteFill>
	);
};

/* ---------------------------------------------------------------- HealthyFlow carries it */

const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const Section: React.FC<{title: string; dim: number; children: React.ReactNode}> = ({title, dim, children}) => (
	<div style={{margin: '0 40px 40px', opacity: 1 - dim * 0.65}}>
		<div style={{fontFamily: font.body, fontSize: 32, fontWeight: 600, letterSpacing: '0.08em', color: color.ink3, marginBottom: 20}}>
			{title}
		</div>
		{children}
	</div>
);

const Check: React.FC<{done?: boolean; glow?: number}> = ({done, glow = 0}) => (
	<div
		style={{
			width: 68,
			height: 68,
			borderRadius: 999,
			border: `4px solid ${done ? color.accent : color.line}`,
			background: done ? color.accent : 'transparent',
			boxShadow: glow ? `0 0 0 ${glow * 12}px rgba(70,101,90,${0.25 * glow})` : 'none',
			flexShrink: 0,
		}}
	/>
);

const Row: React.FC<{hue: string; children: React.ReactNode; check: React.ReactNode; style?: React.CSSProperties}> = ({hue, children, check, style}) => (
	<div
		style={{
			display: 'flex',
			alignItems: 'center',
			gap: 28,
			padding: '30px 30px',
			borderRadius: 30,
			background: color.raised,
			borderLeft: `14px solid ${hue}`,
			boxShadow: '0 8px 20px rgba(26,25,23,0.08)',
			...style,
		}}
	>
		{check}
		<div style={{flex: 1}}>{children}</div>
	</div>
);

// One day as HealthyFlow shows it. `friday` switches the carried task and fresh habit on.
const Day: React.FC<{friday: boolean; local: (f: number) => number}> = ({friday, local}) => {
	const frame = useCurrentFrame();
	const tag = useSpring(local(at.tag), 11);
	const habitFocus = interpolate(frame, [local(at.habits), local(at.habits) + 8], [0, 1], clamp);
	const missDot = interpolate(frame, [local(at.miss), local(at.miss) + 8], [0, 1], clamp);
	const freshGlow = friday ? interpolate(frame, [local(at.fresh), local(at.fresh) + 6, local(at.fresh) + 26], [0, 1, 0.6], clamp) : 0;
	const todayIndex = friday ? 4 : 3;
	return (
		<AbsoluteFill>
			<ScreenHeader title={friday ? 'Friday' : 'Thursday'} sub={friday ? '17 October · 07:30' : '16 October · 22:40'} />
			<div style={{height: 56}} />
			<Section title="ANYTIME" dim={friday ? habitFocus : 0}>
				<Row hue={category.personal} check={<Check />}>
					<div style={{fontFamily: font.display, fontSize: 48, fontWeight: 600, color: color.ink}}>Call the clinic back</div>
					{friday ? (
						<div
							style={{
								display: 'inline-block',
								marginTop: 10,
								padding: '8px 20px',
								borderRadius: 14,
								background: color.accentSoft,
								color: color.accentStrong,
								fontFamily: font.body,
								fontSize: 32,
								fontWeight: 600,
								opacity: tag,
								transform: `scale(${0.6 + 0.4 * tag})`,
								transformOrigin: 'left center',
							}}
						>
							↪ from Thu
						</div>
					) : (
						<div style={{marginTop: 8, fontFamily: font.body, fontSize: 30, color: color.ink3}}>Not done yet</div>
					)}
				</Row>
			</Section>
			<Section title="HABITS" dim={0}>
				<Row hue={category.health} check={<Check glow={freshGlow} />} style={{transform: `scale(${1 + habitFocus * 0.03})`}}>
					<div style={{fontFamily: font.display, fontSize: 48, fontWeight: 600, color: color.ink}}>Read 20 pages</div>
					<div style={{display: 'flex', gap: 18, marginTop: 22}}>
						{week.map((d, i) => {
							const done = i < 3;
							const missed = friday && i === 3;
							const isToday = i === todayIndex;
							return (
								<div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6}}>
									<div
										style={{
											width: 44,
											height: 44,
											borderRadius: 999,
											background: done ? color.accent : missed ? `rgba(139,133,122,${0.25 + 0.35 * missDot})` : 'transparent',
											border: isToday ? `3px solid ${color.accent}` : done || missed ? 'none' : `3px solid ${color.line}`,
										}}
									/>
									<div style={{fontFamily: font.body, fontSize: 26, color: isToday ? color.accent : color.ink3, fontWeight: isToday ? 700 : 400}}>{d}</div>
								</div>
							);
						})}
					</div>
				</Row>
				{friday ? (
					<div style={{marginTop: 24, fontFamily: font.body, fontSize: 34, lineHeight: 1.3, color: color.ink3, opacity: missDot}}>
						Thursday missed — no backlog, today starts fresh.
					</div>
				) : null}
			</Section>
			<Section title="SCHEDULED" dim={0.55}>
				{(friday
					? [
							{t: 'Standup', time: '9:30', hue: category.work},
							{t: 'Gym', time: '18:00', hue: category.training},
						]
					: [
							{t: 'Standup', time: '9:30', hue: category.work, done: true},
							{t: 'Dinner with Noa', time: '20:00', hue: category.personal, done: true},
						]
				).map((r) => (
					<Row key={r.t} hue={r.hue} check={<Check done={'done' in r} />} style={{marginBottom: 16, padding: '22px 32px'}}>
						<div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
							<span style={{fontFamily: font.display, fontSize: 38, fontWeight: 600, color: color.ink}}>{r.t}</span>
							<span style={{fontFamily: font.body, fontSize: 28, color: color.ink3}}>{r.time}</span>
						</div>
					</Row>
				))}
			</Section>
		</AbsoluteFill>
	);
};

const Days: React.FC = () => {
	const frame = useCurrentFrame();
	const local = (f: number) => f - at.phone;
	const flip = interpolate(frame, [local(at.flip) - 4, local(at.flip) + 10], [0, 1], {
		...clamp,
		easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
	});
	return (
		<AbsoluteFill>
			<AbsoluteFill style={{transform: `translateX(${-flip * 100}%)`}}>
				<Day friday={false} local={local} />
			</AbsoluteFill>
			<AbsoluteFill style={{transform: `translateX(${(1 - flip) * 100}%)`}}>
				<Day friday local={local} />
			</AbsoluteFill>
		</AbsoluteFill>
	);
};

export const HealthyFlowRollover: React.FC = () => (
	<AbsoluteFill style={{background: color.canvas}}>
		<Audio src={staticFile('vo-rollover.mp3')} />
		<Sequence durationInFrames={at.phone + 10}>
			<TwoBadOptions />
		</Sequence>
		<Sequence from={at.phone} durationInFrames={at.outro - at.phone + 6}>
			<Phone exitAt={at.outro - at.phone}>
				<Days />
			</Phone>
		</Sequence>
		<Sequence durationInFrames={at.outro}>
			<Captions captions={captions} />
		</Sequence>
		<Sequence from={at.outro}>
			<Outro lead="" punch="Nothing silently dropped." />
		</Sequence>
	</AbsoluteFill>
);
