<script lang="ts">
	import { GLASS_DEFAULTS, WALLPAPERS } from "../../theme/theme";
	import { MAX_SECONDS, mediaUrl, removeMedia, saveBackground } from "../../theme/media.svelte";
	import { theme } from "../../theme/store.svelte";
	import { icon } from "../icons";
	import MiniApp from "./MiniApp.svelte";
	import Slider from "./Slider.svelte";

	const b = theme.background;
	let busy = $state(false);
	let problem = $state("");
	const own = $derived(b.media ? mediaUrl(b.media) : b.image);
	const ownIsVideo = $derived(!!b.media && b.mediaKind === "video");

	/** Checks the file (moving ones can be up to 15 seconds), keeps it on this computer and shows it. */
	async function choose(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		busy = true;
		problem = "";
		try {
			const old = b.media;
			const saved = await saveBackground(file);
			Object.assign(theme.background, { kind: saved.kind, media: saved.id, mediaKind: saved.kind, image: "" });
			if (old && old !== saved.id) void removeMedia(old);
		} catch (err) {
			problem = err instanceof Error ? err.message : "That file couldn't be used.";
		} finally {
			busy = false;
		}
	}

	function useOwn() {
		theme.background.kind = b.media ? b.mediaKind : "image";
	}
</script>

<section class="st-section st-top">
	<div class="st-preview"><MiniApp t={theme} /><span>Live preview</span></div>
	<div class:is-off={b.kind === "none"}>
		<h3 class="st-h">Softening</h3>
		<p class="st-sub">Blur the picture and fade it toward your theme's color so text stays easy to read.</p>
		<Slider label="Blur" bind:value={theme.background.blur} min={0} max={60} format={(v) => (v ? `${v}px` : "Sharp")} ends={["Sharp", "Dreamy"]} disabled={b.kind === "none"} />
		<Slider label="Fade" bind:value={theme.background.fade} min={0} max={90} format={(v) => `${v}%`} ends={["Vivid", "Subtle"]} disabled={b.kind === "none"} />
	</div>
</section>

{#if theme.background.kind !== "none" && theme.glass.material === "solid"}
	<div class="st-note">
		<span>Your panels are solid, so the background only shows around them. Make them see-through to show it everywhere.</span>
		<button onclick={() => Object.assign(theme.glass, { ...GLASS_DEFAULTS.clear, seamless: true })}>Transparent</button>
		<button onclick={() => Object.assign(theme.glass, GLASS_DEFAULTS.frosted)}>Frosted glass</button>
	</div>
{/if}

<section class="st-section">
	<h3 class="st-h">Picture</h3>
	<p class="st-sub">Something to sit behind your notes. Pick one of ours or use your own.</p>
	<div class="st-grid walls" style:--min="118px">
		<button class="st-card wall" class:is-on={b.kind === "none"} onclick={() => (theme.background.kind = "none")}>
			<span class="thumb plain" style:background={theme.colors.bg}>{@html icon("x", 18)}</span>
			<span class="name">None</span>
		</button>
		{#snippet ownThumb()}
			<span class="thumb own" class:has-own={!!own} style:background={own && !ownIsVideo ? `url("${own}") center / cover` : undefined}>
				{#if own && ownIsVideo}
					<video src={own} autoplay muted loop playsinline></video>
					<em class="badge">{@html icon("video", 11)} Moving</em>
				{:else if !own}
					{@html icon("upload", 18)}<small>{busy ? "Checking…" : "Picture, GIF or video"}</small>
				{/if}
			</span>
			<span class="name">Your own</span>
		{/snippet}
		{#if own}
			<button class="st-card wall" class:is-on={b.kind === "image" || b.kind === "video"} onclick={useOwn}>{@render ownThumb()}</button>
		{:else}
			<label class="st-card wall">{@render ownThumb()}<input type="file" accept="image/*,video/mp4,video/webm" hidden onchange={choose} /></label>
		{/if}
		{#each Object.entries(WALLPAPERS) as [id, w] (id)}
			<button class="st-card wall" class:is-on={b.kind === "wallpaper" && b.wallpaper === id} onclick={() => Object.assign(theme.background, { kind: "wallpaper", wallpaper: id })}>
				<span class="thumb" style:background={w.css}></span>
				<span class="name">{w.name}</span>
			</button>
		{/each}
	</div>
	<div class="own-row">
		<label class="st-ghost">{@html icon("upload", 14)} {own ? "Choose a different file" : "Choose a picture, GIF or video"}<input type="file" accept="image/*,video/mp4,video/webm" hidden onchange={choose} /></label>
		<span class="hint">{busy ? "Checking…" : `GIFs and videos (MP4 or WebM) can be up to ${MAX_SECONDS} seconds and loop forever. They stay on this computer and pause when Basalt is minimized.`}</span>
	</div>
	{#if problem}<p class="problem">{problem}</p>{/if}
</section>

<style>
	.wall {
		padding: 6px;
		gap: 6px;
	}
	.wall.is-on::after {
		top: 10px;
		right: 10px;
	}
	.thumb {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		aspect-ratio: 4 / 3;
		border-radius: calc(var(--radius) * 0.9);
		color: var(--muted);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 10%, transparent);
	}
	.thumb small {
		font-size: 11px;
	}
	.own {
		border: 1.5px dashed var(--border);
		box-shadow: none;
	}
	.thumb {
		position: relative;
		overflow: hidden;
	}
	.has-own {
		border: 0;
	}
	.thumb video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.badge {
		position: absolute;
		left: 6px;
		bottom: 6px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font: 600 10.5px var(--font-ui);
		font-style: normal;
	}
	.own-row {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-top: 14px;
	}
	.own-row .st-ghost {
		flex: none;
	}
	.hint {
		font-size: 12px;
		line-height: 1.45;
		color: var(--muted);
	}
	.problem {
		margin: 12px 0 0;
		padding: 10px 14px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 16%, transparent);
		color: var(--text);
		font-size: 12.5px;
	}
	.is-off {
		opacity: 0.6;
	}
</style>
