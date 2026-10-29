<script lang="ts">
	// The mic: click to talk, click again to stop, and the words arrive as text.
	// The first time, it offers the one-time download of the speech engine and a voice.
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { VOICES, cancelRecording, installSpeech, refreshSpeech, speech, startRecording, stopRecording } from "../speech.svelte";
	import { icon } from "./icons";

	let { ms, onText, up = true }: { ms: number; onText: (text: string) => void; up?: boolean } = $props();
	let open = $state(false);
	let pick = $state<string>(speech.model);

	async function click() {
		if (speech.phase === "unavailable") return;
		if (speech.phase === "unknown") await refreshSpeech().catch(() => {});
		if (speech.phase === "setup") {
			open = !open;
			return;
		}
		if (speech.busy) return;
		if (!speech.recording) await startRecording();
		else {
			const text = await stopRecording();
			if (text) onText(text);
		}
	}

	const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
	const pct = $derived(speech.download?.total ? Math.round((speech.download.done / speech.download.total) * 100) : 0);
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && speech.recording && cancelRecording()} />

<span class="mic">
	<button
		class="btn"
		class:is-rec={speech.recording}
		disabled={speech.phase === "unavailable" || speech.busy}
		onclick={click}
		title={speech.phase === "unavailable" ? "Voice typing is in the desktop app" : speech.recording ? "Stop and write it down (Esc to cancel)" : speech.phase === "setup" ? "Set up voice typing" : "Talk instead of typing"}
	>
		{#if speech.busy}<span class="spin"></span>{:else}{@html icon(speech.recording ? "stop" : "mic", 14)}{/if}
		{#if speech.recording}<span class="time">{clock(speech.seconds)}</span><span class="meter"><i style:transform="scaleY({0.2 + speech.level * 0.8})"></i></span>{:else if speech.busy}<span class="time">Writing it down…</span>{/if}
	</button>
	{#if open && speech.phase === "setup"}
		<div class="card" class:up transition:fly={{ y: up ? 8 : -8, duration: ms, easing: cubicOut }}>
			<b>Voice typing, right on this PC</b>
			<p>Talk and it types. It runs on this computer, so your voice never leaves it. One-time download: a small speech engine and a voice.</p>
			{#each VOICES as v (v.id)}
				<label class="voice" class:is-on={pick === v.id}>
					<input type="radio" name="voice" value={v.id} bind:group={pick} />
					<span><b>{v.name}</b><small>{v.about}</small></span>
				</label>
			{/each}
			{#if speech.download}
				<div class="bar"><i style:width="{pct}%"></i></div>
				<small>Downloading… {pct}%</small>
			{:else}
				<button class="go" onclick={async () => { await installSpeech(pick); if (speech.phase === "ready") open = false; }}>{@html icon("download", 13)} Download</button>
			{/if}
			{#if speech.error}<p class="problem">{speech.error}</p>{/if}
		</div>
	{/if}
	{#if speech.error && !open}<span class="err" title={speech.error}>{@html icon("alert", 13)}</span>{/if}
</span>

<style>
	.mic {
		position: relative;
		display: inline-flex;
		align-items: center;
	}
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 7px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.btn:hover:not(:disabled) {
		color: var(--text);
		background: var(--hover);
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.btn.is-rec {
		border-color: color-mix(in srgb, #e05d5d 60%, transparent);
		background: color-mix(in srgb, #e05d5d 14%, transparent);
		color: #e05d5d;
		animation: pulse 1.4s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			border-color: transparent;
		}
	}
	.meter {
		display: inline-flex;
		align-items: flex-end;
		width: 4px;
		height: 12px;
	}
	.meter i {
		width: 100%;
		height: 100%;
		border-radius: 2px;
		background: currentColor;
		transform-origin: bottom;
		transition: transform 80ms linear;
	}
	.spin {
		width: 12px;
		height: 12px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.err {
		display: inline-flex;
		margin-left: 2px;
		color: #e5a84b;
	}
	.card {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 280px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		box-shadow: var(--glass-edge), 0 14px 34px rgba(0, 0, 0, 0.35);
		color: var(--text);
		font-size: 13px;
		text-align: left;
	}
	.card.up {
		top: auto;
		bottom: calc(100% + 8px);
	}
	b {
		color: var(--heading);
	}
	p {
		margin: 0;
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.voice {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
	}
	.voice.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.voice input {
		margin-top: 3px;
		accent-color: var(--accent);
	}
	.voice small,
	small {
		display: block;
		color: var(--muted);
		font-size: 11.5px;
	}
	.go {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.bar {
		height: 6px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--hover);
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 200ms linear;
	}
	.problem {
		padding: 6px 8px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 15%, transparent);
		color: var(--text);
	}
</style>
