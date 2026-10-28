<script lang="ts" module>
	// One right-click menu for the whole app. Open it with `showMenu`.
	import type { IconName } from "./icons";

	export interface MenuItem {
		label: string;
		icon?: IconName;
		danger?: boolean;
		run?: () => unknown;
		/** A row of color dots instead of a normal item. */
		colors?: { value: string; pick: (color: string) => unknown; current?: string };
		/** A grid of icons instead of a normal item. */
		icons?: { pick: (name: IconName | "") => unknown; current?: string };
	}

	let menu: { x: number; y: number; items: MenuItem[] } | null = $state(null);

	export function showMenu(e: MouseEvent, items: MenuItem[]) {
		e.preventDefault();
		e.stopPropagation();
		menu = { x: e.clientX, y: e.clientY, items };
	}

	export const closeMenu = () => (menu = null);
</script>

<script lang="ts">
	import { scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { FOLDER_ICONS, icon } from "./icons";

	let { ms }: { ms: number } = $props();

	const SWATCHES = ["", "#e8794a", "#e5a84b", "#d9c64a", "#7fc48b", "#4fb8b0", "#5b9bf0", "#7c8cff", "#b07cf0", "#e46fa8", "#e05d5d", "#9aa0a6"];

	let box: HTMLDivElement | undefined = $state();
	let pos = $state({ x: 0, y: 0 });

	// Keep the menu inside the window.
	$effect(() => {
		if (!menu || !box) return;
		const r = box.getBoundingClientRect();
		pos = { x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) };
	});

	function run(item: MenuItem) {
		menu = null;
		void item.run?.();
	}
</script>

<svelte:window onmousedown={(e) => menu && !box?.contains(e.target as Node) && (menu = null)} onkeydown={(e) => e.key === "Escape" && (menu = null)} onblur={() => (menu = null)} />

{#if menu}
	<div class="menu" bind:this={box} style:left="{pos.x}px" style:top="{pos.y}px" transition:scale={{ start: 0.96, duration: ms * 0.6, easing: cubicOut }} role="menu">
		{#each menu.items as item, i (i)}
			{#if item.colors}
				<div class="label">{item.label}</div>
				<div class="swatches">
					{#each SWATCHES as c (c)}
						<button class="swatch" class:is-on={(item.colors.current ?? "") === c} style:--c={c || "transparent"} title={c ? c : "No color"} onclick={() => { menu = null; void item.colors?.pick(c); }}>{#if !c}{@html icon("x", 12)}{/if}</button>
					{/each}
				</div>
			{:else if item.icons}
				<div class="label">{item.label}</div>
				<div class="icons">
					<button class="glyph" class:is-on={!item.icons.current} title="No icon" onclick={() => { menu = null; void item.icons?.pick(""); }}>{@html icon("x", 14)}</button>
					{#each FOLDER_ICONS as name (name)}
						<button class="glyph" class:is-on={item.icons.current === name} title={name} onclick={() => { menu = null; void item.icons?.pick(name); }}>{@html icon(name, 15)}</button>
					{/each}
				</div>
			{:else if item.label === "-"}
				<hr />
			{:else}
				<button class="item" class:danger={item.danger} onclick={() => run(item)} role="menuitem">
					{#if item.icon}<span class="ico">{@html icon(item.icon, 15)}</span>{/if}
					{item.label}
				</button>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.menu {
		position: fixed;
		z-index: 60;
		min-width: 210px;
		max-width: 260px;
		padding: 5px;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--glass-edge), 0 16px 40px rgba(0, 0, 0, 0.35);
		transform-origin: top left;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 7px 10px;
		border: 0;
		border-radius: calc(var(--radius) * 0.7);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
	}
	.item:hover {
		background: var(--accent-soft);
	}
	.item.danger {
		color: #e05d5d;
	}
	.ico {
		display: inline-flex;
		color: var(--muted);
	}
	hr {
		margin: 5px 4px;
		border: 0;
		border-top: 1px solid var(--border);
	}
	.label {
		padding: 6px 10px 4px;
		color: var(--muted);
		font-size: 11.5px;
		font-weight: 650;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.swatches,
	.icons {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 4px;
		padding: 2px 8px 8px;
	}
	.swatch {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		border: 2px solid transparent;
		border-radius: 50%;
		background: var(--c);
		box-shadow: inset 0 0 0 1px var(--border);
		color: var(--muted);
		cursor: pointer;
		transition: transform var(--dur) var(--ease);
	}
	.swatch:hover {
		transform: scale(1.12);
	}
	.swatch.is-on {
		border-color: var(--text);
	}
	.glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		border: 0;
		border-radius: calc(var(--radius) * 0.6);
		background: transparent;
		color: var(--text);
		cursor: pointer;
	}
	.glyph:hover {
		background: var(--hover);
	}
	.glyph.is-on {
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>
