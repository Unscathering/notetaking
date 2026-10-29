<script lang="ts">
	import { flip } from "svelte/animate";
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
	import MicButton from "./lib/ui/MicButton.svelte";
	import { activeEditor } from "./lib/editor/active";

	/** Spoken words go where the cursor is, with a space before them if needed. */
	function dictate(text: string) {
		const view = activeEditor.view;
		if (!view) return;
		const at = view.state.selection.main.head;
		const before = view.state.sliceDoc(Math.max(0, at - 1), at);
		const insert = (before && !/\s/.test(before) ? " " : "") + text;
		view.dispatch({ changes: { from: at, to: view.state.selection.main.to, insert }, selection: { anchor: at + insert.length } });
		view.focus();
	}
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
	import { inDesktopApp, noteTitle, pickCave } from "./lib/cave";
	import { isNewTab, isView, startWorkspace, viewInfo, ws } from "./lib/workspace.svelte";
	import NewTab from "./lib/ui/NewTab.svelte";
	import { showMenu } from "./lib/ui/ContextMenu.svelte";
	import WindowControls from "./lib/ui/WindowControls.svelte";
	import ViewHeader from "./lib/ui/ViewHeader.svelte";
	import { trackWriting, writing } from "./lib/writing.svelte";
	import { mediaUrl } from "./lib/theme/media.svelte";

	trackTheme();
	trackWriting();
	startWorkspace();
	startUpdateChecks();
	void import("./lib/links").then((l) => l.startLinks());
	const ms = $derived(motionMs(theme));
	const isBoard = (path: string) => isBoardText(ws.texts.get(path) ?? "");
	const showingBoard = $derived(!!ws.active && isBoard(ws.active) && !ws.rawBoards.has(ws.active));
	/** Where the split sits, as a share of the width (remembered). */
	let splitAt = $state(Number(localStorage.getItem("basalt.split-at")) || 50);
	// Dragging the edges between the sidebar, the note and the AI panel. Double-click puts one back.
	const AI_WIDTH = 380;
	let aiWidth = $state(Number(localStorage.getItem("basalt.ai-width")) || AI_WIDTH);
	let resizing = $state(false);
	function dragEdge(e: PointerEvent, which: "sidebar" | "ai") {
		e.preventDefault();
		const x0 = e.clientX;
		const w0 = which === "sidebar" ? theme.shape.sidebarWidth : aiWidth;
		resizing = true;
		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - x0;
			if (which === "sidebar") theme.shape.sidebarWidth = Math.round(Math.min(600, Math.max(160, w0 + dx)));
			else aiWidth = Math.round(Math.min(Math.max(300, window.innerWidth * 0.6), Math.max(300, w0 - dx)));
		};
		const up = () => {
			resizing = false;
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			if (which === "ai") localStorage.setItem("basalt.ai-width", String(aiWidth));
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}
	function resetEdge(which: "sidebar" | "ai") {
		if (which === "sidebar") theme.shape.sidebarWidth = 260;
		else {
			aiWidth = AI_WIDTH;
			localStorage.removeItem("basalt.ai-width");
		}
	}

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

	// The desktop app draws its own window buttons (no title bar); try it in a browser with basalt.dev-frame.
	const frameless = inDesktopApp || (() => { try { return !!localStorage.getItem("basalt.dev-frame"); } catch { return false; } })();

	/** Right-click on a tab. */
	function tabMenu(e: MouseEvent, path: string) {
		const i = ws.tabs.indexOf(path);
		showMenu(e, [
			{ label: "Close", icon: "x", run: () => ws.closeTab(path) },
			{ label: "Close others", icon: "x", run: () => ws.tabs.filter((t) => t !== path).forEach((t) => ws.closeTab(t)) },
			{ label: "Close tabs to the right", icon: "x", run: () => ws.tabs.slice(i + 1).forEach((t) => ws.closeTab(t)) },
			...(isView(path) ? [] : [{ label: "-" }, { label: "Open on the right", icon: "layout" as const, run: () => ws.openSplit(path) }]),
		]);
	}

	/** Dragging tabs into a new order. */
	let draggingTab: string | null = $state(null);
	function dropTab(on: string) {
		const from = draggingTab;
		draggingTab = null;
		if (!from || from === on) return;
		const rest = ws.tabs.filter((t) => t !== from);
		rest.splice(rest.indexOf(on) + (ws.tabs.indexOf(from) < ws.tabs.indexOf(on) ? 1 : 0), 0, from);
		ws.tabs = rest;
	}

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

