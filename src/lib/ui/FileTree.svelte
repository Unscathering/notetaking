<script lang="ts">
	import { slide } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import type { VaultEntry } from "../vault";
	import { ICONS } from "./icons";
	import FileTree from "./FileTree.svelte";

	interface Props {
		entries: VaultEntry[];
		active: string | null;
		open: Set<string>;
		ms: number;
		depth?: number;
		onpick: (path: string) => void;
		ontoggle: (path: string) => void;
	}
	let { entries, active, open, ms, depth = 0, onpick, ontoggle }: Props = $props();

	const label = (e: VaultEntry) => (e.kind === "file" ? e.name.replace(/\.md$/i, "") : e.name);
</script>

<ul class="tree" style:--depth={depth}>
	{#each entries as entry (entry.path)}
		<li>
			{#if entry.kind === "folder"}
				<button class="row folder" class:is-open={open.has(entry.path)} onclick={() => ontoggle(entry.path)}>
					<span class="chevron">{@html ICONS.chevron}</span>
					<span class="name">{label(entry)}</span>
				</button>
				{#if open.has(entry.path) && entry.children}
					<div transition:slide={{ duration: ms, easing: cubicOut }}>
						<FileTree entries={entry.children} {active} {open} {ms} depth={depth + 1} {onpick} {ontoggle} />
					</div>
				{/if}
			{:else}
				<button class="row file" class:is-active={active === entry.path} onclick={() => onpick(entry.path)}>
					<span class="name">{label(entry)}</span>
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
		padding: calc(5px * var(--density)) 10px calc(5px * var(--density)) calc(12px + var(--depth) * 14px);
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--muted);
		font: inherit;
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
		color: var(--text);
		font-weight: 550;
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
		padding-left: calc(34px + var(--depth) * 14px);
	}
	.name {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
</style>
