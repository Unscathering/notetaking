<script lang="ts">
	// The AI's proposed changes: untick anything, then "Do it". Undo takes it all back.
	import { approve, skip, undo, type ChatMessage } from "../../ai/agent.svelte";
	import { icon } from "../icons";

	let { m }: { m: ChatMessage } = $props();
	const plan = $derived(m.plan!);
	const count = $derived(plan.changes.filter((c) => c.checked).length);
	let undoing = $state(false);
</script>

<div class="plan" class:is-done={plan.status !== "waiting"}>
	<div class="head">
		<span class="ico">{@html icon("layers", 14)}</span>
		<b>Plan</b>
		<span class="sub">{plan.changes.length} {plan.changes.length === 1 ? "change" : "changes"}</span>
		{#if plan.status === "waiting" && plan.changes.length > 1}
			<button class="all" onclick={() => { const on = count < plan.changes.length; for (const c of plan.changes) c.checked = on; }}>{count < plan.changes.length ? "Select all" : "Clear all"}</button>
		{/if}
	</div>
	<ul>
		{#each plan.changes as c (c.id)}
			<li class:off={!c.checked} class:bad={!!c.problem}>
				<label>
					{#if c.state === "doing"}<span class="state"><span class="spin"></span></span>
					{:else if c.state === "done"}<span class="state ok">{@html icon("check", 14)}</span>
					{:else if c.state === "failed"}<span class="state bad">{@html icon("alert", 14)}</span>
					{:else}<input type="checkbox" bind:checked={c.checked} disabled={plan.status !== "waiting"} />{/if}
					<span class="c-ico">{@html icon(c.icon, 13)}</span>
					<span class="what">{c.summary}{#if c.problem}<small>{c.problem}</small>{/if}</span>
				</label>
			</li>
		{/each}
	</ul>
	<div class="foot">
		{#if plan.status === "waiting"}
			<button class="go" disabled={!count} onclick={() => approve(m)}>{@html icon("check", 13)} Do it{count < plan.changes.length ? ` (${count})` : ""}</button>
			<button class="ghost" onclick={() => skip(m)}>Not now</button>
		{:else if plan.status === "doing"}
			<span class="note"><span class="spin"></span> Working on it… {plan.changes.filter((c) => c.state === "done" || c.state === "failed").length} of {count}</span>
		{:else if plan.status === "done"}
			<span class="note ok">{@html icon("check", 13)} {plan.note}</span>
			{#if !plan.reopened}<button class="ghost" disabled={undoing} onclick={async () => { undoing = true; await undo(m); undoing = false; }}>{@html icon("undo", 13)} Undo</button>{/if}
		{:else if plan.status === "undone"}
			<span class="note">Undone. Everything is back as it was.</span>
		{:else}
			<span class="note">Skipped. Nothing was changed.</span>
		{/if}
	</div>
</div>

<style>
	.plan {
		margin-top: 10px;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
		border-radius: calc(var(--radius) * 1.3);
		background: color-mix(in srgb, var(--raised) 70%, transparent);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 9px 12px;
		border-bottom: 1px solid var(--border);
		font-size: 12.5px;
	}
	.ico {
		display: inline-flex;
		color: var(--accent);
	}
	.sub {
		color: var(--muted);
	}
	.all {
		margin-left: auto;
		padding: 0;
		border: 0;
		background: none;
		color: var(--muted);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	ul {
		max-height: 260px;
		margin: 0;
		padding: 4px;
		overflow-y: auto;
		list-style: none;
	}
	li label {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 8px;
		border-radius: calc(var(--radius) * 0.7);
		font-size: 12.5px;
		line-height: 1.4;
		cursor: pointer;
		transition: opacity var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	li label:hover {
		background: var(--hover);
	}
	li.off label {
		opacity: 0.45;
	}
	input {
		flex: none;
		margin: 2px 0 0;
		accent-color: var(--accent);
	}
	.c-ico {
		display: inline-flex;
		margin-top: 1px;
		color: var(--muted);
	}
	.state {
		display: inline-flex;
		flex: none;
		justify-content: center;
		width: 13px;
		margin-top: 2px;
	}
	.state.ok {
		color: #5fb878;
	}
	.state.bad {
		color: #e05d5d;
	}
	.spin {
		display: inline-block;
		width: 11px;
		height: 11px;
		border: 1.5px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.what small {
		display: block;
		color: #e05d5d;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border-top: 1px solid var(--border);
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 12px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.go {
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
	.ghost {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
	.note {
		flex: 1;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		color: var(--muted);
	}
	.note.ok {
		color: #5fb878;
	}
</style>