{#if frameless}<WindowControls />{/if}
<div class="app" class:frameless class:sidebar-closed={!ws.sidebarOpen} class:is-focus={writing.focus} class:ai-open={aiPanel.open} class:is-resizing={resizing} style:--ai-width={`${aiWidth}px`}>
	<Ribbon />
	<aside class="sidebar">
		<Sidebar {ms} />
	</aside>

	<main class="main">
		{#if ws.sidebarOpen && !writing.focus}
			<div class="edge edge-sidebar" role="separator" aria-orientation="vertical" aria-label="Sidebar width" title="Drag to resize · double-click to reset" onpointerdown={(e) => dragEdge(e, "sidebar")} ondblclick={() => resetEdge("sidebar")}></div>
		{/if}
		<div class="tabbar" data-tauri-drag-region>
			<div class="tabs" role="tablist" data-tauri-drag-region>
				{#each ws.tabs as path (path)}
					<div class="tab" class:is-active={ws.active === path} class:is-dragging={draggingTab === path} animate:flip={{ duration: ms }} role="tab" tabindex="-1" aria-selected={ws.active === path} draggable="true" ondragstart={() => (draggingTab = path)} ondragend={() => (draggingTab = null)} ondragover={(e) => draggingTab && e.preventDefault()} ondrop={() => dropTab(path)} oncontextmenu={(e) => tabMenu(e, path)}>
						<button class="tab-label" onclick={() => ws.open(path)} onauxclick={(e) => e.button === 1 && ws.closeTab(path)}>
							{#if viewInfo(path)}<span class="tab-ico">{@html icon(viewInfo(path)!.icon, 13)}</span>{viewInfo(path)!.label}{:else}{#if isBoard(path)}<span class="tab-ico">{@html icon("board", 13)}</span>{/if}{noteTitle(path)}{/if}
						</button>
						<button class="tab-close" onclick={() => ws.closeTab(path)} title="Close (Ctrl+W)">{@html icon("x", 14)}</button>
					</div>
				{/each}
				<button class="tab-new" onclick={() => ws.newTab()} title="New tab (Ctrl+T)">{@html icon("plus", 15)}</button>
			</div>
		</div>

		<div class="panes" style:--split={`${splitAt}%`} class:is-split={!!ws.split}>
		<div class="editor-area" bind:this={editorHost}>
			{#if ws.cave && ws.active && !isNewTab(ws.active) && !writing.focus}<ViewHeader path={ws.active} />{/if}
			{#if !ws.cave}
				<div class="start">
					<h1>Basalt</h1>
					<p>Your notes live in caves: plain Markdown files in a folder you choose.</p>
					<button class="primary" onclick={chooseCave}>Choose a folder for your first cave</button>
				</div>
			{:else if isNewTab(ws.active)}
				<NewTab />
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
				<Editor path={ws.active} text={ws.texts.get(ws.active) ?? ""} onchange={(p, t) => ws.edited(p, t)} onopenlink={(t, newTab) => ws.follow(t, newTab)} />
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
			<MicButton {ms} onText={dictate} />
			{#if ws.note && !isView(ws.note)}
				<button class="mode" class:on={ws.isViewing(ws.note)} onclick={() => ws.note && ws.toggleView(ws.note)} title="Switch between viewing and editing (Ctrl+E)">{@html icon(ws.isViewing(ws.note) ? "eye" : "pencil", 12)} {ws.isViewing(ws.note) ? "Viewing" : "Editing"}</button>
			{/if}
			<span title={`About ${Math.max(1, Math.round(words / 230))} min to read`}>{ws.selectedWords ? `${ws.selectedWords} of ${words}` : words} {words === 1 ? "word" : "words"}</span>
			<span class="saved" class:is-saving={ws.saving}>{ws.saving ? "Saving…" : "Saved"}</span>
		</footer>
	</main>
	<div class="ai-col">
		{#if aiPanel.open && !writing.focus}
			<div class="edge edge-ai" role="separator" aria-orientation="vertical" aria-label="AI panel width" title="Drag to resize · double-click to reset" onpointerdown={(e) => dragEdge(e, "ai")} ondblclick={() => resetEdge("ai")}></div>
		{/if}
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
		grid-template-columns: 48px var(--sidebar-width) minmax(0, 1fr) var(--ai-width);
	}
	.app.ai-open.sidebar-closed {
		grid-template-columns: 48px 0px minmax(0, 1fr) var(--ai-width);
	}
	/* While an edge is dragged, follow the pointer straight away. */
	.app.is-resizing {
		transition: none;
		cursor: col-resize;
		user-select: none;
	}
	.edge {
		position: absolute;
		top: 0;
		bottom: 0;
		z-index: 20;
		width: 8px;
		cursor: col-resize;
		touch-action: none;
	}
	.edge::after {
		content: "";
		position: absolute;
		top: 0;
		bottom: 0;
		left: 3px;
		width: 2px;
		border-radius: 2px;
		background: var(--accent);
		opacity: 0;
		transition: opacity var(--dur) var(--ease);
	}
	.edge:hover::after,
	.is-resizing .edge::after {
		opacity: 0.8;
	}
	.edge-sidebar {
		left: 0;
	}
	.edge-ai {
		left: 0;
	}
	.ai-col {
		position: relative;
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
	/* Room for the window buttons in the top-right corner. */
	.frameless:not(.ai-open) .tabbar {
		padding-right: 148px;
	}
	/* With the AI panel open the buttons sit above its header, in a strip that drags the window. */
	.frameless.ai-open :global(.ai > header) {
		padding-top: 44px;
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
		flex: 1;
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
	.tab.is-dragging {
		opacity: 0.4;
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
	.tab-new {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		margin: auto 4px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.tab-new:hover {
		color: var(--text);
		background: var(--hover);
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
	.mode {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 0 6px;
		border: 0;
		border-radius: var(--radius);
		background: none;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.mode:hover,
	.mode.on {
		color: var(--accent);
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
