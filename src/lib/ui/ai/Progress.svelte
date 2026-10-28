<script lang="ts">
	import { ai, cancelDownload } from "../../ai/engine.svelte";
	const d = $derived(ai.download);
	const pct = $derived(d && d.total ? Math.min(100, (d.done / d.total) * 100) : 0);
	const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.round(b / 1e6)} MB`);
</script>

{#if d}
	<div class="progress">
		<div class="row">
			<span>{d.what === "engine" ? "Downloading the AI engine…" : "Downloading the model…"}</span>
			<span class="num">{d.total ? `${mb(d.done)} of ${mb(d.total)}` : mb(d.done)}</span>
		</div>
		<div class="track"><i style:width="{pct}%" class:waiting={!d.total}></i></div>
		<button onclick={cancelDownload}>Cancel</button>
	</div>
{/if}

<style>
	.progress {
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background: color-mix(in srgb, var(--raised) 60%, transparent);
	}
	.row {
		display: flex;
		justify-content: space-between;
		font-size: 12.5px;
		color: var(--text);
	}
	.num {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.track {
		height: 6px;
		margin: 9px 0;
		overflow: hidden;
		border-radius: 6px;
		background: color-mix(in srgb, var(--muted) 25%, transparent);
	}
	.track i {
		display: block;
		height: 100%;
		border-radius: 6px;
		background: var(--accent);
		transition: width 300ms ease-out;
	}
	.track i.waiting {
		width: 30% !important;
		animation: slide 1.2s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(340%);
		}
	}
	button {
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	button:hover {
		color: var(--text);
	}
</style>
