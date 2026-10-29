<script lang="ts">
	// The right-hand pane: a second note beside the first. Links clicked in it
	// open in it; the arrows swap the two sides.
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import Editor from "../editor/Editor.svelte";
	import BoardView from "./BoardView.svelte";
	import { isBoardText } from "../board";
	import { noteTitle } from "../cave";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
	const path = $derived(ws.split!);
	const board = $derived(isBoardText(ws.texts.get(path) ?? ""));

	async function follow(target: string) {
		const found = ws.resolve(target);
		if (found) await ws.openSplit(found);
		else await ws.follow(target);
	}

	/** The right note goes to the left and the left one to the right. */
	async function swap() {
		const left = ws.note;
		const right = ws.split;
		if (!right) return;
		await ws.open(right);
		if (left) await ws.openSplit(left);
	}
</script>

<section class="pane" in:fly={{ x: 24, duration: ms, easing: cubicOut }}>
	<header>
		<span class="name">{@html icon(board ? "board" : "file", 13)} {noteTitle(path)}</span>
		<button onclick={swap} title="Swap sides" disabled={!ws.note}>{@html icon("back", 13)}{@html icon("chevron", 13)}</button>
		<button onclick={() => ws.open(path)} title="Open it as a tab">{@html icon("file", 13)}</button>
		<button onclick={() => (ws.split = null)} title="Close this side">{@html icon("x", 14)}</button>
	</header>
	<div class="body">
		{#key path}
			{#if board}
				<BoardView {path} {ms} />
			{:else}
				<Editor {path} text={ws.texts.get(path) ?? ""} onchange={(p, t) => ws.edited(p, t)} onopenlink={follow} />
			{/if}
		{/key}
	</div>
</section>

<style>
	.pane {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		height: 100%;
	}
	header {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 6px 8px 6px 14px;
		border-bottom: 1px solid var(--chrome-line);
		font-size: 12.5px;
	}
	.name {
		display: inline-flex;
		flex: 1;
		align-items: center;
		gap: 6px;
		min-width: 0;
		overflow: hidden;
		color: var(--muted);
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	header button {
		display: inline-flex;
		padding: 5px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	header button:hover:not(:disabled) {
		background: var(--hover);
		color: var(--text);
	}
	header button:disabled {
		opacity: 0.4;
	}
	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-height: 0;
	}
	.body > :global(.editor) {
		flex: 1;
	}
</style>
