<script lang="ts" module>
	/** What is being dragged in the sidebar, shared by every level of the tree. */
	let dragging: string | null = $state(null);
	let target: { path: string; where: "before" | "after" | "into" } | null = $state(null);
</script>

<script lang="ts">
	import { slide } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { baseName, parentOf, type CaveEntry } from "../cave";
	import { ws } from "../workspace.svelte";
	import { showMenu, type MenuItem } from "./ContextMenu.svelte";
	import { icon, type IconName } from "./icons";
	import FileTree from "./FileTree.svelte";

	interface Props {
		entries: CaveEntry[];
		ms: number;
		depth?: number;
	}
	let { entries, ms, depth = 0 }: Props = $props();

	const label = (e: CaveEntry) => (e.kind === "file" ? e.name.replace(/\.md$/i, "") : e.name);
	const look = (e: CaveEntry) => ws.meta.looks[e.path] ?? {};

	function toggle(path: string) {
		if (ws.openFolders.has(path)) ws.openFolders.delete(path);
		else ws.openFolders.add(path);
	}

	function ondragstart(e: DragEvent, entry: CaveEntry) {
		dragging = entry.path;
		e.dataTransfer?.setData("text/plain", entry.path);
		if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
	}

	function ondragover(e: DragEvent, entry: CaveEntry) {
		if (!dragging || dragging === entry.path || entry.path.startsWith(`${dragging}/`)) return;
		e.preventDefault();
		e.stopPropagation();
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const y = (e.clientY - r.top) / r.height;
		// Folders take a drop in their middle; the edges place the item next to them.
		const where = entry.kind === "folder" ? (y < 0.28 ? "before" : y > 0.72 && !ws.openFolders.has(entry.path) ? "after" : "into") : y < 0.5 ? "before" : "after";
		target = { path: entry.path, where };
	}

	async function ondrop(e: DragEvent, entry: CaveEntry, i: number) {
		e.preventDefault();
		e.stopPropagation();
		const from = dragging, t = target;
		dragging = target = null;
		if (!from || !t) return;
		if (t.where === "into") {
			await ws.move(from, entry.path, null);
			ws.openFolders.add(entry.path);
		} else {
			const before = t.where === "before" ? entry.name : (entries[i + 1]?.name ?? null);
			await ws.move(from, parentOf(entry.path), before === baseName(from) ? (entries[i + 2]?.name ?? null) : before);
		}
	}

	function ondragend() {
		dragging = target = null;
	}

	function menuFor(e: MouseEvent, entry: CaveEntry) {
		const l = look(entry);
		const looks: MenuItem[] = [
			{ label: "Color", colors: { value: l.color ?? "", current: l.color, pick: (c) => ws.setLook(entry.path, { color: c }) } },
			{ label: "Icon", icons: { current: l.icon, pick: (name) => ws.setLook(entry.path, { icon: name }) } },
		];
		const remove: MenuItem = {
			label: "Delete",
			icon: "trash",
			danger: true,
			run: () => confirm(`Delete "${label(entry)}"${entry.kind === "folder" ? " and everything in it" : ""}?`) && ws.remove(entry.path),
		};
		const items: MenuItem[] =
			entry.kind === "folder"
				? [
						{ label: "New note here", icon: "pencil", run: () => ws.newNote(entry.path) },
						{ label: "New folder here", icon: "folderPlus", run: async () => { const p = await ws.newFolder(entry.path); if (p) ws.renaming = p; } },
						{ label: "Rename", icon: "pencil", run: () => (ws.renaming = entry.path) },
						{ label: "-" },
						...looks,
						{ label: "-" },
						remove,
					]
				: [
						{ label: "Open", icon: "file", run: () => ws.open(entry.path) },
						{ label: "Rename", icon: "pencil", run: () => (ws.renaming = entry.path) },
						{ label: "Make this the home page", icon: "home", run: () => ws.setHome(entry.path) },
						{ label: "-" },
						...looks,
						{ label: "-" },
						remove,
					];
		showMenu(e, items);
	}

	function renameKeys(e: KeyboardEvent, entry: CaveEntry) {
		e.stopPropagation();
		const input = e.currentTarget as HTMLInputElement;
		if (e.key === "Enter") {
			ws.renaming = null;
			void ws.rename(entry.path, input.value);
		} else if (e.key === "Escape") ws.renaming = null;
	}

	const focusSelect = (node: HTMLInputElement) => {
		node.focus();
		node.select();
	};
</script>

