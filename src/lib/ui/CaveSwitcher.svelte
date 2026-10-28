<script lang="ts">
	// Switch between caves (note folders), or open a new one.
	import { fly, fade } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { forgetCave, inDesktopApp, openCaveAt, pickCave, recentCaves } from "../cave";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
	let recent = $state(recentCaves());

	async function openNew() {
		const cave = await pickCave();
		if (!cave) return;
		ws.modal = null;
		await ws.load(cave);
	}

	async function switchTo(path: string) {
		ws.modal = null;
		await ws.load(openCaveAt(path));
	}

	function forget(path: string) {
		forgetCave(path);
		recent = recentCaves();
	}
</script>

<div class="scrim" transition:fade={{ duration: ms }} onclick={() => (ws.modal = null)} role="presentation"></div>
<div class="box" transition:fly={{ y: 12, duration: ms, easing: cubicOut }} role="dialog" aria-label="Caves">
	<header>
		<h2>Caves</h2>
		<p>A cave is a folder of notes. Keep as many as you like and switch between them here.</p>
	</header>
	<ul>
		{#if !inDesktopApp}
			<li><div class="cave is-on"><span class="ico">{@html icon("cave", 18)}</span><span class="name">Sample cave<small>In the browser</small></span></div></li>
		{/if}
		{#each recent as c (c.path)}
			<li>
				<button class="cave" class:is-on={ws.cave?.id === c.path} onclick={() => switchTo(c.path)}>
					<span class="ico">{@html icon("cave", 18)}</span>
					<span class="name">{c.name}<small>{c.path}</small></span>
				</button>
				{#if ws.cave?.id !== c.path}
					<button class="forget" onclick={() => forget(c.path)} title="Remove from this list (the folder stays)">{@html icon("x")}</button>
				{/if}
			</li>
		{/each}
	</ul>
	<button class="primary" onclick={openNew}>{@html icon("folderPlus")} Open a folder as a cave</button>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: color-mix(in srgb, black 35%, transparent);
	}
	.box {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 51;
		width: min(520px, calc(100vw - 32px));
		translate: -50% -50%;
		padding: 22px;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--glass-edge), 0 28px 70px rgba(0, 0, 0, 0.4);
	}
	h2 {
		margin: 0;
		color: var(--heading);
		font-size: 18px;
	}
	header p {
		margin: 6px 0 14px;
		color: var(--muted);
		font-size: 13.5px;
	}
	ul {
		max-height: 50vh;
		margin: 0 0 14px;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.cave {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 12px;
		min-width: 0;
		padding: 10px 12px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.cave:hover {
		background: var(--hover);
	}
	.cave.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.ico {
		display: inline-flex;
		color: var(--accent);
	}
	.name {
		display: flex;
		flex-direction: column;
		min-width: 0;
		font-weight: 600;
	}
	small {
		overflow: hidden;
		color: var(--muted);
		font-weight: 400;
		font-size: 12px;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.forget {
		display: inline-flex;
		padding: 6px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.forget:hover {
		background: var(--hover);
		color: var(--text);
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 11px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
</style>
