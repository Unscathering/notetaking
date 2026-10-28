<script lang="ts">
	// Every tag in the cave. Pick one to see the notes it connects.
	import { slide } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { noteTitle } from "../cave";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
	let picked: string | null = $state(null);
</script>

<div class="tags">
	{#if ws.tags.size === 0}
		<p class="empty">No tags yet. Add some at the top of a note, or type #something in its text.</p>
	{/if}
	<div class="cloud">
		{#each [...ws.tags] as [tag, notes] (tag)}
			<button class="chip" class:is-on={picked === tag} onclick={() => (picked = picked === tag ? null : tag)}>
				#{tag}<span>{notes.length}</span>
			</button>
		{/each}
	</div>
	{#if picked && ws.tags.get(picked)}
		<ul transition:slide={{ duration: ms, easing: cubicOut }}>
			{#each ws.tags.get(picked) ?? [] as path (path)}
				<li>
					<button onclick={() => ws.open(path)}>
						<span class="ico">{@html icon("file", 14)}</span>
						<span class="text">
							<span class="name">{noteTitle(path)}</span>
							{#if ws.props.get(path)?.description}<small>{ws.props.get(path)?.description}</small>{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.tags {
		flex: 1;
		overflow-y: auto;
		padding: 2px 10px 12px;
	}
	.empty {
		margin: 6px 6px;
		color: var(--muted);
		line-height: 1.5;
	}
	.cloud {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 2px 2px 10px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--raised);
		color: var(--text);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
	}
	.chip:hover {
		transform: translateY(-1px);
	}
	.chip span {
		color: var(--muted);
		font-size: 11.5px;
	}
	.chip.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--accent);
	}
	ul {
		margin: 0;
		padding: 8px 0 0;
		border-top: 1px solid var(--border);
		list-style: none;
	}
	li button {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		width: 100%;
		padding: 7px 8px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	li button:hover {
		background: var(--hover);
	}
	.ico {
		display: inline-flex;
		margin-top: 2px;
		color: var(--muted);
	}
	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	small {
		color: var(--muted);
		font-size: 12px;
	}
</style>