<ul class="tree" style:--depth={depth}>
	{#each entries as entry, i (entry.path)}
		{@const l = look(entry)}
		{@const drop = target?.path === entry.path ? target.where : null}
		<li class:is-dragging={dragging === entry.path}>
			{#if ws.renaming === entry.path}
				<div class="row renaming" class:file={entry.kind === "file"}>
					<input value={label(entry)} use:focusSelect onkeydown={(e) => renameKeys(e, entry)} onblur={(e) => { ws.renaming = null; void ws.rename(entry.path, e.currentTarget.value); }} />
				</div>
			{:else if entry.kind === "folder"}
				<button
					class="row folder"
					class:is-open={ws.openFolders.has(entry.path)}
					class:drop-before={drop === "before"}
					class:drop-after={drop === "after"}
					class:drop-into={drop === "into"}
					style:--tint={l.color}
					draggable="true"
					onclick={() => toggle(entry.path)}
					oncontextmenu={(e) => menuFor(e, entry)}
					ondragstart={(e) => ondragstart(e, entry)}
					ondragover={(e) => ondragover(e, entry)}
					ondragleave={() => target?.path === entry.path && (target = null)}
					ondrop={(e) => ondrop(e, entry, i)}
					{ondragend}
				>
					<span class="chevron">{@html icon("chevron", 14)}</span>
					{#if l.icon}<span class="ico">{@html icon(l.icon as IconName, 15)}</span>{/if}
					<span class="name">{label(entry)}</span>
				</button>
				{#if ws.openFolders.has(entry.path) && entry.children}
					<div transition:slide={{ duration: ms, easing: cubicOut }} class="kids" style:--tint={l.color}>
						<FileTree entries={entry.children} {ms} depth={depth + 1} />
					</div>
				{/if}
			{:else}
				<button
					class="row file"
					class:is-active={ws.active === entry.path}
					class:drop-before={drop === "before"}
					class:drop-after={drop === "after"}
					style:--tint={l.color}
					draggable="true"
					onclick={() => ws.open(entry.path)}
					oncontextmenu={(e) => menuFor(e, entry)}
					ondragstart={(e) => ondragstart(e, entry)}
					ondragover={(e) => ondragover(e, entry)}
					ondragleave={() => target?.path === entry.path && (target = null)}
					ondrop={(e) => ondrop(e, entry, i)}
					{ondragend}
				>
					{#if l.icon}<span class="ico">{@html icon(l.icon as IconName, 15)}</span>{/if}
					<span class="name">{label(entry)}</span>
					{#if ws.meta.home === entry.path}<span class="home" title="Home page">{@html icon("home", 13)}</span>{/if}
				</button>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.tree {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		transition: opacity var(--dur) var(--ease);
	}
	li.is-dragging {
		opacity: 0.4;
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: calc(5px * var(--density)) 10px calc(5px * var(--density)) calc(10px + var(--depth) * 14px);
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--part-sidebar-text, var(--muted));
		font: inherit;
		font-size: var(--part-sidebar-size, 14px);
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
	}
	.row:hover {
		background: var(--hover);
		color: var(--text);
	}
	.file.is-active {
		background: var(--accent-soft);
		color: var(--text);
	}
	.folder {
		color: var(--tint, var(--text));
		font-weight: 600;
	}
	/* Where a dragged item will land. */
	.drop-before::after,
	.drop-after::after {
		content: "";
		position: absolute;
		left: calc(10px + var(--depth) * 14px);
		right: 6px;
		height: 2px;
		border-radius: 2px;
		background: var(--accent);
		box-shadow: 0 0 0 2px var(--part-sidebar-bg, var(--panel));
	}
	.drop-before::after {
		top: -1px;
	}
	.drop-after::after {
		bottom: -1px;
	}
	.drop-into {
		background: var(--accent-soft);
		box-shadow: inset 0 0 0 1.5px var(--accent);
	}
	.chevron {
		display: inline-flex;
		color: var(--muted);
		transition: transform var(--dur) var(--ease);
	}
	.folder.is-open .chevron {
		transform: rotate(90deg);
	}
	.file {
		padding-left: calc(30px + var(--depth) * 14px);
	}
	.ico {
		display: inline-flex;
		color: var(--tint, var(--muted));
	}
	.file .ico {
		margin-left: -20px;
	}
	.name {
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.home {
		display: inline-flex;
		color: var(--accent);
	}
	.renaming input {
		width: 100%;
		padding: 2px 6px;
		border: 1px solid var(--accent);
		border-radius: calc(var(--radius) * 0.6);
		outline: 0;
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.kids {
		position: relative;
	}
	/* A soft line in the folder's color down its open contents. */
	.kids::before {
		content: "";
		position: absolute;
		top: 2px;
		bottom: 4px;
		left: calc(17px + var(--depth) * 14px);
		width: 1.5px;
		border-radius: 2px;
		background: color-mix(in srgb, var(--tint, var(--muted)) 45%, transparent);
	}
</style>
