<script lang="ts">
	// A small card in the corner when a newer Basalt is ready to download.
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { downloadUpdate, installUpdate, laterUpdate, updates } from "../updates.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
</script>

{#if updates.version}
	<div class="notice" transition:fly={{ y: 16, duration: ms, easing: cubicOut }} role="status">
		<span class="ico">{@html icon("download", 16)}</span>
		{#if updates.installing}
			{@const pct = updates.installing.total ? Math.round((updates.installing.done / updates.installing.total) * 100) : 0}
			<span class="words"><b>Updating to {updates.version}… {pct}%</b>Basalt will close, update and open again by itself.</span>
		{:else if updates.error}
			<span class="words"><b>The update couldn't finish</b>{updates.error}</span>
			<button class="go" onclick={downloadUpdate}>Download in browser</button>
			<button class="later" onclick={laterUpdate}>Later</button>
		{:else}
			<span class="words"><b>Basalt {updates.version} is ready</b>You have {updates.current}. Your notes, settings and AI models stay as they are.</span>
			<button class="go" onclick={installUpdate}>Update now</button>
			<button class="later" onclick={laterUpdate} title="Remind me about the next one">Later</button>
		{/if}
	</div>
{/if}

<style>
	.notice {
		position: fixed;
		right: 18px;
		bottom: 38px;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 12px;
		max-width: 460px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		box-shadow: var(--glass-edge), 0 18px 44px rgba(0, 0, 0, 0.35);
	}
	.ico {
		display: grid;
		place-items: center;
		flex: none;
		width: 34px;
		height: 34px;
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.words {
		font-size: 12px;
		line-height: 1.4;
		color: var(--muted);
	}
	.words b {
		display: block;
		font-size: 13.5px;
		color: var(--text);
	}
	button {
		flex: none;
		padding: 7px 12px;
		border: 0;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.go {
		background: var(--accent);
		color: var(--on-accent);
	}
	.later {
		background: transparent;
		color: var(--muted);
	}
	.later:hover {
		color: var(--text);
	}
</style>
