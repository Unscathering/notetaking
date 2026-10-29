<script lang="ts">
	// The focus timer in the bottom bar: a button that becomes a countdown, and a
	// little card to start, pause, stretch or stop it.
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { addMinutes, focus, pauseFocus, startBreak, startFocus, stopFocus } from "../focus.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
	let open = $state(false);
	let task = $state(focus.task);

	const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
	const total = $derived(focus.phase === "break" ? (focus.minutes >= 50 ? 10 : 5) * 60 : focus.minutes * 60);
	const progress = $derived(focus.phase === "focus" || focus.phase === "break" ? 1 - focus.left / Math.max(1, total) : 0);

	// When a focus stretch ends, show the card.
	$effect(() => {
		if (focus.phase === "done") open = true;
	});
</script>

<div class="focus">
	<button class="pill" class:is-on={focus.phase !== "idle"} class:is-break={focus.phase === "break"} onclick={() => (open = !open)} title="Focus timer">
		{#if focus.phase === "focus" || focus.phase === "break"}
			<svg viewBox="0 0 16 16" width="13" height="13" class="ring"><circle cx="8" cy="8" r="6.5" /><circle cx="8" cy="8" r="6.5" class="fill" style:stroke-dasharray="{progress * 40.8} 40.8" /></svg>
			{clock(focus.left)}{focus.paused ? " · paused" : ""}
		{:else if focus.phase === "done"}
			{@html icon("check", 13)} Done!
		{:else}
			{@html icon("clock", 13)} Focus{focus.count ? ` · ${focus.count}` : ""}
		{/if}
	</button>
	{#if open}
		<div class="card" transition:fly={{ y: 8, duration: ms, easing: cubicOut }}>
			{#if focus.phase === "idle"}
				<b>Focus on one thing</b>
				<input bind:value={task} placeholder="What are you working on?" onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") { startFocus(focus.minutes, task); open = false; } }} />
				<div class="lengths">
					{#each [15, 25, 50] as m (m)}<button class:is-on={focus.minutes === m} onclick={() => (focus.minutes = m)}>{m} min</button>{/each}
				</div>
				<button class="go" onclick={() => { startFocus(focus.minutes, task); open = false; }}>{@html icon("zap", 13)} Start</button>
				<small>Each finished session is written into today's note.</small>
			{:else if focus.phase === "done"}
				<b>Nice work!</b>
				<p>{focus.minutes} minutes{focus.task ? ` on ${focus.task}` : ""}. It's in today's note.</p>
				<button class="go" onclick={() => { startBreak(); open = false; }}>{@html icon("coffee", 13)} Take a {focus.minutes >= 50 ? 10 : 5}-minute break</button>
				<button class="ghost" onclick={() => { startFocus(); open = false; }}>Keep going</button>
				<button class="ghost" onclick={() => { stopFocus(); open = false; }}>Stop for now</button>
			{:else}
				<b>{focus.phase === "break" ? "Break" : focus.task || "Focusing"}</b>
				<p class="big">{clock(focus.left)}</p>
				<div class="row">
					<button class="ghost" onclick={pauseFocus}>{focus.paused ? "Resume" : "Pause"}</button>
					<button class="ghost" onclick={() => addMinutes(5)}>+5 min</button>
					<button class="ghost" onclick={() => { stopFocus(); open = false; }}>Stop</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.focus {
		position: relative;
		margin-right: auto;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 1px 8px;
		border: 1px solid transparent;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-variant-numeric: tabular-nums;
		cursor: pointer;
		transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.pill:hover,
	.pill.is-on {
		color: var(--text);
		border-color: var(--border);
	}
	.pill.is-on {
		color: var(--accent);
	}
	.pill.is-break {
		color: #5fb878;
	}
	.ring {
		transform: rotate(-90deg);
		fill: none;
		stroke-width: 2.5;
	}
	.ring circle {
		stroke: var(--border);
	}
	.ring .fill {
		stroke: currentColor;
		stroke-linecap: round;
	}
	.card {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		z-index: 30;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 250px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		box-shadow: var(--glass-edge), 0 14px 34px rgba(0, 0, 0, 0.35);
		color: var(--text);
		font-size: 13px;
	}
	b {
		color: var(--heading);
	}
	p {
		margin: 0;
		color: var(--muted);
		line-height: 1.45;
	}
	p.big {
		color: var(--text);
		font-size: 28px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	input {
		padding: 7px 9px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
	}
	input:focus {
		border-color: var(--accent);
	}
	.lengths,
	.row {
		display: flex;
		gap: 4px;
	}
	.lengths button {
		flex: 1;
		padding: 5px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.lengths button.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--text);
	}
	.go,
	.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 7px 10px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.go {
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
	.ghost {
		flex: 1;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
	small {
		color: var(--muted);
		font-size: 11px;
	}
</style>
