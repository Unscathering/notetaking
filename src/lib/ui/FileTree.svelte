<script lang="ts">
	import { slide } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import type { CaveEntry } from "../cave";
	import { ws } from "../workspace.svelte";
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
</script>

<ul class="tree" style:--depth={depth}>
	{#each entries as entry (entry.path)}
		{@const l = look(entry)}
		<li>
			{#if entry.kind === "folder"}
				<button class="row folder" class:is-open={ws.openFolders.has(entry.path)} style:--tint={l.color} onclick={() => toggle(entry.path)}>
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
				<button class="row file" class:is-active={ws.active === entry.path} style:--tint={l.color} onclick={() => ws.open(entry.path)}>
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
	.row {
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
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
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
	/* A soft line in the folder's color down its open contents. */
	.kids {
		position: relative;
	}
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
