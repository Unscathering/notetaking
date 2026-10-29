<script lang="ts">
	// The page an empty tab shows (the + on the tab bar), like Obsidian's:
	// make a note, find one, or pick one you had open lately.
	import { noteTitle } from "../cave";
	import { isView, ws } from "../workspace.svelte";
	import { icon } from "./icons";

	const recent = $derived([...new Set([...ws.nav].reverse())].filter((p) => !isView(p) && ws.files.includes(p)).slice(0, 6));
</script>

<div class="newtab">
	<div class="box">
		<button class="link" onclick={() => ws.newNote()}>Create new note <kbd>Ctrl+N</kbd></button>
		<button class="link" onclick={() => (ws.modal = "switcher")}>Go to file <kbd>Ctrl+O</kbd></button>
		{#if recent.length}
			<div class="label">Recent</div>
			{#each recent as path (path)}
				<button class="link recent" onclick={() => ws.open(path)}>{@html icon("file", 13)} {noteTitle(path)}</button>
			{/each}
		{/if}
		<button class="link quiet" onclick={() => ws.active && ws.closeTab(ws.active)}>Close <kbd>Ctrl+W</kbd></button>
	</div>
</div>

<style>
	.newtab {
		height: 100%;
		display: grid;
		place-items: center;
	}
	.box {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.link {
		display: flex;
		align-items: center;
		gap: 8px;
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 1.05rem;
		padding: 6px 12px;
		border-radius: 6px;
		cursor: pointer;
	}
	.link:hover {
		background: var(--hover, rgba(127, 127, 127, 0.12));
	}
	.recent {
		color: var(--text);
		font-size: 0.95rem;
	}
	.quiet {
		color: var(--muted);
		margin-top: 10px;
	}
	.label {
		margin-top: 14px;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	kbd {
		font-size: 0.75rem;
		color: var(--muted);
		font-family: inherit;
	}
</style>
