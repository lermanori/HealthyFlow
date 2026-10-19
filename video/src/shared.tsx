import React, {useMemo} from 'react';
import type {Caption} from '@remotion/captions';
import {createTikTokStyleCaptions} from '@remotion/captions';
import {
	AbsoluteFill,
	Img,
	interpolate,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';
import {color, font} from './theme';
import {FPS} from './timing';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const useSpring = (delay: number, damping = 14) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return spring({frame: frame - delay, fps, config: {damping}});
};

/* ---------------------------------------------------------------- Phone */

const PHONE = {w: 780, h: 1330, top: 130};

// A phone that springs up on its first frame and shrinks away at `exitAt` (frames, local).
export const Phone: React.FC<{exitAt: number; children: React.ReactNode}> = ({exitAt, children}) => {
	const frame = useCurrentFrame();
	const enter = useSpring(0, 16);
	const exit = interpolate(frame, [exitAt - 8, exitAt + 4], [0, 1], clamp);
	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: (1080 - PHONE.w) / 2,
					top: PHONE.top,
					width: PHONE.w,
					height: PHONE.h,
					borderRadius: 110,
					border: `18px solid ${color.ink}`,
					background: color.surface,
					overflow: 'hidden',
					boxShadow: '0 60px 120px rgba(26,25,23,0.25)',
					transform: `translateY(${(1 - enter) * 1500 - exit * 200}px) scale(${1 - exit * 0.15})`,
					opacity: 1 - exit,
				}}
			>
				<div
					style={{
						position: 'absolute',
						top: 22,
						left: '50%',
						transform: 'translateX(-50%)',
						width: 220,
						height: 62,
						borderRadius: 40,
						background: color.ink,
						zIndex: 10,
					}}
				/>
				{children}
			</div>
		</AbsoluteFill>
	);
};

export const ScreenHeader: React.FC<{title: string; sub: string}> = ({title, sub}) => (
	<div style={{padding: '120px 56px 0'}}>
		<div style={{fontFamily: font.body, fontSize: 30, color: color.ink3, fontWeight: 500}}>{sub}</div>
		<div style={{fontFamily: font.display, fontSize: 72, fontWeight: 700, color: color.ink, letterSpacing: '-0.02em'}}>
			{title}
		</div>
	</div>
);

/* ---------------------------------------------------------------- Captions */

export const Captions: React.FC<{captions: Caption[]}> = ({captions}) => {
	const frame = useCurrentFrame();
	const {pages} = useMemo(
		() => createTikTokStyleCaptions({captions, combineTokensWithinMilliseconds: 1100}),
		[captions],
	);
	const ms = (frame / FPS) * 1000;
	const page = pages.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs);
	if (!page) return null;
	return (
		<AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 170}}>
			<div
				style={{
					maxWidth: 960,
					textAlign: 'center',
					fontFamily: font.display,
					fontWeight: 700,
					fontSize: 76,
					lineHeight: 1.15,
					letterSpacing: '-0.02em',
					whiteSpace: 'pre-wrap',
				}}
			>
				{page.tokens.map((t, i) => {
					const active = ms >= t.fromMs && ms < t.toMs;
					return (
						<span
							key={`${page.startMs}-${i}`}
							style={{
								color: active ? color.accent : color.ink,
								background: active ? color.accentSoft : 'transparent',
								borderRadius: 14,
							}}
						>
							{t.text}
						</span>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};

/* ---------------------------------------------------------------- Outro */

export const Outro: React.FC<{lead: string; punch: string}> = ({lead, punch}) => {
	const frame = useCurrentFrame();
	const bg = interpolate(frame, [0, 10], [0, 1], clamp);
	const logo = useSpring(4, 12);
	const line = useSpring(14, 16);
	const pill = useSpring(26, 14);
	return (
		<AbsoluteFill style={{background: `rgba(26,25,23,${bg})`, alignItems: 'center', justifyContent: 'center'}}>
			<Img src={staticFile('logo.png')} style={{width: 220, height: 220, borderRadius: 54, transform: `scale(${logo})`}} />
			<div
				style={{
					marginTop: 48,
					fontFamily: font.display,
					fontSize: 120,
					fontWeight: 700,
					letterSpacing: '-0.03em',
					color: color.onAccent,
					transform: `scale(${logo})`,
				}}
			>
				HealthyFlow
			</div>
			<div
				style={{
					marginTop: 28,
					width: 820,
					textAlign: 'center',
					fontFamily: font.body,
					fontSize: 52,
					lineHeight: 1.3,
					color: '#E4E0D6',
					opacity: line,
					transform: `translateY(${(1 - line) * 40}px)`,
				}}
			>
				{lead}
				{lead ? <br /> : null}
				<span style={{color: '#A9C7B6', fontWeight: 600}}>{punch}</span>
			</div>
			<div
				style={{
					marginTop: 80,
					padding: '26px 56px',
					borderRadius: 999,
					background: '#A9C7B6',
					color: '#14201A',
					fontFamily: font.display,
					fontWeight: 600,
					fontSize: 44,
					opacity: pill,
					transform: `scale(${0.8 + 0.2 * pill})`,
				}}
			>
				Free on iPhone
			</div>
		</AbsoluteFill>
	);
};
