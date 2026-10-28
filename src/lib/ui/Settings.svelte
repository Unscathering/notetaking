<script lang="ts">
	// Every look-and-feel choice in one place, applied the moment you change it.
	import { fly, fade } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { FONT_CHOICES, PRESETS, cloneTheme, type MotionStyle, type Theme } from "../theme/theme";
	import { theme, useTheme } from "../theme/store.svelte";
	import { writing } from "../writing.svelte";
	import { ICONS } from "./icons";

	interface Props {
		ms: number;
		onclose: () => void;
	}
	let { ms, onclose }: Props = $props();

	const COLORS: Array<[keyof Theme["colors"], string]> = [
		["accent", "Accent"], ["bg", "Background"], ["panel", "Sidebar"], ["raised", "Cards and tabs"],
		["text", "Text"], ["muted", "Quiet text"], ["heading", "Headings"], ["link", "Links"], ["code", "Code"], ["border", "Lines"],
	];
	const MOTION: Array<[MotionStyle, string]> = [["smooth", "Smooth"], ["snappy", "Snappy"], ["bouncy", "Bouncy"], ["off", "Off"]];

	const fontName = (css: string) => Object.entries(FONT_CHOICES).find(([, v]) => v === css)?.[0] ?? "Custom";

	function exportTheme() {
		const blob = new Blob([JSON.stringify(theme, null, 2)], { type: "application/json" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `${theme.name || "theme"}.basalt-theme.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function importTheme(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			useTheme({ ...cloneTheme(theme), ...(JSON.parse(await file.text()) as Theme) });
		} catch {
			alert("That file isn't a Basalt theme.");
		}
	}
</script>

<div class="scrim" transition:fade={{ duration: ms }} onclick={onclose} role="presentation"></div>
<aside class="panel" transition:fly={{ x: 40, duration: ms, easing: cubicOut, opacity: 0 }} aria-label="Settings">
	<header>
		<h2>Appearance</h2>
		<button class="icon" onclick={onclose} title="Close (Esc)">{@html ICONS.x}</button>
	</header>

	<section>
		<h3>Themes</h3>
		<div class="presets">
			{#each PRESETS as p (p.name)}
				<button class="preset" class:is-on={theme.name === p.name} onclick={() => useTheme(p)} style:--p-bg={p.colors.bg} style:--p-panel={p.colors.panel} style:--p-accent={p.colors.accent} style:--p-text={p.colors.text}>
					<span class="swatch"><i></i><b></b><em></em></span>
					<span>{p.name}</span>
				</button>
			{/each}
		</div>
		<div class="row-buttons">
			<button class="ghost" onclick={exportTheme}>Save theme to a file</button>
			<label class="ghost">Load a theme file<input type="file" accept=".json" onchange={importTheme} hidden /></label>
		</div>
	</section>

	<section>
		<h3>Colors</h3>
		<div class="colors">
			{#each COLORS as [key, label] (key)}
				<label class="color">
					<input type="color" bind:value={theme.colors[key]} oninput={() => (theme.name = "Custom")} />
					<span>{label}</span>
				</label>
			{/each}
		</div>
	</section>

	<section>
		<h3>Text</h3>
		<label class="field">
			<span>Note font</span>
			<select value={fontName(theme.type.editorFont)} onchange={(e) => (theme.type.editorFont = FONT_CHOICES[e.currentTarget.value])}>
				{#each Object.keys(FONT_CHOICES) as f (f)}<option>{f}</option>{/each}
			</select>
		</label>
		<label class="field">
			<span>Interface font</span>
			<select value={fontName(theme.type.uiFont)} onchange={(e) => (theme.type.uiFont = FONT_CHOICES[e.currentTarget.value])}>
				{#each Object.keys(FONT_CHOICES) as f (f)}<option>{f}</option>{/each}
			</select>
		</label>
		<label class="slider"><span>Text size</span><input type="range" min="12" max="26" step="1" bind:value={theme.type.size} /><output>{theme.type.size}px</output></label>
		<label class="slider"><span>Line spacing</span><input type="range" min="1.2" max="2.2" step="0.05" bind:value={theme.type.lineHeight} /><output>{theme.type.lineHeight.toFixed(2)}</output></label>
		<label class="slider"><span>Text width</span><input type="range" min="0" max="120" step="2" bind:value={theme.type.width} /><output>{theme.type.width === 0 ? "Full" : theme.type.width}</output></label>
		<label class="slider"><span>Heading size</span><input type="range" min="1" max="1.5" step="0.01" bind:value={theme.type.headingScale} /><output>{theme.type.headingScale.toFixed(2)}×</output></label>
	</section>

	<section>
		<h3>Shape</h3>
		<label class="slider"><span>Corners</span><input type="range" min="0" max="20" step="1" bind:value={theme.shape.radius} /><output>{theme.shape.radius}px</output></label>
		<label class="slider"><span>Spacing</span><input type="range" min="0.6" max="1.5" step="0.05" bind:value={theme.shape.density} /><output>{theme.shape.density.toFixed(2)}×</output></label>
		<label class="slider"><span>Sidebar width</span><input type="range" min="180" max="440" step="10" bind:value={theme.shape.sidebarWidth} /><output>{theme.shape.sidebarWidth}px</output></label>
	</section>

	<section>
		<h3>Writing</h3>
		<label class="toggle"><input type="checkbox" bind:checked={writing.typewriter} /><span><b>Typewriter scrolling</b>Keeps the line you're on in the middle of the screen.</span></label>
		<label class="toggle"><input type="checkbox" bind:checked={writing.dimOthers} /><span><b>Dim other paragraphs</b>Fades everything except the paragraph you're in.</span></label>
		<label class="toggle"><input type="checkbox" bind:checked={writing.spellcheck} /><span><b>Spell check</b>Underlines misspelled words.</span></label>
		<label class="toggle"><input type="checkbox" bind:checked={writing.focus} /><span><b>Focus mode</b>Hides everything but the note. Ctrl+Shift+Enter, Esc to leave.</span></label>
	</section>

	<section>
		<h3>Motion</h3>
		<div class="segmented">
			{#each MOTION as [style, label] (style)}
				<button class:is-on={theme.motion.style === style} onclick={() => (theme.motion.style = style)}>{label}</button>
			{/each}
		</div>
		<label class="slider" class:is-off={theme.motion.style === "off"}><span>Speed</span><input type="range" min="0.4" max="2.5" step="0.1" bind:value={theme.motion.speed} disabled={theme.motion.style === "off"} /><output>{theme.motion.speed.toFixed(1)}×</output></label>
	</section>
</aside>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: color-mix(in srgb, black 35%, transparent);
		z-index: 40;
	}
	.panel {
		position: fixed;
		top: 10px;
		right: 10px;
		bottom: 10px;
		width: min(400px, calc(100vw - 20px));
		overflow-y: auto;
		z-index: 41;
		padding: 18px 20px 28px;
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		color: var(--heading);
	}
	h3 {
		margin: 0 0 10px;
		font-size: 12px;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted);
	}
	section {
		padding: 18px 0 6px;
		border-bottom: 1px solid var(--border);
	}
	.toggle {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		margin-bottom: 12px;
		font-size: 13px;
		color: var(--muted);
		cursor: pointer;
	}
	.toggle b {
		display: block;
		margin-bottom: 1px;
		color: var(--text);
		font-weight: 600;
	}
	.toggle input {
		flex: none;
		margin-top: 2px;
		accent-color: var(--accent);
		width: 15px;
		height: 15px;
	}
	section:last-child {
		border-bottom: 0;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 8px;
	}
	.preset {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px 6px 8px;
		border: 1.5px solid var(--border);
		border-radius: var(--radius);
		background: var(--raised);
		color: var(--text);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
	}
	.preset:hover {
		transform: translateY(-2px);
	}
	.preset.is-on {
		border-color: var(--accent);
	}
	.swatch {
		display: grid;
		grid-template-columns: 1fr 2fr;
		height: 44px;
		border-radius: calc(var(--radius) * 0.7);
		overflow: hidden;
		background: var(--p-bg);
	}
	.swatch i {
		background: var(--p-panel);
	}
	.swatch b {
		position: relative;
	}
	.swatch b::before,
	.swatch b::after {
		content: "";
		position: absolute;
		left: 10px;
		height: 4px;
		border-radius: 2px;
	}
	.swatch b::before {
		top: 12px;
		width: 55%;
		background: var(--p-text);
	}
	.swatch b::after {
		top: 24px;
		width: 35%;
		background: var(--p-accent);
	}
	.swatch em {
		display: none;
	}
	.colors {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 12px;
	}
	.color {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13.5px;
		cursor: pointer;
	}
	.color input {
		width: 26px;
		height: 26px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: none;
		cursor: pointer;
		overflow: hidden;
	}
	.color input::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	.color input::-webkit-color-swatch {
		border: 0;
		border-radius: 50%;
	}
	.field,
	.slider {
		display: grid;
		grid-template-columns: 110px 1fr auto;
		align-items: center;
		gap: 10px;
		margin: 0 0 10px;
		font-size: 13.5px;
	}
	.field {
		grid-template-columns: 110px 1fr;
	}
	.slider output {
		min-width: 44px;
		text-align: right;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.slider.is-off {
		opacity: 0.45;
	}
	input[type="range"] {
		accent-color: var(--accent);
		width: 100%;
	}
	select {
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.75);
		background: var(--raised);
		color: var(--text);
		font: inherit;
	}
	.segmented {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		padding: 3px;
		margin-bottom: 12px;
		border-radius: var(--radius);
		background: var(--raised);
	}
	.segmented button {
		padding: 6px 0;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.segmented button.is-on {
		background: var(--accent);
		color: var(--on-accent);
	}
	.row-buttons {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.ghost {
		flex: 1;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		text-align: center;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease);
	}
	.ghost:hover {
		background: var(--hover);
	}
	.icon {
		display: inline-flex;
		padding: 6px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.icon:hover {
		background: var(--hover);
		color: var(--text);
	}
</style>
