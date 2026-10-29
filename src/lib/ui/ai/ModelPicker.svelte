<script lang="ts">
	// The model cards: which suits this PC, how fast and clever each is, and
	// whether it's downloaded.
	import { MODELS, fit } from "../../ai/models";
	import { addPictureReader, ai, deleteModel, downloadModel, recommendedModel, useModel, useWriterModel } from "../../ai/engine.svelte";
	import { icon } from "../icons";
	import { bench } from "../../ai/bench.svelte";

	const hw = $derived(ai.hardware ?? { vramMb: 0, ramMb: 0, gpuName: "" });
	const installed = (file: string) => ai.models.some((m) => m.file === file);
	// Once models have been through the model test on this PC, the best of them is the pick.
	const tested = $derived(bench.runs.find((r) => installed(r.model) && MODELS.some((m) => m.file === r.model)));
	const best = $derived(MODELS.find((m) => m.file === tested?.model) ?? recommendedModel());
	const gb = (mb: number) => `${Math.round(mb / 1024)} GB`;
	/** Model files on this PC that aren't one of the cards (older ones, or ones you added). */
	const others = $derived(ai.models.filter((f) => !MODELS.some((m) => m.file === f.file)));
	const label = (file: string) => MODELS.find((m) => m.file === file)?.name ?? file.replace(/\.gguf$/, "");
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
				{#if m.id === best.id}<span class="badge">{@html icon("sparkles", 11)} {tested ? `Best in your test (${tested.score})` : "Recommended for your PC"}</span>{/if}
				{#if m.vision}<span class="sees" title="It can look at pictures you send it in the chat">{@html icon("image", 11)} Sees pictures</span>{/if}
				<span class="size">{m.sizeGb} GB</span>
			</div>
			<p>{m.about}</p>
			<div class="bars">
				<span>Speed <i>{#each [1, 2, 3, 4, 5] as k (k)}<em class:on={k <= m.speed}></em>{/each}</i></span>
				<span>Smarts <i>{#each [1, 2, 3, 4, 5] as k (k)}<em class:on={k <= m.smarts}></em>{/each}</i></span>
			</div>
			<div class="foot">
				<span class="fit fit-{f}">{f === "ok" && m.expertMb && hw.vramMb ? "Runs well, with part of it in memory" : FIT[f]}</span>
				{#if have && m.vision && !ai.models.find((f) => f.file === m.file)?.vision}
					<button class="ghost" disabled={!!ai.download} title="Downloads the small file that lets it see pictures" onclick={() => addPictureReader(m.id)}>{@html icon("image", 13)} Add picture reading</button>
				{/if}
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

{#if others.length}
	<h4>Other models on this PC</h4>
	<div class="others">
		{#each others as f (f.file)}
			<div class="other" class:is-on={ai.model === f.file}>
				<span class="name" title={f.file}>{label(f.file)}</span>
				<span class="size">{(f.sizeMb / 1024).toFixed(1)} GB</span>
				{#if ai.model === f.file}
					<span class="using">{@html icon("check", 13)} In use</span>
				{:else}
					<button class="ghost" onclick={() => useModel(f.file)}>Use this</button>
				{/if}
				<button class="ghost danger" title="Delete this model from your PC" onclick={() => confirm(`Delete ${label(f.file)} (${(f.sizeMb / 1024).toFixed(1)} GB) from this PC?`) && deleteModel(f.file)}>{@html icon("trash", 13)}</button>
			</div>
		{/each}
	</div>
{/if}

{#if ai.models.length > 1}
	<h4>Writing help</h4>
	<label class="writer">
		<span>Grammar checks and rewrites use</span>
		<select value={ai.writerModel || ai.model} onchange={(e) => useWriterModel(e.currentTarget.value)}>
			{#each ai.models as f (f.file)}<option value={f.file}>{label(f.file)}{f.file === ai.model ? " (the chat model)" : ""}</option>{/each}
		</select>
	</label>
	<p class="note">A small model here (like Fast) makes fixes near instant while a big one handles chats. Both stay loaded, so they share your graphics memory.</p>
{/if}

<style>
	h4 {
		margin: 16px 0 8px;
		font-size: 12px;
		font-weight: 650;
		color: var(--heading);
	}
	.others {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.other {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 12.5px;
	}
	.other .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.other .size {
		margin-left: 0;
	}
	.writer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
	}
	.writer select {
		flex: 1;
		min-width: 160px;
		padding: 5px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--raised);
		color: var(--text);
		font: inherit;
	}
	.note {
		margin: 6px 0 0;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--muted);
	}
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
	.sees {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 1px 7px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--muted);
		font-size: 10.5px;
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
