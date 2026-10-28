<script lang="ts">
	import { themeVars, type Material } from "../../theme/theme";
	import { theme } from "../../theme/store.svelte";
	import MiniApp from "./MiniApp.svelte";
	import Slider from "./Slider.svelte";
	import Switch from "./Switch.svelte";

	const MATERIALS: Array<{ id: Material; name: string; about: string; tint: number; blur: number }> = [
		{ id: "solid", name: "Solid", about: "Plain, opaque panels. The lightest on your computer.", tint: 100, blur: 0 },
		{ id: "glass", name: "Glass", about: "Clear panels with a soft blur behind them.", tint: 45, blur: 16 },
		{ id: "frosted", name: "Frosted glass", about: "Thick, milky blur with a fine grain, like a frosted window.", tint: 55, blur: 34 },
		{ id: "liquid", name: "Liquid glass", about: "Bends the light behind it, with bright, wet-looking edges.", tint: 35, blur: 6 },
	];

	/** The look of a sample chip in a material, using the theme's own colors. */
	const sample = (m: (typeof MATERIALS)[number]) => {
		const v = themeVars({ ...theme, glass: { ...theme.glass, material: m.id, tint: m.tint, blur: m.blur } });
		return `background-color:${v["--surface-panel"]};background-image:${v["--glass-grain"]};backdrop-filter:${v["--glass-filter"].replace("basalt-liquid", "basalt-liquid-mini")};box-shadow:${v["--glass-edge"]}`;
	};

	function pick(m: (typeof MATERIALS)[number]) {
		Object.assign(theme.glass, { material: m.id, tint: m.tint, blur: m.blur });
		if (m.id === "liquid") theme.glass.floating = true;
		if (m.id !== "solid" && theme.glass.page === 100) theme.glass.page = 60;
	}

	// Sliders speak in "see-through", the opposite of how much color covers.
	const clear = () => 100 - theme.glass.tint;
	const setClear = (v: number) => (theme.glass.tint = 100 - v);
	const pageClear = () => 100 - theme.glass.page;
	const setPageClear = (v: number) => (theme.glass.page = 100 - v);
	const solid = $derived(theme.glass.material === "solid");
</script>

<section class="st-section st-top">
	<div class="st-preview"><MiniApp t={theme} /><span>Live preview</span></div>
	<div>
		<h3 class="st-h">Fine-tuning</h3>
		<p class="st-sub">How clear the glass is and how much it blurs.</p>
		<Slider label="See-through" bind:value={clear, setClear} min={0} max={90} format={(v) => `${v}%`} ends={["Covered", "Clear"]} disabled={solid} />
		<Slider label="Blur" bind:value={theme.glass.blur} min={0} max={60} format={(v) => `${v}px`} ends={["Crisp", "Soft"]} disabled={solid} />
		<Slider label="Note page see-through" bind:value={pageClear, setPageClear} min={0} max={90} format={(v) => (v ? `${v}%` : "Solid")} ends={["Solid", "Clear"]} disabled={theme.background.kind === "none"} />
	</div>
</section>

{#if theme.background.kind === "none" && !solid}
	<div class="st-note">
		<span>Glass shows what's behind it. With no background picture there isn't much to see, except in menus over your notes.</span>
		<button onclick={() => Object.assign(theme.background, { kind: "wallpaper", fade: 25 })}>Add a background</button>
	</div>
{/if}

<section class="st-section">
	<h3 class="st-h">Material</h3>
	<p class="st-sub">What the sidebar, menus, dialogs and board lists are made of.</p>
	<div class="st-grid" style:--min="180px">
		{#each MATERIALS as m (m.id)}
			<button class="st-card" class:is-on={theme.glass.material === m.id} onclick={() => pick(m)}>
				<span class="stage">
					<i class="blob a"></i><i class="blob b"></i><i class="blob c"></i>
					<span class="pane" style={sample(m)}><b></b><s></s><s class="short"></s></span>
				</span>
				<span class="name">{m.name}</span>
				<span class="about">{m.about}</span>
			</button>
		{/each}
	</div>
</section>

<section class="st-section">
	<Switch title="Floating panels" about="Each part of the window becomes its own rounded island, with gaps between them." ico="layers" bind:checked={theme.glass.floating} />
</section>

<style>
	.stage {
		position: relative;
		display: grid;
		place-items: center;
		overflow: hidden;
		aspect-ratio: 16 / 10;
		border-radius: calc(var(--radius) * 0.9);
		background: #101425;
		isolation: isolate;
	}
	.blob {
		position: absolute;
		border-radius: 50%;
	}
	.blob.a {
		width: 60%;
		aspect-ratio: 1;
		left: -8%;
		top: -10%;
		background: radial-gradient(circle, #ff6fb5, transparent 70%);
	}
	.blob.b {
		width: 55%;
		aspect-ratio: 1;
		right: -6%;
		bottom: -20%;
		background: radial-gradient(circle, #34c6e0, transparent 70%);
	}
	.blob.c {
		width: 26%;
		aspect-ratio: 1;
		left: 46%;
		top: 18%;
		background: #ffd166;
	}
	.pane {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 64%;
		height: 58%;
		padding: 12px;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
	}
	.pane b {
		width: 50%;
		height: 9px;
		border-radius: 4px;
		background: var(--heading);
	}
	.pane s {
		width: 86%;
		height: 6px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--text) 55%, transparent);
	}
	.pane s.short {
		width: 60%;
	}
</style>
