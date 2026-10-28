<script lang="ts">
	import { SIDEBAR_STYLES, type FolderColorOn } from "../../theme/theme";
	import { theme } from "../../theme/store.svelte";
	import Slider from "./Slider.svelte";
	import Switch from "./Switch.svelte";
	import TreePreview from "./TreePreview.svelte";

	const sb = theme.sidebar;
	const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
	const COLOR_ON: Array<[FolderColorOn, string]> = [["icon", "Icon"], ["name", "Name"], ["both", "Icon and name"], ["row", "Whole row"]];
	const ICONS: Array<[typeof sb.folderIcons, string]> = [["always", "Always"], ["custom", "Only ones I pick"], ["none", "None"]];
	const WEIGHTS: Array<[number, string]> = [[400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"]];
</script>

<section class="st-section">
	<h3 class="st-h">Styles</h3>
	<p class="st-sub">Start from a ready-made look for your folders. Right-click any folder or note to give it a color, an icon or an emoji.</p>
	<div class="st-grid" style:--min="170px">
		{#each SIDEBAR_STYLES as s (s.name)}
			<button class="st-card" class:is-on={same({ ...s.looks, marker: false }, { ...theme.sidebar, marker: false })} onclick={() => Object.assign(theme.sidebar, { ...s.looks, marker: theme.sidebar.marker })}>
				<TreePreview looks={s.looks} />
				<span class="name">{s.name}</span>
				<span class="about">{s.about}</span>
			</button>
		{/each}
	</div>
</section>

<section class="st-section st-top">
	<div class="st-preview"><TreePreview looks={theme.sidebar} /><span>Live preview</span></div>
	<div>
		<h3 class="st-h">Folder color shows on</h3>
		<div class="st-chips gap">
			{#each COLOR_ON as [id, name] (id)}
				<button class="st-chip" class:is-on={theme.sidebar.colorOn === id} onclick={() => (theme.sidebar.colorOn = id)}>{name}</button>
			{/each}
		</div>
		<h3 class="st-h">Folder icons</h3>
		<div class="st-chips gap">
			{#each ICONS as [id, name] (id)}
				<button class="st-chip" class:is-on={theme.sidebar.folderIcons === id} onclick={() => (theme.sidebar.folderIcons = id)}>{name}</button>
			{/each}
		</div>
		<h3 class="st-h">Folder names</h3>
		<div class="st-chips gap">
			{#each WEIGHTS as [w, name] (w)}
				<button class="st-chip" class:is-on={theme.sidebar.folderWeight === w} style:font-weight={w} onclick={() => (theme.sidebar.folderWeight = w)}>{name}</button>
			{/each}
		</div>
	</div>
</section>

<section class="st-section switches">
	<Switch title="Arrows" about="A small arrow beside each folder that turns when it opens." ico="chevron" bind:checked={theme.sidebar.arrows} />
	<Switch title="Page icons" about="A little page icon beside every note." ico="file" bind:checked={theme.sidebar.fileIcons} />
	<Switch title="Guide lines" about="A soft line in the folder's color down an open folder." ico="layout" bind:checked={theme.sidebar.guides} />
	<Switch title="Note counts" about="How many notes are inside each folder." ico="tag" bind:checked={theme.sidebar.counts} />
</section>

<section class="st-section">
	<h3 class="st-h">Sizes</h3>
	<div class="st-two">
		<Slider label="Text size" bind:value={theme.sidebar.size} min={11} max={18} step={0.5} format={(v) => `${v}px`} ends={["Small", "Large"]} />
		<Slider label="Step in per level" bind:value={theme.sidebar.indent} min={6} max={28} format={(v) => `${v}px`} ends={["Tight", "Deep"]} />
	</div>
</section>

<section class="st-section">
	<h3 class="st-h">Command bar</h3>
	<p class="st-sub">The column of icons on the far left.</p>
	<Switch title="Side tab on the active button" about="Adds a small colored tab beside the highlighted button, as well as the highlight." ico="sidebar" bind:checked={theme.sidebar.marker} />
</section>

<style>
	.gap {
		margin: 8px 0 18px;
	}
	.switches {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
</style>
