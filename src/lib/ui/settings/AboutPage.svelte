<script lang="ts">
	// Which Basalt this is, and updating it.
	import { onMount } from "svelte";
	import { inDesktopApp } from "../../cave";
	import { REPO, checkForUpdate, installUpdate, updates } from "../../updates.svelte";
	import { icon } from "../icons";

	let checked = $state(false);
	onMount(async () => {
		if (!inDesktopApp) return;
		const { getVersion } = await import("@tauri-apps/api/app");
		updates.current ||= await getVersion();
	});
	async function check() {
		await checkForUpdate(false);
		checked = true;
	}
	const releases = `https://github.com/${REPO}/releases`;
	const open = (url: string) => void import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url));
</script>

<section class="st-section">
	<h3 class="st-h">Version</h3>
	<p class="version">{inDesktopApp ? `Basalt ${updates.current || "…"}` : "Basalt in a browser (updates are for the desktop app)"}</p>
	{#if inDesktopApp}
		{#if updates.version}
			<div class="st-note">
				<span>Basalt {updates.version} is ready. Your notes, settings and AI models stay as they are.</span>
				<button onclick={installUpdate} disabled={!!updates.installing}>{updates.installing ? "Updating…" : "Update now"}</button>
			</div>
		{/if}
		<div class="row">
			<button class="st-ghost" disabled={updates.checking} onclick={check}>{@html icon("download", 14)} {updates.checking ? "Checking…" : "Check for updates"}</button>
			{#if checked && !updates.checking && !updates.version}
				<span class="status">{updates.reached ? "You have the newest version." : "Couldn't reach GitHub. Try again later."}</span>
			{/if}
		</div>
		<p class="st-sub small">Basalt also checks by itself when it starts and every few hours, and shows a card in the corner when there's a new version.</p>
	{/if}
	<button class="link" onclick={() => open(releases)}>See every version and what changed</button>
</section>

<style>
	.version {
		margin: 0 0 12px;
		font-size: 20px;
		font-weight: 650;
		color: var(--text);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.status {
		font-size: 12.5px;
		color: var(--muted);
	}
	.small {
		margin-top: 12px;
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--link);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.st-ghost:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
