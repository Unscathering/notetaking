<script lang="ts">
	import { flip } from "svelte/animate";
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import Editor from "./lib/editor/Editor.svelte";
	import Sidebar from "./lib/ui/Sidebar.svelte";
	import Ribbon from "./lib/ui/Ribbon.svelte";
	import Palette from "./lib/ui/Palette.svelte";
	import CaveSwitcher from "./lib/ui/CaveSwitcher.svelte";
	import Settings from "./lib/ui/Settings.svelte";
	import { icon } from "./lib/ui/icons";
	import { COMMANDS, keyName } from "./lib/commands";
	import { theme, trackTheme } from "./lib/theme/store.svelte";
	import { motionMs } from "./lib/theme/theme";
	import { noteTitle, pickCave } from "./lib/cave";
	import { startWorkspace, ws } from "./lib/workspace.svelte";

	trackTheme();
	startWorkspace();
	const ms = $derived(motionMs(theme));
	const words = $derived(ws.active ? (ws.texts.get(ws.active) ?? "").split(/\s+/).filter(Boolean).length : 0);

	let editorHost: HTMLElement | undefined = $state();
	let shown: string | null = null;

	// A soft fade and lift whenever another note comes to the front.
	$effect(() => {
		const a = ws.active;
		if (a && shown && a !== shown) editorHost?.animate([{ opacity: 0.35, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: ms, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
		shown = a;
	});

	async function chooseCave() {
		const cave = await pickCave();
		if (cave) await ws.load(cave);
	}

	function onkeydown(e: KeyboardEvent) {
		const key = keyName(e);
		if (key === "Escape" && ws.modal) {
			ws.modal = null;
		} else if (key === "Ctrl+Tab" || key === "Ctrl+Shift+Tab") {
			ws.nextTab(e.shiftKey ? -1 : 1);
		} else {
			const c = COMMANDS.find((c) => c.keys === key);
			if (!c) return;
			void c.run();
		}
		e.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

<div class="app" class:sidebar-closed={!ws.sidebarOpen}>
	<Ribbon />
	<aside class="sidebar">
		<Sidebar {ms} />
	</aside>

	<main class="main">
		<div class="tabbar">
			<div class="tabs" role="tablist">
				{#each ws.tabs as path (path)}
					<div class="tab" class:is-active={ws.active === path} animate:flip={{ duration: ms }} in:fly={{ y: 8, duration: ms, easing: cubicOut }} role="tab" aria-selected={ws.active === path}>
						<button class="tab-label" onclick={() => ws.open(path)} onauxclick={(e) => e.button === 1 && ws.closeTab(path)}>{noteTitle(path)}</button>
						<button class="tab-close" onclick={() => ws.closeTab(path)} title="Close (Ctrl+W)">{@html icon("x", 14)}</button>
					</div>
				{/each}
			</div>
		</div>

		<div class="editor-area" bind:this={editorHost}>
			{#if !ws.cave}
				<div class="start">
					<h1>Basalt</h1>
					<p>Your notes live in caves: plain Markdown files in a folder you choose.</p>
					<button class="primary" onclick={chooseCave}>Choose a folder for your first cave</button>
				</div>
			{:else if ws.active}
				<Editor path={ws.active} text={ws.texts.get(ws.active) ?? ""} onchange={(p, t) => ws.edited(p, t)} onopenlink={(t) => ws.follow(t)} />
			{:else}
				<div class="start">
					<p>No note open.</p>
					<button class="primary" onclick={() => ws.newNote()}>New note</button>
				</div>
			{/if}
		</div>

		<footer class="status">
			<span>{words} {words === 1 ? "word" : "words"}</span>
			<span class="saved" class:is-saving={ws.saving}>{ws.saving ? "Saving…" : "Saved"}</span>
		</footer>
	</main>
</div>

{#if ws.modal === "settings"}
	<Settings {ms} onclose={() => (ws.modal = null)} />
{:else if ws.modal === "palette" || ws.modal === "switcher"}
	{#key ws.modal}
		<Palette mode={ws.modal} {ms} />
	{/key}
{:else if ws.modal === "caves"}
	<CaveSwitcher {ms} />
{/if}

<style>
	.app {
		display: grid;
		grid-template-columns: 48px var(--sidebar-width) 1fr;
		grid-template-rows: minmax(0, 1fr);
		height: 100vh;
		transition: grid-template-columns var(--dur) var(--ease);
	}
	.app.sidebar-closed {
		grid-template-columns: 48px 0px 1fr;
	}
	.sidebar {
		min-height: 0;
		overflow: hidden;
		background: var(--part-sidebar-bg, var(--panel));
		border-right: 1px solid var(--border);
	}
	.sidebar-closed .sidebar {
		border-right-color: transparent;
	}
	.sidebar-closed .sidebar :global(.sidebar-inner) {
		opacity: 0;
		transform: translateX(-16px);
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--part-page-bg, var(--bg));
	}
	.tabbar {
		display: flex;
		align-items: center;
		min-height: 41px;
		padding: 8px 10px 0;
		background: var(--part-tabs-bg, transparent);
		border-bottom: 1px solid var(--border);
	}
	.tabs {
		display: flex;
		gap: 2px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab {
		display: flex;
		align-items: center;
		max-width: 220px;
		border-radius: var(--radius) var(--radius) 0 0;
		color: var(--muted);
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.tab:hover {
		color: var(--text);
		background: var(--hover);
	}
	.tab.is-active {
		color: var(--heading);
		background: var(--part-tab-active, var(--raised));
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.tab-label {
		overflow: hidden;
		padding: calc(8px * var(--density)) 4px calc(8px * var(--density)) 14px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 13.5px;
		white-space: nowrap;
		text-overflow: ellipsis;
		cursor: pointer;
	}
	.tab-close {
		display: inline-flex;
		margin-right: 6px;
		padding: 3px;
		border: 0;
		border-radius: calc(var(--radius) * 0.5);
		background: transparent;
		color: inherit;
		opacity: 0;
		cursor: pointer;
		transition: opacity var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.tab:hover .tab-close,
	.tab.is-active .tab-close {
		opacity: 0.7;
	}
	.tab-close:hover {
		opacity: 1;
		background: var(--hover);
	}
	.editor-area {
		flex: 1;
		min-height: 0;
	}
	.status {
		display: flex;
		justify-content: flex-end;
		gap: 16px;
		padding: 5px 14px;
		color: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.saved {
		transition: color var(--dur) var(--ease);
	}
	.saved.is-saving {
		color: var(--accent);
	}
	.start {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 100%;
		color: var(--muted);
		text-align: center;
	}
	.start h1 {
		margin: 0;
		color: var(--heading);
		font-size: 42px;
		letter-spacing: -0.02em;
	}
	.primary {
		margin-top: 8px;
		padding: 10px 18px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: transform var(--dur) var(--ease), filter var(--dur) var(--ease);
	}
	.primary:hover {
		transform: translateY(-1px);
		filter: brightness(1.08);
	}
</style>
