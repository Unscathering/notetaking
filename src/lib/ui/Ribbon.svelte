<script lang="ts">
	// The command bar: one icon per feature, down the left edge of the window.
	import { command } from "../commands";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	const top = ["home", "files", "search", "tags", "new-note", "new-board", "palette"].map(command);
	const bottom = ["caves", "appearance"].map(command);

	const isOn = (id: string) =>
		(id === "files" || id === "search" || id === "tags") && ws.sidebarOpen && ws.panel === id
			? true
			: (id === "appearance" && ws.modal === "settings") || (id === "caves" && ws.modal === "caves") || (id === "palette" && ws.modal === "palette");
</script>

<nav class="ribbon" aria-label="Commands">
	{#each top as c (c.id)}
		<button class:is-on={isOn(c.id)} onclick={c.run} title={c.keys ? `${c.label} (${c.keys})` : c.label}>{@html icon(c.icon, 18)}</button>
	{/each}
	<span class="gap"></span>
	{#each bottom as c (c.id)}
		<button class:is-on={isOn(c.id)} onclick={c.run} title={c.keys ? `${c.label} (${c.keys})` : c.label}>{@html icon(c.icon, 18)}</button>
	{/each}
</nav>

<style>
	.ribbon {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 48px;
		padding: 10px 0;
		background-color: var(--part-ribbon-bg, var(--surface-panel));
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		box-shadow: var(--glass-edge);
		border-right: 1px solid var(--border);
	}
	.gap {
		flex: 1;
	}
	button {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--part-ribbon-icon, var(--muted));
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease), transform var(--dur) var(--ease);
	}
	button:hover {
		background: var(--hover);
		color: var(--text);
		transform: scale(1.06);
	}
	button:active {
		transform: scale(0.94);
	}
	button.is-on {
		background: var(--accent-soft);
		color: var(--accent);
	}
	button.is-on::before {
		content: "";
		position: absolute;
		left: -6px;
		top: 9px;
		bottom: 9px;
		width: 3px;
		border-radius: 3px;
		background: var(--accent);
	}
</style>
