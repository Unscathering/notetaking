<script lang="ts">
	import { WALLPAPERS } from "../../theme/theme";
	import { theme } from "../../theme/store.svelte";
	import { icon } from "../icons";
	import MiniApp from "./MiniApp.svelte";
	import Slider from "./Slider.svelte";

	const b = theme.background;
	let busy = $state(false);

	/** Shrinks a picture so it stays light, then keeps it inside the theme. */
	async function choose(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		busy = true;
		try {
			const bmp = await createImageBitmap(file);
			const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(bmp.width * scale);
			canvas.height = Math.round(bmp.height * scale);
			canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
			theme.background.image = canvas.toDataURL("image/jpeg", 0.86);
			theme.background.kind = "image";
		} finally {
			busy = false;
		}
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
		<span>Your panels are solid, so the picture only shows around them. Glass lets it show through everywhere.</span>
		<button onclick={() => Object.assign(theme.glass, { material: "frosted", tint: 55, blur: 30, page: 60 })}>Use frosted glass</button>
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
		<label class="st-card wall" class:is-on={b.kind === "image"}>
			<span class="thumb own" style:background={b.image ? `url("${b.image}") center / cover` : undefined}>
				{#if !b.image}{@html icon("upload", 18)}<small>{busy ? "Loading…" : "Choose"}</small>{/if}
			</span>
			<span class="name">Your picture</span>
			<input type="file" accept="image/*" hidden onchange={choose} />
		</label>
		{#each Object.entries(WALLPAPERS) as [id, w] (id)}
			<button class="st-card wall" class:is-on={b.kind === "wallpaper" && b.wallpaper === id} onclick={() => Object.assign(theme.background, { kind: "wallpaper", wallpaper: id })}>
				<span class="thumb" style:background={w.css}></span>
				<span class="name">{w.name}</span>
			</button>
		{/each}
	</div>
	{#if b.kind === "image" && b.image}
		<label class="st-ghost change">{@html icon("image", 14)} Choose a different picture<input type="file" accept="image/*" hidden onchange={choose} /></label>
	{/if}
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
	.change {
		margin-top: 12px;
	}
	.is-off {
		opacity: 0.6;
	}
</style>
