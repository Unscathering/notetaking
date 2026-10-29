<script lang="ts" module>
	// Reopening Appearance returns to the page you were on.
	let lastPage = "themes";
</script>

<script lang="ts">
	// Every look-and-feel choice, as pages of picture cards. Changes apply the
	// moment you make them; hold "Peek" to see the app behind this window.
	import type { Component } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { PRESETS, cloneTheme, type Theme } from "../theme/theme";
	import { theme, useTheme } from "../theme/store.svelte";
	import { icon, type IconName } from "./icons";
	import "./settings/settings.css";
	import ThemesPage from "./settings/ThemesPage.svelte";
	import ColorsPage from "./settings/ColorsPage.svelte";
	import BackgroundPage from "./settings/BackgroundPage.svelte";
	import GlassPage from "./settings/GlassPage.svelte";
	import TextPage from "./settings/TextPage.svelte";
	import LayoutPage from "./settings/LayoutPage.svelte";
	import SidebarPage from "./settings/SidebarPage.svelte";
	import MotionPage from "./settings/MotionPage.svelte";
	import WritingPage from "./settings/WritingPage.svelte";
	import SnippetsPage from "./settings/SnippetsPage.svelte";
	import GalleryPage from "./settings/GalleryPage.svelte";

	interface Props {
		ms: number;
		onclose: () => void;
	}
	let { ms, onclose }: Props = $props();

	const PAGES: Array<{ id: string; label: string; ico: IconName; title: string; about: string; page: Component }> = [
		{ id: "themes", label: "Themes", ico: "palette", title: "Themes", about: "Start from a complete look, then make it yours on the other pages.", page: ThemesPage },
		{ id: "colors", label: "Colors", ico: "droplet", title: "Colors", about: "Pick an accent, or change any color in the app.", page: ColorsPage },
		{ id: "background", label: "Background", ico: "image", title: "Background", about: "Put a picture behind everything.", page: BackgroundPage },
		{ id: "glass", label: "Glass", ico: "sparkles", title: "Glass", about: "Make panels see-through: clear, frosted or liquid glass.", page: GlassPage },
		{ id: "text", label: "Text & headings", ico: "type", title: "Text & headings", about: "Fonts, sizes, spacing and how headings stand out.", page: TextPage },
		{ id: "sidebar", label: "Sidebar", ico: "folder", title: "Sidebar", about: "How your folders and notes look in the list on the left.", page: SidebarPage },
		{ id: "layout", label: "Layout", ico: "layout", title: "Layout", about: "Corners, spacing and the size of things.", page: LayoutPage },
		{ id: "motion", label: "Motion", ico: "zap", title: "Motion", about: "How the app moves. Every example is playing live.", page: MotionPage },
		{ id: "writing", label: "Writing", ico: "pencil", title: "Writing", about: "Helpers for when you're writing.", page: WritingPage },
		{ id: "gallery", label: "Gallery", ico: "globe", title: "Gallery", about: "Themes, snippets and dashboards shared by people who use Basalt. One click adds one.", page: GalleryPage },
		{ id: "snippets", label: "Snippets", ico: "code", title: "CSS snippets", about: "Your own styles, on top of everything else. For tinkerers.", page: SnippetsPage },
	];

	let page = $state(lastPage);
	let peeking = $state(false);
	let scroller: HTMLElement | undefined = $state();
	const current = $derived(PAGES.find((p) => p.id === page) ?? PAGES[0]);
	$effect(() => {
		lastPage = page;
		// Each page starts at its top.
		if (scroller) scroller.scrollTop = 0;
	});

	/** The preset the theme still matches, if any. */
	const looks = (t: Theme) => JSON.stringify({ ...t, name: "", group: undefined });
	const matching = $derived(PRESETS.find((p) => looks(p) === looks(theme)));

	function exportTheme() {
		const name = matching?.name ?? "My theme";
		const blob = new Blob([JSON.stringify({ ...theme, name }, null, 2)], { type: "application/json" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `${name}.basalt-theme.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function importTheme(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const loaded = JSON.parse(await file.text()) as Partial<Theme>;
			const now = cloneTheme(theme);
			useTheme({ ...now, ...loaded, colors: { ...now.colors, ...loaded.colors }, type: { ...now.type, ...loaded.type }, headings: { ...now.headings, ...loaded.headings }, shape: { ...now.shape, ...loaded.shape }, background: { ...now.background, ...loaded.background }, glass: { ...now.glass, ...loaded.glass }, motion: { ...now.motion, ...loaded.motion } });
		} catch {
			alert("That file isn't a Basalt theme.");
		}
	}
</script>

<div class="scrim" class:is-peeking={peeking} transition:fade={{ duration: ms }} onclick={onclose} role="presentation"></div>
<div class="window" class:is-peeking={peeking} transition:fly={{ y: 16, duration: ms, easing: cubicOut, opacity: 0 }} role="dialog" aria-label="Appearance">
	<nav>
		<div class="brand">
			<span class="brand-ico">{@html icon("palette", 16)}</span>
			<span><b>Appearance</b><small>{matching ? matching.name : "Your own theme"}</small></span>
		</div>
		{#each PAGES as p (p.id)}
			<button class="nav-item" class:is-on={page === p.id} onclick={() => (page = p.id)}>{@html icon(p.ico, 16)}{p.label}</button>
		{/each}
		<span class="gap"></span>
		<button class="nav-item peek" onpointerdown={() => (peeking = true)} onpointerup={() => (peeking = false)} onpointerleave={() => (peeking = false)} title="Hold to see the app behind this window">{@html icon("eye", 16)}Hold to peek</button>
		<div class="files">
			<button class="file" onclick={exportTheme} title="Save this theme as a file you can share">{@html icon("download", 14)}Save</button>
			<label class="file" title="Load a theme file">{@html icon("upload", 14)}Load<input type="file" accept=".json" onchange={importTheme} hidden /></label>
		</div>
	</nav>

	<div class="content">
		<header>
			<div>
				<h2>{current.title}</h2>
				<p>{current.about}</p>
			</div>
			<button class="close" onclick={onclose} title="Close (Esc)">{@html icon("x", 18)}</button>
		</header>
		<div class="scroll" bind:this={scroller}>
			{#key page}
				<div class="page" in:fly={{ y: 10, duration: ms, easing: cubicOut, opacity: 0 }}>
					<current.page />
				</div>
			{/key}
		</div>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: color-mix(in srgb, black 32%, transparent);
		transition: opacity var(--dur) var(--ease);
	}
	.window {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 41;
		display: grid;
		grid-template-columns: 220px 1fr;
		width: min(1060px, calc(100vw - 48px));
		height: min(740px, calc(100vh - 48px));
		translate: -50% -50%;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.6 + 4px);
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		box-shadow: var(--glass-edge), 0 40px 100px rgba(0, 0, 0, 0.45);
		transition: opacity var(--dur) var(--ease), scale var(--dur) var(--ease);
		/* Its own layer, drawn as one piece, so a change inside never leaves holes. */
		isolation: isolate;
		will-change: transform;
	}
	.scrim.is-peeking,
	.window.is-peeking {
		opacity: 0;
	}
	.window.is-peeking {
		scale: 0.97;
	}
	/* Keep the peek button reachable while everything else fades. */
	.window.is-peeking .peek {
		opacity: 1;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 16px 12px 14px;
		border-right: 1px solid var(--border);
		background: color-mix(in srgb, var(--panel) 55%, transparent);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 6px 16px;
	}
	.brand-ico {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
	}
	.brand b {
		display: block;
		font-size: 14px;
		color: var(--heading);
	}
	.brand small {
		font-size: 11.5px;
		color: var(--muted);
	}
	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: calc(8px * var(--density)) 10px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 13.5px;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.nav-item:hover {
		background: var(--hover);
		color: var(--text);
	}
	.nav-item.is-on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.nav-item.is-on :global(svg) {
		color: var(--accent);
	}
	.gap {
		flex: 1;
	}
	.peek {
		user-select: none;
	}
	.files {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}
	.file {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 7px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
		transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.file:hover {
		color: var(--text);
		border-color: var(--accent);
	}
	.content {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 22px 28px 16px;
	}
	h2 {
		margin: 0;
		font-size: 21px;
		letter-spacing: -0.01em;
		color: var(--heading);
	}
	header p {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--muted);
	}
	.close {
		display: inline-flex;
		padding: 7px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.close:hover {
		background: var(--hover);
		color: var(--text);
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 28px 30px;
		contain: paint;
	}
</style>
