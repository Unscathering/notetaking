<script lang="ts">
	// The outline: the open note's headings (click to jump), the one you're in
	// lit up, and how long the note is. `goal: 1000` in a note's properties
	// shows progress toward that many words.
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { frontmatterRange, readProps } from "../notes";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();

	const path = $derived(ws.note ?? ws.recent);
	const text = $derived(path ? (ws.texts.get(path) ?? "") : "");

	interface Heading {
		level: number;
		title: string;
		line: number;
	}

	const headings = $derived.by(() => {
		const out: Heading[] = [];
		const start = text.slice(0, frontmatterRange(text)?.to ?? 0).split("\n").length - 1;
		let fence = false;
		text.split("\n").forEach((l, i) => {
			if (i < start) return;
			if (/^\s*(```|~~~)/.test(l)) fence = !fence;
			const m = !fence && /^(#{1,6})\s+(.+?)\s*#*$/.exec(l);
			if (m) out.push({ level: m[1].length, title: m[2].replace(/[*_`[\]]/g, ""), line: i });
		});
		return out;
	});
	const top = $derived(Math.min(...headings.map((h) => h.level), 6));
	/** The heading the cursor is under. */
	const current = $derived([...headings].reverse().find((h) => h.line <= ws.cursorLine && ws.note === path));

	const body = $derived(text.slice(frontmatterRange(text)?.to ?? 0));
	const words = $derived(body.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length);
	const minutes = $derived(Math.max(1, Math.round(words / 230)));
	const goal = $derived(parseInt(readProps(text).other.goal ?? "") || 0);

	function jump(h: Heading) {
		if (!path) return;
		if (ws.note !== path) void ws.open(path);
		ws.reveal = { path, line: h.line };
	}
</script>

<div class="outline">
	{#if !path}
		<p class="empty">Open a note to see its outline.</p>
	{:else}
		<div class="stats">
			<span><b>{words.toLocaleString()}</b> words</span>
			<span><b>{minutes}</b> min read</span>
			<span><b>{headings.length}</b> {headings.length === 1 ? "heading" : "headings"}</span>
		</div>
		{#if goal}
			<div class="goal" title="From goal: {goal} in this note's properties">
				<div class="bar"><i style:width="{Math.min(100, (words / goal) * 100)}%" class:done={words >= goal}></i></div>
				<span>{words >= goal ? "Goal reached!" : `${(goal - words).toLocaleString()} words to go`} · goal {goal.toLocaleString()}</span>
			</div>
		{/if}
		{#if headings.length}
			<ul>
				{#each headings as h, i (i)}
					<li in:fly={{ x: -6, duration: ms, delay: Math.min(i, 12) * 15, easing: cubicOut }}>
						<button class:is-on={current === h} style:padding-left="{10 + (h.level - top) * 14}px" onclick={() => jump(h)} title={h.title}>{h.title}</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="empty">No headings yet. Start a line with <code>#</code> to make one.</p>
		{/if}
		<p class="hint">{@html icon("lightbulb", 11)} Add <code>goal: 1000</code> to a note's properties for a word goal.</p>
	{/if}
</div>

<style>
	.outline {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 8px 16px;
	}
	.stats {
		display: flex;
		gap: 12px;
		padding: 4px 10px 10px;
		color: var(--muted);
		font-size: 11.5px;
	}
	.stats b {
		color: var(--text);
		font-weight: 600;
	}
	.goal {
		padding: 0 10px 12px;
		color: var(--muted);
		font-size: 11.5px;
	}
	.bar {
		height: 5px;
		margin-bottom: 5px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--hover);
	}
	.bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--accent);
		transition: width var(--dur) var(--ease);
	}
	.bar i.done {
		background: #5fb878;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li button {
		display: block;
		width: 100%;
		padding: 5px 10px;
		overflow: hidden;
		border: 0;
		border-left: 2px solid transparent;
		border-radius: 0 var(--radius) var(--radius) 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 13px;
		text-align: left;
		white-space: nowrap;
		text-overflow: ellipsis;
		cursor: pointer;
		transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	li button:hover {
		background: var(--hover);
		color: var(--text);
	}
	li button.is-on {
		border-left-color: var(--accent);
		color: var(--text);
		font-weight: 600;
	}
	.empty,
	.hint {
		padding: 6px 10px;
		color: var(--muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.hint {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-top: 12px;
	}
	code {
		font: 11px var(--font-code);
	}
</style>
