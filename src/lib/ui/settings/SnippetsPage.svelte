<script lang="ts">
	// CSS snippets: turn each on or off, edit one with the change showing as you
	// type, or start from an example.
	import { onMount } from "svelte";
	import { EXAMPLES, SNIPPET_DIR, deleteSnippet, loadSnippets, newSnippet, saveSnippet, snippets, toggleSnippet } from "../../snippets.svelte";
	import { ws } from "../../workspace.svelte";
	import { icon } from "../icons";
	import Switch from "./Switch.svelte";

	const GUIDE = "https://github.com/Unscathering/notetaking/blob/main/MODDING.md";
	let editing = $state<string | null>(null);
	let draft = $state("");
	let timer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => void loadSnippets());

	const isOn = (name: string) => (ws.meta.snippets ?? []).includes(name);
	const label = (name: string) => name.replace(/\.css$/, "").replace(/[-_]/g, " ");

	function edit(name: string) {
		editing = name;
		draft = snippets.texts[name] ?? "";
	}

	function typed() {
		clearTimeout(timer);
		const name = editing;
		if (!name) return;
		timer = setTimeout(() => void saveSnippet(name, draft), 250);
	}

	async function add(base?: string, css?: string) {
		edit(await newSnippet(base, css));
	}
</script>

<section class="st-section">
	<h3 class="st-h">Your snippets</h3>
	<p class="st-sub">CSS files in this cave's <code>{SNIPPET_DIR}</code> folder. Each changes how Basalt looks; turn them on and off here. They travel with the cave, so you can share a snippet by sharing its file. Notes with <code>cssclass: dashboard</code> in their properties can be styled on their own with <code>.note-dashboard</code>.</p>
	<div class="list">
		{#each snippets.names as name (name)}
			<div class="row" class:is-editing={editing === name}>
				<Switch title={label(name)} about={name} ico="code" checked={isOn(name)} onchange={(v: boolean) => toggleSnippet(name, v)} />
				<button class="small" onclick={() => (editing === name ? (editing = null) : edit(name))}>{@html icon("pencil", 13)} {editing === name ? "Done" : "Edit"}</button>
			</div>
			{#if editing === name}
				<div class="editor">
					<textarea bind:value={draft} oninput={typed} onkeydown={(e) => e.stopPropagation()} spellcheck="false"></textarea>
					<div class="bar">
						<span class="hint">{isOn(name) ? "Changes show as you type." : "Turn it on to see the changes."}</span>
						<button class="small danger" onclick={async () => { if (confirm(`Delete the snippet “${name}”?`)) { await deleteSnippet(name); editing = null; } }}>{@html icon("trash", 13)} Delete</button>
					</div>
				</div>
			{/if}
		{:else}
			<p class="st-sub">No snippets yet.</p>
		{/each}
	</div>
	<button class="primary" onclick={() => add()}>{@html icon("plus", 14)} New snippet</button>
	<p class="st-sub guide">Every class and color you can use, live blocks for dashboards, and more: <a href={GUIDE} onclick={(e) => { e.preventDefault(); void import("@tauri-apps/plugin-opener").then((o) => o.openUrl(GUIDE)).catch(() => window.open(GUIDE, "_blank")); }}>the modding guide</a>.</p>
</section>

<section class="st-section">
	<h3 class="st-h">Examples to start from</h3>
	<p class="st-sub">Adds a copy to your snippets, turned on, that you can change.</p>
	<div class="st-grid" style:--min="220px">
		{#each EXAMPLES as ex (ex.name)}
			<button class="st-card example" onclick={() => add(ex.name, ex.css)}>
				<span class="name">{label(ex.name)}</span>
				<span class="about">{ex.about}</span>
			</button>
		{/each}
	</div>
</section>

<style>
	code {
		font: 0.92em var(--font-code);
	}
	.guide {
		margin-top: 12px;
	}
	a {
		color: var(--link);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.row :global(> :first-child) {
		flex: 1;
	}
	.editor {
		margin: -4px 0 6px;
	}
	textarea {
		width: 100%;
		min-height: 220px;
		padding: 12px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		outline: 0;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		color: var(--text);
		font: 12.5px/1.55 var(--font-code);
		tab-size: 2;
		resize: vertical;
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 6px;
	}
	.hint {
		color: var(--muted);
		font-size: 12px;
	}
	.small,
	.primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.small {
		flex: none;
		padding: 6px 11px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
	.small.danger:hover {
		border-color: #e05d5d;
		color: #e05d5d;
	}
	.primary {
		padding: 8px 14px;
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
	.example {
		padding: 12px 14px;
	}
	.example .name {
		font-weight: 650;
		text-transform: capitalize;
	}
	.example .about {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.45;
	}
</style>
