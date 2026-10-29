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
	import ContextMenu from "./lib/ui/ContextMenu.svelte";
	import BoardView from "./lib/ui/BoardView.svelte";
	import GraphView from "./lib/ui/GraphView.svelte";
	import CalendarView from "./lib/ui/CalendarView.svelte";
	import DatabaseView from "./lib/ui/DatabaseView.svelte";
	import SplitPane from "./lib/ui/SplitPane.svelte";
	import FocusTimer from "./lib/ui/FocusTimer.svelte";
	import ClipDialog from "./lib/ui/ClipDialog.svelte";
	import UpdateNotice from "./lib/ui/UpdateNotice.svelte";
	import Backups from "./lib/ui/Backups.svelte";
	import NoteHistory from "./lib/ui/NoteHistory.svelte";
	import { startHistory } from "./lib/history.svelte";
	import { startBackups } from "./lib/backups.svelte";
	import { loadSnippets } from "./lib/snippets.svelte";
	import AiPanel from "./lib/ui/ai/AiPanel.svelte";
	import { aiPanel } from "./lib/ai/panel.svelte";
	import { startUpdateChecks } from "./lib/updates.svelte";
	import { isBoardText } from "./lib/board";
	import { icon } from "./lib/ui/icons";
	import { COMMANDS, keyName } from "./lib/commands";
	import { theme, trackTheme } from "./lib/theme/store.svelte";
	import { motionMs } from "./lib/theme/theme";
	import { noteTitle, pickCave } from "./lib/cave";
	import { startWorkspace, viewInfo, ws } from "./lib/workspace.svelte";
	import { trackWriting, writing } from "./lib/writing.svelte";
	import { mediaUrl } from "./lib/theme/media.svelte";

	trackTheme();
	trackWriting();
	startWorkspace();
	startUpdateChecks();
	const ms = $derived(motionMs(theme));
	const isBoard = (path: string) => isBoardText(ws.texts.get(path) ?? "");
	const showingBoard = $derived(!!ws.active && isBoard(ws.active) && !ws.rawBoards.has(ws.active));
	/** Where the split sits, as a share of the width (remembered). */
	let splitAt = $state(Number(localStorage.getItem("basalt.split-at")) || 50);
	function startResize(e: PointerEvent) {
		const box = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
		const move = (ev: PointerEvent) => (splitAt = Math.min(80, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			localStorage.setItem("basalt.split-at", String(Math.round(splitAt)));
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}
	const words = $derived(ws.note ? (ws.texts.get(ws.note) ?? "").split(/\s+/).filter(Boolean).length : 0);

	let editorHost: HTMLElement | undefined = $state();
	let video: HTMLVideoElement | undefined = $state();
	const videoUrl = $derived(theme.background.kind === "video" && theme.background.media ? mediaUrl(theme.background.media) : "");

	// A moving background rests while Basalt is minimized or hidden.
	$effect(() => {
		const v = video;
		if (!v) return;
		const sync = () => (document.hidden ? v.pause() : void v.play().catch(() => {}));
		document.addEventListener("visibilitychange", sync);
		return () => document.removeEventListener("visibilitychange", sync);
	});
	let shown: string | null = null;

	// Backups of each cave, from the moment it opens, and each note's history.
	$effect(() => {
		if (ws.cave?.id) {
			startBackups();
			void loadSnippets();
		}
	});
	// Snippets edited in another program show up when you come back to Basalt.
	const refocus = () => void loadSnippets();
	startHistory();

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
		} else if (key === "Escape" && writing.focus) {
			writing.focus = false;
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

<svelte:window {onkeydown} onfocus={refocus} />

<!-- The background picture, and the filter that bends light for liquid glass. -->
<div class="backdrop" aria-hidden="true">
	{#if videoUrl}
		<video bind:this={video} src={videoUrl} autoplay muted loop playsinline disablepictureinpicture></video>
	{/if}
</div>
<svg class="filters" width="0" height="0" aria-hidden="true">
	<filter id="basalt-liquid" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
		<feTurbulence type="fractalNoise" baseFrequency="0.007 0.011" numOctaves="2" seed="11" result="noise" />
		<feGaussianBlur in="noise" stdDeviation="2.5" result="soft" />
		<feDisplacementMap in="SourceGraphic" in2="soft" scale="60" xChannelSelector="R" yChannelSelector="G" />
	</filter>
	<filter id="basalt-liquid-mini" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
		<feTurbulence type="fractalNoise" baseFrequency="0.03 0.045" numOctaves="2" seed="11" result="noise" />
		<feGaussianBlur in="noise" stdDeviation="1" result="soft" />
		<feDisplacementMap in="SourceGraphic" in2="soft" scale="16" xChannelSelector="R" yChannelSelector="G" />
	</filter>
</svg>

<div class="app" class:sidebar-closed={!ws.sidebarOpen} class:is-focus={writing.focus} class:ai-open={aiPanel.open}>
	<Ribbon />
	<aside class="sidebar">
		<Sidebar {ms} />
	</aside>

	<main class="main">
		<div class="tabbar">
			<div class="tabs" role="tablist">
				{#each ws.tabs as path (path)}
					<div class="tab" class:is-active={ws.active === path} animate:flip={{ duration: ms }} in:fly={{ y: 8, duration: ms, easing: cubicOut }} role="tab" aria-selected={ws.active === path}>
						<button class="tab-label" onclick={() => ws.open(path)} onauxclick={(e) => e.button === 1 && ws.closeTab(path)}>
							{#if viewInfo(path)}<span class="tab-ico">{@html icon(viewInfo(path)!.icon, 13)}</span>{viewInfo(path)!.label}{:else}{#if isBoard(path)}<span class="tab-ico">{@html icon("board", 13)}</span>{/if}{noteTitle(path)}{/if}
						</button>
						<button class="tab-close" onclick={() => ws.closeTab(path)} title="Close (Ctrl+W)">{@html icon("x", 14)}</button>
					</div>
				{/each}
			</div>
		</div>

		<div class="panes" style:--split={`${splitAt}%`} class:is-split={!!ws.split}>
		<div class="editor-area" bind:this={editorHost}>
			{#if !ws.cave}
				<div class="start">
					<h1>Basalt</h1>
					<p>Your notes live in caves: plain Markdown files in a folder you choose.</p>
					<button class="primary" onclick={chooseCave}>Choose a folder for your first cave</button>
				</div>
			{:else if ws.active === "basalt:graph"}
				<GraphView {ms} />
			{:else if ws.active === "basalt:calendar"}
				<CalendarView {ms} />
			{:else if ws.active?.startsWith("basalt:db:")}
				{#key ws.active}<DatabaseView folder={ws.active.slice(10)} {ms} />{/key}
			{:else if ws.active && showingBoard}
				<BoardView path={ws.active} {ms} />
			{:else if ws.active}
				{#if isBoard(ws.active)}
					<div class="raw-bar">Editing this board as Markdown. <button onclick={() => ws.active && ws.showBoard(ws.active)}>{@html icon("board", 13)} Back to the board</button></div>
				{/if}
				<Editor path={ws.active} text={ws.texts.get(ws.active) ?? ""} onchange={(p, t) => ws.edited(p, t)} onopenlink={(t) => ws.follow(t)} />
			{:else}
				<div class="start">
					<p>No note open.</p>
					<button class="primary" onclick={() => ws.newNote()}>New note</button>
				</div>
			{/if}
		</div>
		{#if ws.split && ws.cave}
			<div class="divider" role="separator" aria-orientation="vertical" onpointerdown={startResize} title="Drag to resize"></div>
			<SplitPane {ms} />
		{/if}
		</div>

		{#if writing.focus}
			<button class="focus-exit" onclick={() => (writing.focus = false)} title="Leave focus mode (Esc)">{@html icon("focus", 15)}</button>
		{/if}
		<footer class="status">
			<FocusTimer {ms} />
			<span>{words} {words === 1 ? "word" : "words"}</span>
			<span class="saved" class:is-saving={ws.saving}>{ws.saving ? "Saving…" : "Saved"}</span>
		</footer>
	</main>
	<div class="ai-col">
		{#if aiPanel.open}<AiPanel {ms} />{/if}
	</div>
</div>

<ContextMenu {ms} />
<UpdateNotice {ms} />

{#if ws.modal === "settings"}
	<Settings {ms} onclose={() => (ws.modal = null)} />
{:else if ws.modal === "palette" || ws.modal === "switcher" || ws.modal === "templates"}
	{#key ws.modal}
		<Palette mode={ws.modal} {ms} />
	{/key}
{:else if ws.modal === "caves"}
	<CaveSwitcher {ms} />
{:else if ws.modal === "backups"}
	<Backups {ms} />
{:else if ws.modal === "clip"}
	<ClipDialog {ms} />
{:else if ws.modal === "history" && ws.historyOf}
	<NoteHistory {ms} path={ws.historyOf} />
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: calc(var(--wallpaper-blur) * -2);
		z-index: 0;
		background: var(--wallpaper);
		filter: blur(var(--wallpaper-blur));
		transition: filter var(--dur) var(--ease);
	}
	.backdrop video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.backdrop::after {
		content: "";
		position: absolute;
		inset: 0;
		background: var(--wallpaper-fade);
	}
	.filters {
		position: absolute;
		pointer-events: none;
	}
	.app {
		position: relative;
		z-index: 1;
		display: grid;
		grid-template-columns: 48px var(--sidebar-width) minmax(0, 1fr) 0px;
		grid-template-rows: minmax(0, 1fr);
		height: 100vh;
		padding: var(--float-gap);
		transition: grid-template-columns var(--dur) var(--ease), padding var(--dur) var(--ease);
	}
	/* Floating panels: each part is its own rounded island. */
	.app > :global(.ribbon),
	.sidebar,
	.main {
		border-radius: var(--float-radius);
	}
	.app > :global(.ribbon) {
		margin-right: var(--float-gap);
	}
	.sidebar {
		margin-right: var(--float-gap);
		transition: margin var(--dur) var(--ease);
	}
	.sidebar-closed .sidebar,
	.is-focus .sidebar {
		margin-right: 0;
	}
	.is-focus > :global(.ribbon) {
		margin-right: 0;
	}
	.app.sidebar-closed {
		grid-template-columns: 48px 0px minmax(0, 1fr) 0px;
	}
	.app.ai-open {
		grid-template-columns: 48px var(--sidebar-width) minmax(0, 1fr) 380px;
	}
	.app.ai-open.sidebar-closed {
		grid-template-columns: 48px 0px minmax(0, 1fr) 380px;
	}
	.ai-col {
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		transition: margin var(--dur) var(--ease);
	}
	.ai-open .ai-col {
		margin-left: var(--float-gap);
	}
	.is-focus .ai-col {
		margin-left: 0;
	}
	/* Focus mode: everything but the text slides away. */
	.app.is-focus,
	.app.is-focus.ai-open {
		grid-template-columns: 0px 0px minmax(0, 1fr) 0px;
	}
	.app > :global(.ribbon),
	.tabbar,
	.status {
		transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease), margin var(--dur) var(--ease);
	}
	.is-focus > :global(.ribbon) {
		opacity: 0;
		pointer-events: none;
		overflow: hidden;
	}
	.is-focus .sidebar {
		border-right-color: transparent;
	}
	.is-focus .sidebar :global(.sidebar-inner) {
		opacity: 0;
		transform: translateX(-16px);
	}
	.is-focus .tabbar {
		margin-top: -41px;
		opacity: 0;
		pointer-events: none;
	}
	.is-focus .status {
		opacity: 0;
		transform: translateY(100%);
	}
	.main {
		position: relative;
	}
	.focus-exit {
		position: absolute;
		top: 12px;
		right: 14px;
		z-index: 6;
		display: inline-flex;
		padding: 7px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		opacity: 0.35;
		cursor: pointer;
		transition: opacity var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.focus-exit:hover {
		opacity: 1;
		background: var(--hover);
	}
	.sidebar {
		min-height: 0;
		overflow: hidden;
		background-color: var(--part-sidebar-bg, var(--surface-panel));
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		box-shadow: var(--glass-edge);
		border-right: 1px solid var(--chrome-line);
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
		overflow: hidden;
		background: var(--part-page-bg, var(--surface-page));
	}
	.tabbar {
		display: flex;
		align-items: center;
		min-height: 41px;
		padding: 8px 10px 0;
		background: var(--part-tabs-bg, transparent);
		border-bottom: 1px solid var(--chrome-line);
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
		background: var(--part-tab-active, var(--surface-card));
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
	.tab-ico {
		display: inline-flex;
		margin-right: 6px;
		vertical-align: -2px;
		color: var(--accent);
	}
	.raw-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 7px;
		background: var(--accent-soft);
		color: var(--text);
		font-size: 13px;
	}
	.raw-bar button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		cursor: pointer;
	}
	.editor-area {
		display: flex;
		flex-direction: column;
	}
	.editor-area > :global(.editor) {
		flex: 1;
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
	.panes {
		display: flex;
		flex: 1;
		min-height: 0;
	}
	.panes > .editor-area {
		min-width: 0;
	}
	.panes.is-split > .editor-area {
		flex: 0 0 var(--split);
	}
	.panes.is-split > :global(.pane) {
		flex: 1;
	}
	.divider {
		flex: none;
		width: 5px;
		margin: 0 -2px;
		z-index: 2;
		background: linear-gradient(var(--chrome-line), var(--chrome-line)) center / 1px 100% no-repeat;
		cursor: col-resize;
		transition: background-size var(--dur) var(--ease);
	}
	.divider:hover {
		background-image: linear-gradient(var(--accent), var(--accent));
		background-size: 3px 100%;
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
