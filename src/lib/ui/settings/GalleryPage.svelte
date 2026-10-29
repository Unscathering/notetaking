<script lang="ts">
	// The gallery: snippets, themes and dashboards shared by people who use
	// Basalt. One click installs one.
	import { onMount } from "svelte";
	import { gallery, hasSnippet, installDashboard, installSnippet, installTheme, loadGallery, usingTheme, type Entry } from "../../gallery.svelte";
	import { loadSnippets } from "../../snippets.svelte";
	import { ws } from "../../workspace.svelte";
	import { icon } from "../icons";

	let tab = $state<"snippets" | "themes" | "dashboards">("themes");
	let busy = $state("");
	let done = $state<Record<string, boolean>>({});
	let error = $state("");

	onMount(() => {
		void loadGallery();
		void loadSnippets();
	});

	const list = $derived(gallery.data?.[tab] ?? []);
	const isIn = (e: Entry) => done[e.id] || (tab === "snippets" && hasSnippet(e)) || (tab === "themes" && usingTheme(e));

	async function install(e: Entry) {
		busy = e.id;
		error = "";
		try {
			if (tab === "snippets") await installSnippet(e);
			else if (tab === "themes") await installTheme(e);
			else {
				await installDashboard(e);
				ws.modal = null;
			}
			done = { ...done, [e.id]: true };
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = "";
		}
	}

	const GUIDE = "https://github.com/Unscathering/notetaking/blob/main/MODDING.md#sharing-in-the-gallery";
</script>

<section class="st-section">
	<div class="tabs">
		{#each [["themes", "Themes"], ["snippets", "Snippets"], ["dashboards", "Dashboards"]] as [id, label] (id)}
			<button class:is-on={tab === id} onclick={() => (tab = id as typeof tab)}>{label}{#if gallery.data}<span>{gallery.data[id as typeof tab].length}</span>{/if}</button>
		{/each}
	</div>
	{#if gallery.loading && !gallery.data}
		<p class="st-sub">Loading the gallery…</p>
	{:else if gallery.error}
		<p class="problem">{gallery.error}</p>
		<button class="small" onclick={() => loadGallery()}>Try again</button>
	{:else}
		<div class="st-grid" style:--min="230px">
			{#each list as e (e.id)}
				<div class="st-card item">
					{#if e.swatch}
						<div class="swatch" style:background={e.swatch[0]}>
							<span style:background={e.swatch[1]}><i style:background={e.swatch[2]}></i><b style:background={e.swatch[3]}></b><b style:background={e.swatch[3]} class="short"></b></span>
						</div>
					{/if}
					<span class="name">{e.name}</span>
					<span class="about">{e.about}</span>
					<span class="by">by {e.author}</span>
					<button class="small" class:is-in={isIn(e)} disabled={busy === e.id || (tab !== "dashboards" && isIn(e))} onclick={() => install(e)}>
						{#if busy === e.id}Adding…{:else if tab !== "dashboards" && isIn(e)}{@html icon("check", 13)} {tab === "themes" ? "In use" : "Added"}{:else}{@html icon("download", 13)} {tab === "themes" ? "Use it" : "Add it"}{/if}
					</button>
				</div>
			{/each}
		</div>
		{#if error}<p class="problem">{error}</p>{/if}
	{/if}
	<p class="st-sub share">Made something nice? Share it: add your file to the <code>gallery</code> folder of Basalt's repository and open a pull request. <a href={GUIDE} onclick={(e) => { e.preventDefault(); void import("@tauri-apps/plugin-opener").then((o) => o.openUrl(GUIDE)).catch(() => window.open(GUIDE, "_blank")); }}>How to share</a>.</p>
</section>

<style>
	.tabs {
		display: inline-flex;
		margin-bottom: 16px;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		border: 0;
		border-radius: calc(var(--radius) * 0.7);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.tabs button.is-on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.tabs span {
		color: var(--muted);
		font-size: 11px;
	}
	.item {
		cursor: default;
		padding: 12px 14px;
	}
	.item:hover {
		transform: none;
	}
	.name {
		font-weight: 650;
	}
	.about {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.45;
	}
	.by {
		margin-top: auto;
		color: var(--muted);
		font-size: 11px;
	}
	.swatch {
		height: 64px;
		margin: -4px -6px 2px;
		padding: 10px;
		border-radius: var(--radius);
	}
	.swatch > span {
		display: flex;
		flex-direction: column;
		gap: 6px;
		height: 100%;
		padding: 8px;
		border-radius: calc(var(--radius) * 0.8);
	}
	.swatch i {
		width: 30%;
		height: 6px;
		border-radius: 3px;
	}
	.swatch b {
		width: 80%;
		height: 4px;
		border-radius: 2px;
		opacity: 0.7;
	}
	.swatch b.short {
		width: 55%;
	}
	.small {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.small:hover:not(:disabled) {
		border-color: var(--accent);
	}
	.small.is-in {
		color: #5fb878;
	}
	.small:disabled {
		cursor: default;
	}
	.problem {
		padding: 8px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 15%, transparent);
		font-size: 12.5px;
	}
	.share {
		margin-top: 18px;
	}
	code {
		font: 0.92em var(--font-code);
	}
	a {
		color: var(--link);
	}
</style>
