<script lang="ts">
	// The bar above a note, like Obsidian's: back and forward, where the note
	// lives (click a folder to show it in the sidebar), viewing or editing, and
	// a menu of everything you can do with the note.
	import { exportNote } from "../commands";
	import { copyNoteLink } from "../links";
	import { noteTitle, parentOf } from "../cave";
	import { isView, viewInfo, ws } from "../workspace.svelte";
	import { showMenu, type MenuItem } from "./ContextMenu.svelte";
	import { icon } from "./icons";

	let { path }: { path: string } = $props();

	const note = $derived(!isView(path));
	const folders = $derived(note ? parentOf(path).split("/").filter(Boolean) : []);
	const name = $derived(viewInfo(path)?.label ?? noteTitle(path));

	function showFolder(i: number) {
		const folder = folders.slice(0, i + 1).join("/");
		ws.panel = "files";
		ws.sidebarOpen = true;
		for (let f = folder; f; f = parentOf(f)) ws.openFolders.add(f);
	}

	/** Renames in place: the inline title if it's showing, otherwise the sidebar. */
	function rename() {
		const title = document.querySelector<HTMLElement>(".editor-area .basalt-inline-title[contenteditable]");
		if (!title) return void (ws.renaming = path);
		title.focus();
		const range = document.createRange();
		range.selectNodeContents(title);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	function menu(e: MouseEvent) {
		const items: MenuItem[] = [
			{ label: "Rename", icon: "pencil", run: rename },
			{ label: ws.isViewing(path) ? "Edit (Ctrl+E)" : "View (Ctrl+E)", icon: ws.isViewing(path) ? "pencil" : "read", run: () => ws.toggleView(path) },
			{ label: "Open on the right", icon: "layout", run: () => ws.openSplit(path) },
			{ label: "Show in the sidebar", icon: "files", run: () => showFolder(folders.length - 1) },
			{ label: "-" },
			{ label: "History", icon: "clock", run: () => ws.showHistory(path) },
			{ label: "Copy link to this note", icon: "pin", run: () => copyNoteLink(path) },
			{ label: "Make this the home page", icon: "home", run: () => ws.setHome(path) },
			{ label: "Print or save as PDF", icon: "file", run: () => exportNote("pdf", path) },
			{ label: "Save as a web page", icon: "globe", run: () => exportNote("page", path) },
			{ label: "-" },
			{ label: "Delete", icon: "trash", danger: true, run: () => confirm(`Delete "${noteTitle(path)}"?`) && ws.remove(path) },
		];
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		showMenu(new MouseEvent("contextmenu", { clientX: r.right - 220, clientY: r.bottom + 4 }), items);
	}
</script>

<div class="view-header">
	<div class="nav">
		<button onclick={() => ws.go(-1)} disabled={ws.navAt <= 0} title="Back (Ctrl+Alt+←)">{@html icon("back", 16)}</button>
		<button onclick={() => ws.go(1)} disabled={ws.navAt >= ws.nav.length - 1} title="Forward (Ctrl+Alt+→)">{@html icon("forward", 16)}</button>
	</div>
	<div class="crumbs">
		{#each folders as folder, i (i)}
			<button class="crumb" onclick={() => showFolder(i)}>{folder}</button><span class="sep">/</span>
		{/each}
		<span class="here">{name}</span>
	</div>
	<div class="actions">
		{#if note}
			<button onclick={() => ws.toggleView(path)} title={ws.isViewing(path) ? "Viewing. Click to edit (Ctrl+E)" : "Editing. Click to view (Ctrl+E)"}>{@html icon(ws.isViewing(path) ? "read" : "pencil", 16)}</button>
			<button onclick={menu} title="More options">{@html icon("more", 16)}</button>
		{/if}
	</div>
</div>

<style>
	.view-header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		height: 38px;
		padding: 0 8px;
		flex: none;
		font-size: 13px;
		color: var(--muted);
	}
	.nav,
	.actions {
		display: flex;
		gap: 2px;
	}
	.actions {
		justify-content: flex-end;
	}
	button {
		display: grid;
		place-items: center;
		min-width: 28px;
		height: 28px;
		padding: 0 4px;
		border: 0;
		border-radius: calc(var(--radius) * 0.7);
		background: transparent;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	button:hover:not(:disabled) {
		background: var(--hover);
		color: var(--text);
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.crumbs {
		display: flex;
		align-items: center;
		min-width: 0;
		white-space: nowrap;
	}
	.crumb {
		display: inline;
		height: auto;
		padding: 2px 4px;
	}
	.sep {
		opacity: 0.5;
		padding: 0 2px;
	}
	.here {
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--text);
		padding: 0 4px;
	}
</style>
