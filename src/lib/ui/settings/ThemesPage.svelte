<script lang="ts">
	import { PRESETS, type PresetGroup, type Theme } from "../../theme/theme";
	import { theme, useTheme } from "../../theme/store.svelte";
	import MiniApp from "./MiniApp.svelte";

	const GROUPS: Array<PresetGroup | "All"> = ["All", "Dark", "Light", "Glass"];
	let group: PresetGroup | "All" = $state("All");
	const shown = $derived(PRESETS.filter((p) => group === "All" || p.group === group));

	/** Whether the live theme still looks exactly like a preset. */
	const looks = (t: Theme) => JSON.stringify({ ...t, name: "", group: undefined });
	const current = $derived(looks(theme));

	const describe = (p: Theme) => {
		const bits: string[] = [];
		if (p.glass.material === "liquid") bits.push("Liquid glass");
		else if (p.glass.material === "frosted") bits.push("Frosted");
		else if (p.glass.material === "glass") bits.push("Glass");
		if (p.type.editorFont.includes("serif") && !p.type.editorFont.includes("sans")) bits.push("Serif");
		return bits.join(" · ");
	};
</script>

<div class="st-chips filters">
	{#each GROUPS as g (g)}
		<button class="st-chip" class:is-on={group === g} onclick={() => (group = g)}>{g}</button>
	{/each}
</div>

<div class="st-grid" style:--min="200px">
	{#each shown as p (p.name)}
		<button class="st-card" class:is-on={current === looks(p)} onclick={() => useTheme(p)}>
			<MiniApp t={p} />
			<span class="name">{p.name}<small>{describe(p)}</small></span>
		</button>
	{/each}
</div>

<style>
	.filters {
		margin-bottom: 16px;
	}
</style>
