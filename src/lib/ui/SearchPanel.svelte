<script lang="ts">
	// Search every note at once. Results show where each word was found; click to jump there.
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { noteTitle, parentOf } from "../cave";
	import { searchNotes } from "../notes";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
	let query = $state("");
	let input: HTMLInputElement | undefined = $state();

	const hits = $derived(query.trim().length > 1 ? searchNotes(ws.texts, query, noteTitle) : []);

	$effect(() => {
		input?.focus();
	});
</script>

<div class="search">
	<label class="field">
		<span>{@html icon("search")}</span>
		<input bind:this={input} bind:value={query} placeholder="Search all notes" onkeydown={(e) => e.stopPropagation()} />
		{#if query}<button class="clear" onclick={() => (query = "")} title="Clear">{@html icon("x", 14)}</button>{/if}
	</label>
	{#if query.trim().length > 1}
		<p class="count">{hits.length} {hits.length === 1 ? "note" : "notes"}</p>
	{/if}
	<ul>
		{#each hits as hit, i (hit.path)}
			<li in:fly={{ y: 6, duration: ms, delay: Math.min(i, 8) * 18, easing: cubicOut }}>
				<button class="title" onclick={() => ws.open(hit.path)}>
					<span>{noteTitle(hit.path)}</span>
					<small>{parentOf(hit.path)}</small>
				</button>
				{#each hit.snippets as s (s.line)}
					<button class="snippet" onclick={() => ws.openAt(hit.path, s.line)}>{s.before}<mark>{s.match}</mark>{s.after}</button>
				{/each}
			</li>
		{/each}
	</ul>
</div>

<style>
	.search {
		display: flex;
		flex-direction: column;
		min-height: 0;
		flex: 1;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 2px 10px 8px;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--muted);
		transition: border-color var(--dur) var(--ease);
	}
	.field:focus-within {
		border-color: var(--accent);
	}
	.field span,
	.clear {
		display: inline-flex;
	}
	input,
	input:focus-visible {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
	}
	.clear {
		padding: 2px;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.count {
		margin: 0 16px 6px;
		color: var(--muted);
		font-size: 12px;
	}
	ul {
		flex: 1;
		margin: 0;
		padding: 0 8px 12px;
		overflow-y: auto;
		list-style: none;
	}
	li {
		margin-bottom: 8px;
	}
	.title,
	.snippet {
		display: block;
		width: 100%;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease);
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 5px 8px;
		color: var(--heading);
		font-weight: 600;
	}
	.title small {
		color: var(--muted);
		font-weight: 400;
		font-size: 11.5px;
	}
	.snippet {
		padding: 4px 8px 4px 14px;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.title:hover,
	.snippet:hover {
		background: var(--hover);
	}
	mark {
		border-radius: 3px;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
</style>
