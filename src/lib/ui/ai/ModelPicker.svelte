<script lang="ts">
	// The model cards: which suits this PC, how fast and clever each is, and
	// whether it's downloaded.
	import { MODELS, fit } from "../../ai/models";
	import { ai, deleteModel, downloadModel, recommendedModel, useModel } from "../../ai/engine.svelte";
	import { icon } from "../icons";

	const hw = $derived(ai.hardware ?? { vramMb: 0, ramMb: 0, gpuName: "" });
	const best = $derived(recommendedModel());
	const installed = (file: string) => ai.models.some((m) => m.file === file);
	const gb = (mb: number) => `${Math.round(mb / 1024)} GB`;
	const FIT = { great: "Runs great on this PC", ok: "Runs, a little slower", slow: "Too big for this PC, will be slow" };
</script>

<div class="hw">
	{@html icon("cpu", 14)}
	<span>Your PC: {hw.gpuName || "no graphics card found"}{hw.vramMb ? ` · ${gb(hw.vramMb)} graphics memory` : ""} · {gb(hw.ramMb)} memory</span>
</div>

<div class="models">
	{#each MODELS as m (m.id)}
		{@const have = installed(m.file)}
		{@const f = fit(m, hw)}
		<div class="model" class:is-best={m.id === best.id} class:is-on={ai.model === m.file}>
			<div class="top">
				<b>{m.name}</b>
				{#if m.id === best.id}<span class="badge">{@html icon("sparkles", 11)} Recommended for your PC</span>{/if}
				<span class="size">{m.sizeGb} GB</span>
			</div>
			<p>{m.about}</p>
			<div class="bars">
				<span>Speed <i>{#each [1, 2, 3, 4, 5] as k (k)}<em class:on={k <= m.speed}></em>{/each}</i></span>
				<span>Smarts <i>{#each [1, 2, 3, 4, 5] as k (k)}<em class:on={k <= m.smarts}></em>{/each}</i></span>
			</div>
			<div class="foot">
				<span class="fit fit-{f}">{FIT[f]}</span>
				{#if have}
					{#if ai.model === m.file}
						<span class="using">{@html icon("check", 13)} In use</span>
					{:else}
						<button class="ghost" onclick={() => useModel(m.file)}>Use this</button>
					{/if}
					<button class="ghost danger" title="Delete this model from your PC" onclick={() => confirm(`Delete the ${m.name} model (${m.sizeGb} GB) from this PC?`) && deleteModel(m.file)}>{@html icon("trash", 13)}</button>
				{:else}
					<button class="primary" disabled={!!ai.download || !ai.engine} onclick={() => downloadModel(m.id)}>{@html icon("download", 13)} Download</button>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.hw {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
		font-size: 12px;
		color: var(--muted);
	}
	.models {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.model {
		padding: 12px 14px;
		border: 1.5px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background: color-mix(in srgb, var(--raised) 60%, transparent);
		transition: border-color var(--dur) var(--ease);
	}
	.model.is-best {
		border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.top b {
		font-size: 14px;
		color: var(--heading);
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 10.5px;
		font-weight: 650;
	}
	.size {
		margin-left: auto;
		font-size: 11.5px;
		color: var(--muted);
	}
	p {
		margin: 6px 0 8px;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--muted);
	}
	.bars {
		display: flex;
		gap: 16px;
		font-size: 11px;
		color: var(--muted);
	}
	.bars span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.bars i {
		display: inline-flex;
		gap: 2px;
	}
	.bars em {
		width: 10px;
		height: 4px;
		border-radius: 2px;
		background: color-mix(in srgb, var(--muted) 30%, transparent);
	}
	.bars em.on {
		background: var(--accent);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}
	.fit {
		flex: 1;
		font-size: 11.5px;
	}
	.fit-great {
		color: #5fb878;
	}
	.fit-ok {
		color: #e5a84b;
	}
	.fit-slow {
		color: #e05d5d;
	}
	.using {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		font-weight: 600;
		color: var(--accent);
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 11px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.primary {
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
	.ghost {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
	.ghost.danger {
		color: var(--muted);
	}
	.ghost.danger:hover {
		color: #e05d5d;
	}
</style>
