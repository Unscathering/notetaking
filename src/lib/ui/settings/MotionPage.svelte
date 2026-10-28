<script lang="ts">
	import { EASING, type MotionStyle } from "../../theme/theme";
	import { theme } from "../../theme/store.svelte";
	import { demo } from "./demo";
	import Slider from "./Slider.svelte";

	const STYLES: Array<[MotionStyle, string, string]> = [
		["smooth", "Smooth", "Glides out quickly and settles gently. Calm and polished."],
		["snappy", "Snappy", "Short and crisp. Things are just there."],
		["bouncy", "Bouncy", "Overshoots a touch and springs back. Playful."],
		["off", "Off", "No animation at all. Everything changes instantly."],
	];

	/** The timing curve drawn as a line, from start (bottom left) to end (top right). */
	function curve(style: MotionStyle) {
		if (style === "off") return "M 6 54 L 6 6 L 94 6";
		const [x1, y1, x2, y2] = EASING[style].ease.match(/-?[\d.]+/g)!.map(Number);
		const X = (x: number) => 6 + x * 88, Y = (y: number) => 54 - y * 48;
		return `M ${X(0)} ${Y(0)} C ${X(x1)} ${Y(y1)}, ${X(x2)} ${Y(y2)}, ${X(1)} ${Y(1)}`;
	}

	const speed = $derived(theme.motion.speed);
	const style = $derived(theme.motion.style);
	const ms = (s: MotionStyle) => (s === "off" ? 0 : Math.round(EASING[s].ms / Math.max(0.25, speed)));
</script>

<section class="st-section">
	<h3 class="st-h">Style</h3>
	<p class="st-sub">How things move when menus open, notes switch and cards are dragged. Each example below is playing in that style.</p>
	<div class="st-grid" style:--min="200px">
		{#each STYLES as [id, name, about] (id)}
			<button class="st-card" class:is-on={style === id} onclick={() => (theme.motion.style = id)}>
				<span class="stage">
					<span class="menu" use:demo={{ style: id, speed, from: { opacity: 0, transform: "translateY(10px) scale(0.9)" }, to: { opacity: 1, transform: "none" } }}>
						<i></i><i></i><i class="short"></i>
					</span>
					<span class="track"><span class="ball" use:demo={{ style: id, speed, from: { left: "0%" }, to: { left: "calc(100% - 14px)" } }}></span></span>
					<svg class="curve" viewBox="0 0 100 60" aria-hidden="true"><path d={curve(id)} /></svg>
				</span>
				<span class="name">{name}<small>{id === "off" ? "instant" : `${ms(id)} ms`}</small></span>
				<span class="about">{about}</span>
			</button>
		{/each}
	</div>
</section>

<section class="st-section" class:is-off={style === "off"}>
	<h3 class="st-h">Speed</h3>
	<p class="st-sub">Slow everything down to enjoy it, or speed it up to stay out of your way.</p>
	<Slider label="Speed" bind:value={theme.motion.speed} min={0.4} max={2.5} step={0.1} format={(v) => `${v.toFixed(1)}×  ·  ${ms(style)} ms`} ends={["Slower", "Faster"]} disabled={style === "off"} />
</section>

<section class="st-section">
	<h3 class="st-h">In the app</h3>
	<p class="st-sub">Your current choice, on things you'll actually see.</p>
	<div class="st-grid examples" style:--min="160px">
		<div class="example">
			<div class="ex-stage">
				<span class="btn"></span>
				<span class="pop" use:demo={{ style, speed, from: { opacity: 0, transform: "translateY(-6px) scale(0.92)" }, to: { opacity: 1, transform: "none" } }}><i></i><i></i><i class="short"></i></span>
			</div>
			<span>Opening a menu</span>
		</div>
		<div class="example">
			<div class="ex-stage">
				<span class="note" use:demo={{ style, speed, hold: 1.2, from: { opacity: 0.25, transform: "translateY(12px)" }, to: { opacity: 1, transform: "none" } }}><b></b><i></i><i></i><i class="short"></i></span>
			</div>
			<span>Switching notes</span>
		</div>
		<div class="example">
			<div class="ex-stage lists">
				<span class="list"></span><span class="list"></span>
				<span class="drag" use:demo={{ style, speed, from: { left: "18px", transform: "rotate(0deg)" }, to: { left: "calc(50% + 8px)", transform: "rotate(3deg)" } }}><i></i></span>
			</div>
			<span>Moving a card</span>
		</div>
		<div class="example">
			<div class="ex-stage side-stage">
				<span class="side" use:demo={{ style, speed, from: { transform: "translateX(-100%)", opacity: 0 }, to: { transform: "none", opacity: 1 } }}><i></i><i></i><i></i></span>
			</div>
			<span>Opening the sidebar</span>
		</div>
	</div>
</section>

<style>
	.stage {
		position: relative;
		display: block;
		height: 120px;
		overflow: hidden;
		border-radius: var(--radius);
		background: var(--bg);
	}
	.menu {
		position: absolute;
		top: 14px;
		left: 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 44%;
		padding: 9px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.8);
		background: var(--raised);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
		transform-origin: top left;
	}
	.menu i,
	.pop i,
	.side i,
	.note i {
		height: 6px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.menu i:first-child,
	.pop i:first-child {
		background: var(--accent);
	}
	.menu i.short,
	.pop i.short,
	.note i.short {
		width: 60%;
	}
	.track {
		position: absolute;
		left: 14px;
		right: 14px;
		bottom: 16px;
		height: 14px;
		border-radius: 14px;
		background: var(--hover);
	}
	.ball {
		position: absolute;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 12px var(--accent);
	}
	.curve {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 34%;
		overflow: visible;
	}
	.curve path {
		fill: none;
		stroke: var(--accent);
		stroke-width: 3;
		stroke-linecap: round;
		opacity: 0.8;
	}
	.is-off {
		opacity: 0.55;
	}
	.example {
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.ex-stage {
		position: relative;
		height: 110px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		background: var(--bg);
	}
	.btn {
		position: absolute;
		top: 12px;
		left: 12px;
		width: 30px;
		height: 14px;
		border-radius: 5px;
		background: var(--accent);
	}
	.pop {
		position: absolute;
		top: 32px;
		left: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 62%;
		padding: 9px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.8);
		background: var(--raised);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
		transform-origin: top left;
	}
	.note {
		position: absolute;
		inset: 14px 18px;
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.note b {
		width: 55%;
		height: 10px;
		margin-bottom: 4px;
		border-radius: 3px;
		background: var(--heading);
	}
	.lists {
		display: flex;
		gap: 10px;
		padding: 10px;
	}
	.list {
		flex: 1;
		border-radius: calc(var(--radius) * 0.8);
		background: var(--panel);
	}
	.drag {
		position: absolute;
		top: 22px;
		left: 18px;
		width: calc(50% - 26px);
		height: 30px;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.7);
		background: var(--raised);
		box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
	}
	.drag i {
		display: block;
		width: 70%;
		height: 6px;
		border-radius: 3px;
		background: var(--accent);
	}
	.side {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		display: flex;
		flex-direction: column;
		gap: 7px;
		width: 42%;
		padding: 14px 10px;
		border-right: 1px solid var(--border);
		background: var(--panel);
	}
</style>
