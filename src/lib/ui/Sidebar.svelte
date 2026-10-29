<script lang="ts">
	// The sidebar: the cave's files (or search and tags, picked from the command bar).
	import { inDesktopApp } from "../cave";
	import { ws } from "../workspace.svelte";
	import FileTree from "./FileTree.svelte";
	import SearchPanel from "./SearchPanel.svelte";
	import TagsPanel from "./TagsPanel.svelte";
	import OutlinePanel from "./OutlinePanel.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
</script>

<div class="sidebar-inner">
	<header class="head">
		<button class="cave-name" onclick={() => (ws.modal = "caves")} title={inDesktopApp ? "Switch cave" : "The sample cave"}>
			<span class="cave-icon">{@html icon("cave")}</span>
			<span>{ws.cave?.name ?? "No cave"}</span>
		</button>
		<button class="icon" onclick={() => ws.newNote()} title="New note (Ctrl+N)">{@html icon("pencil")}</button>
		<button class="icon" onclick={() => ws.newFolder()} title="New folder">{@html icon("folderPlus")}</button>
		<button class="icon" onclick={() => ws.openFolders.clear()} title="Close all folders">{@html icon("collapse")}</button>
	</header>
	{#if ws.panel === "files"}
		<!-- Dropping on the empty space below the tree moves a note to the top level. -->
		<nav
			class="files"
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => {
				const path = e.dataTransfer?.getData("text/plain");
				if (path) void ws.move(path, "", null);
			}}
		>
			<FileTree entries={ws.tree} {ms} />
		</nav>
	{:else if ws.panel === "search"}
		<SearchPanel {ms} />
	{:else if ws.panel === "outline"}
		<OutlinePanel {ms} />
	{:else}
		<TagsPanel {ms} />
	{/if}
</div>

<style>
	.sidebar-inner {
		display: flex;
		flex-direction: column;
		width: var(--sidebar-width);
		height: 100%;
		transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: calc(10px * var(--density)) 8px 8px 10px;
	}
	.cave-name {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 8px;
		min-width: 0;
		padding: 6px 8px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--heading);
		font: inherit;
		font-weight: 650;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease);
	}
	.cave-name:hover {
		background: var(--hover);
	}
	.cave-icon {
		display: inline-flex;
		color: var(--accent);
	}
	.files {
		flex: 1;
		overflow-y: auto;
		padding: 2px 8px 12px;
	}
	.icon {
		display: inline-flex;
		padding: 6px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.icon:hover {
		background: var(--hover);
		color: var(--text);
	}
</style>
