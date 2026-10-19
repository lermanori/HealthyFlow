import {Composition} from 'remotion';
import {HealthyFlowHonestClock, HONEST_DURATION} from './honest';
import {HealthyFlowRollover, ROLLOVER_DURATION} from './rollover';
import {HealthyFlowSocial, SOCIAL_DURATION} from './social';
import {FPS} from './timing';

const vertical = {fps: FPS, width: 1080, height: 1920} as const;

export const RemotionRoot: React.FC = () => (
	<>
		<Composition id="HealthyFlowSocial" component={HealthyFlowSocial} durationInFrames={SOCIAL_DURATION} {...vertical} />
		<Composition id="HealthyFlowHonestClock" component={HealthyFlowHonestClock} durationInFrames={HONEST_DURATION} {...vertical} />
		<Composition id="HealthyFlowRollover" component={HealthyFlowRollover} durationInFrames={ROLLOVER_DURATION} {...vertical} />
	</>
);
