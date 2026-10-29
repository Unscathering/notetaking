<script lang="ts">
	// Minimize, maximize and close, in the top-right corner like Obsidian's: the
	// window has no title bar of its own. Empty space on the tab bar (and the
	// other bars along the top) drags the window; double-click it to maximize.
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { onMount } from "svelte";
	import { inDesktopApp } from "../cave";

	let maximized = $state(false);
	const win = inDesktopApp ? getCurrentWindow() : null;

	onMount(() => {
		if (!win) return;
		const check = async () => (maximized = await win.isMaximized());
		void check();
		const off = win.onResized(() => void check());
		return () => void off.then((f) => f());
	});
</script>

<div class="window-controls">
	<button onclick={() => win?.minimize()} title="Minimize" aria-label="Minimize">
		<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" /></svg>
	</button>
	<button onclick={() => win?.toggleMaximize()} title={maximized ? "Restore" : "Maximize"} aria-label={maximized ? "Restore" : "Maximize"}>
		{#if maximized}
			<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
		{:else}
			<svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5.5h9v9h-9z" /></svg>
		{/if}
	</button>
	<button class="close" onclick={() => win?.close()} title="Close" aria-label="Close">
		<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>
	</button>
</div>

<style>
	.window-controls {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 60;
		display: flex;
		height: 40px;
	}
	button {
		display: grid;
		place-items: center;
		width: 46px;
		border: 0;
		background: transparent;
		color: var(--muted);
		cursor: default;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	button:hover {
		background: var(--hover);
		color: var(--text);
	}
	.close:hover {
		background: #e81123;
		color: #fff;
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1;
		shape-rendering: crispEdges;
	}
</style>
