<script lang="ts">
	// A small sample sidebar drawn with a set of sidebar choices.
	import type { Theme } from "../../theme/theme";
	import { icon, isEmoji, type IconName } from "../icons";

	let { looks }: { looks: Theme["sidebar"] } = $props();

	const ROWS: Array<{ name: string; folder?: boolean; open?: boolean; color?: string; picked?: string; depth: number; count?: number; active?: boolean }> = [
		{ name: "Writing", folder: true, open: true, color: "#e8794a", picked: "pencil", depth: 0, count: 3 },
		{ name: "Short stories", depth: 1, active: true },
		{ name: "Ideas", depth: 1 },
		{ name: "Life", folder: true, color: "#7fc48b", picked: "🌿", depth: 0, count: 5 },
		{ name: "Games", folder: true, color: "#7c8cff", depth: 0, count: 2 },
		{ name: "Reading list", depth: 0 },
	];

	function ico(r: (typeof ROWS)[number]) {
		if (r.folder) return looks.folderIcons === "none" ? "" : r.picked || (looks.folderIcons === "always" ? (r.open ? "folderOpen" : "folder") : "");
		return looks.fileIcons ? "file" : "";
	}
</script>

<div class="tree-demo color-{looks.colorOn}" style:font-size="{looks.size}px">
	{#each ROWS as r (r.name)}
		{@const i = ico(r)}
		<div
			class="r"
			class:folder={r.folder}
			class:active={r.active}
			style:--tint={r.color}
			style:padding-left="{10 + r.depth * looks.indent + (!r.folder && looks.arrows ? 20 : 0)}px"
			style:font-weight={r.folder ? looks.folderWeight : 400}
		>
			{#if r.folder && looks.arrows}<span class="chev" class:open={r.open}>{@html icon("chevron", 13)}</span>{/if}
			{#if i}<span class="i">{#if isEmoji(i)}{i}{:else}{@html icon(i as IconName, 14)}{/if}</span>{/if}
			<span class="n">{r.name}</span>
			{#if r.folder && looks.counts}<span class="c">{r.count}</span>{/if}
		</div>
		{#if r.open && looks.guides}<span class="guide" style:left="{17 + r.depth * looks.indent}px"></span>{/if}
	{/each}
</div>

<style>
	.tree-demo {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 10px 8px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		background: var(--panel);
		text-align: left;
	}
	.r {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-top: 4px;
		padding-bottom: 4px;
		padding-right: 8px;
		border-radius: calc(var(--radius) * 0.7);
		color: var(--muted);
		white-space: nowrap;
	}
	.r.active {
		background: var(--accent-soft);
		color: var(--text);
	}
	.folder {
		color: var(--text);
	}
	.color-name .folder,
	.color-both .folder {
		color: var(--tint);
	}
	.color-row .folder {
		background: color-mix(in srgb, var(--tint) 16%, transparent);
	}
	.i {
		display: inline-flex;
		color: var(--muted);
		font-size: 13px;
	}
	.folder .i {
		color: var(--tint);
	}
	.color-name .folder .i {
		color: var(--muted);
	}
	.chev {
		display: inline-flex;
		color: var(--muted);
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.n {
		flex: 1;
	}
	.c {
		padding: 0 6px;
		border-radius: 999px;
		background: var(--hover);
		color: var(--muted);
		font-size: 10.5px;
		font-weight: 500;
		line-height: 16px;
	}
	.guide {
		position: absolute;
		top: 42px;
		height: 50px;
		width: 1.5px;
		background: color-mix(in srgb, #e8794a 45%, transparent);
	}
</style>
