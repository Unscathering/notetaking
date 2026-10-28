// Looping animation examples for the Motion page: each plays a move forward,
// holds, and plays it back, using a motion style's own curve and length.
import { EASING, type MotionStyle } from "../../theme/theme";

export interface DemoOptions {
	style: MotionStyle;
	speed: number;
	from: Keyframe;
	to: Keyframe;
	/** Seconds to hold at each end. */
	hold?: number;
}

export function demo(node: HTMLElement, opts: DemoOptions) {
	let anim: Animation | null = null;
	const play = (o: DemoOptions) => {
		anim?.cancel();
		const curve = EASING[o.style];
		const ms = o.style === "off" ? 1 : Math.round(curve.ms / Math.max(0.25, o.speed));
		const hold = (o.hold ?? 0.9) * 1000;
		const total = ms * 2 + hold * 2;
		anim = node.animate(
			[
				{ ...o.from, offset: 0, easing: curve.ease },
				{ ...o.to, offset: ms / total },
				{ ...o.to, offset: (ms + hold) / total, easing: curve.ease },
				{ ...o.from, offset: (ms * 2 + hold) / total },
				{ ...o.from, offset: 1 },
			],
			{ duration: total, iterations: Infinity }
		);
	};
	play(opts);
	return {
		update: play,
		destroy: () => anim?.cancel(),
	};
}
