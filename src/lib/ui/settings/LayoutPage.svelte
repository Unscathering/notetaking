<script lang="ts">
	import { theme } from "../../theme/store.svelte";
	import Slider from "./Slider.svelte";
	import Switch from "./Switch.svelte";

	const CORNERS: Array<[number, string]> = [[0, "Sharp"], [5, "Soft"], [10, "Round"], [18, "Extra round"]];
	const SPACING: Array<[number, string, string]> = [[0.8, "Compact", "More on screen"], [1, "Cozy", "The default"], [1.25, "Airy", "Room to breathe"]];
</script>

<section class="st-section">
	<h3 class="st-h">Corners</h3>
	<p class="st-sub">How rounded buttons, cards and menus are.</p>
	<div class="st-grid" style:--min="120px">
		{#each CORNERS as [r, name] (r)}
			<button class="st-card" class:is-on={theme.shape.radius === r} onclick={() => (theme.shape.radius = r)}>
				<span class="corner-demo"><i style:border-radius="{r * 1.6}px 0 0 0"></i></span>
				<span class="name">{name}</span>
			</button>
		{/each}
	</div>
	<div class="st-two fine"><Slider label="Exactly" bind:value={theme.shape.radius} min={0} max={24} format={(v) => `${v}px`} /></div>
</section>

<section class="st-section">
	<h3 class="st-h">Spacing</h3>
	<p class="st-sub">The room around everything in the sidebar, menus and notes.</p>
	<div class="st-grid" style:--min="150px">
		{#each SPACING as [d, name, about] (d)}
			<button class="st-card" class:is-on={theme.shape.density === d} onclick={() => (theme.shape.density = d)}>
				<span class="space-demo" style:gap="{d * 7}px" style:padding="{d * 10}px">
					<i></i><i></i><i></i><i></i>
				</span>
				<span class="name">{name}<small>{about}</small></span>
			</button>
		{/each}
	</div>
	<div class="st-two fine"><Slider label="Exactly" bind:value={theme.shape.density} min={0.6} max={1.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} /></div>
</section>

<section class="st-section">
	<h3 class="st-h">Sizes</h3>
	<div class="st-two">
		<Slider label="Sidebar width" bind:value={theme.shape.sidebarWidth} min={180} max={440} step={10} format={(v) => `${v}px`} ends={["Narrow", "Wide"]} />
		<Slider label="Banner height" bind:value={theme.shape.bannerHeight} min={100} max={420} step={10} format={(v) => `${v}px`} ends={["Slim", "Tall"]} />
	</div>
</section>

<section class="st-section">
	<Switch title="Floating panels" about="Each part of the window becomes its own rounded island, with gaps between them. Looks best with glass." ico="layers" bind:checked={theme.glass.floating} />
</section>

<style>
	.fine {
		margin-top: 14px;
	}
	.corner-demo {
		display: block;
		height: 64px;
		padding: 16px 0 0 18px;
		overflow: hidden;
		border-radius: var(--radius);
		background: var(--bg);
	}
	.corner-demo i {
		display: block;
		height: 100%;
		border-top: 3px solid var(--accent);
		border-left: 3px solid var(--accent);
		background: var(--accent-soft);
		transition: border-radius var(--dur) var(--ease);
	}
	.space-demo {
		display: flex;
		flex-direction: column;
		height: 84px;
		overflow: hidden;
		border-radius: var(--radius);
		background: var(--bg);
	}
	.space-demo i {
		flex: none;
		height: 8px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--muted) 55%, transparent);
	}
	.space-demo i:first-child {
		width: 60%;
		background: var(--accent);
	}
</style>
