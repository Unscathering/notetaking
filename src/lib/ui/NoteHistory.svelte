<script lang="ts">
	// A note's history: its earlier versions on the left, and on the right what
	// changed between the picked version and now. Restore puts it back (and
	// keeps the current text as a version first, so that can be undone too).
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { compareLines, versions, type Line, type Version } from "../history.svelte";
	import { noteTitle } from "../cave";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms, path }: { ms: number; path: string } = $props();

	let list = $state<Version[]>([]);
	let picked = $state(0);
	let note = $state("");

	const now = $derived(ws.texts.get(path) ?? "");
	// Newest first; the very newest that matches the note now isn't worth showing.
	const shown = $derived([...list].reverse().filter((v, i) => !(i === 0 && v.text === now)));
	const version = $derived(shown[picked]);
	const lines = $derived(version ? compareLines(version.text, now) : []);
	const stats = $derived({ added: lines.filter((l) => l.kind === "added").length, removed: lines.filter((l) => l.kind === "removed").length });

	$effect(() => {
		void versions(path).then((v) => (list = v));
	});

	/** Unchanged stretches longer than a few lines fold into "… 12 lines the same …". */
	const folded = $derived.by(() => {
		const out: Array<Line | { kind: "fold"; count: number }> = [];
		for (let i = 0; i < lines.length; ) {
			if (lines[i].kind !== "same") {
				out.push(lines[i++]);
				continue;
			}
			let j = i;
			while (j < lines.length && lines[j].kind === "same") j++;
			const run = lines.slice(i, j);
			if (run.length > 6) out.push(...run.slice(0, i === 0 ? 0 : 2), { kind: "fold", count: run.length - (i === 0 ? 0 : 2) - (j === lines.length ? 0 : 2) }, ...run.slice(j === lines.length ? run.length : -2));
			else out.push(...run);
			i = j;
		}
		return out;
	});

	function when(t: number) {
		const mins = Math.round((Date.now() - t) / 60_000);
		if (mins < 1) return "Just now";
		if (mins < 60) return `${mins} min ago`;
		const d = new Date(t);
		const today = new Date().toDateString() === d.toDateString();
		return today ? `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
	}

	async function restore() {
		if (!version) return;
		await ws.writeNote(path, version.text);
		note = "Restored. What it said a moment ago is kept in the history too.";
		list = await versions(path);
		picked = 0;
	}

	async function copy() {
		if (!version) return;
		await navigator.clipboard.writeText(version.text);
		note = "Copied this version's text.";
	}
</script>

<div class="scrim" transition:fade={{ duration: ms }} onclick={() => (ws.modal = null)} role="presentation"></div>
<div class="box" transition:fly={{ y: 12, duration: ms, easing: cubicOut }} role="dialog" aria-label="Note history">
	<header>
		<div>
			<h2>History of “{noteTitle(path)}”</h2>
			<p>A version is kept as you write (every few minutes) and before anything else changes the note. Pick one to see what's different now.</p>
		</div>
		<button class="close" onclick={() => (ws.modal = null)} title="Close (Esc)">{@html icon("x", 18)}</button>
	</header>
	<div class="cols">
		<ul class="list">
			<li class="now"><span><b>Now</b><small>The note as it is</small></span></li>
			{#each shown as v, i (v.when)}
				<li>
					<button class:is-on={i === picked} onclick={() => ((picked = i), (note = ""))}>
						<b>{when(v.when)}</b>
						<small>{v.why ?? `${v.text.split(/\s+/).filter(Boolean).length} words`}</small>
					</button>
				</li>
			{:else}
				<li class="empty">No earlier versions yet. They'll appear here as you write.</li>
			{/each}
		</ul>
		<div class="detail">
			{#if version}
				<div class="bar">
					<span class="stats"><span class="minus">−{stats.removed}</span> <span class="plus">+{stats.added}</span> lines changed since then</span>
					<button class="ghost" onclick={copy}>{@html icon("file", 13)} Copy</button>
					<button class="primary" onclick={restore}>{@html icon("undo", 13)} Restore this version</button>
				</div>
				{#if note}<p class="ok">{note}</p>{/if}
				<div class="diff">
					{#each folded as l, i (i)}
						{#if l.kind === "fold"}
							<div class="fold">… {l.count} {l.count === 1 ? "line" : "lines"} the same …</div>
						{:else}
							<div class="line {l.kind}"><span class="sign">{l.kind === "added" ? "+" : l.kind === "removed" ? "−" : ""}</span>{l.text || " "}</div>
						{/if}
					{/each}
					{#if !stats.added && !stats.removed}<p class="muted">Same as now.</p>{/if}
				</div>
				<p class="legend"><span class="minus">Red</span>: was there in this version, gone now. <span class="plus">Green</span>: written since.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: color-mix(in srgb, black 35%, transparent);
	}
	.box {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 51;
		display: flex;
		flex-direction: column;
		width: min(980px, calc(100vw - 32px));
		height: min(680px, calc(100vh - 48px));
		translate: -50% -50%;
		padding: 22px;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--glass-edge), 0 28px 70px rgba(0, 0, 0, 0.4);
		isolation: isolate;
	}
	header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}
	h2 {
		margin: 0;
		color: var(--heading);
		font-size: 18px;
	}
	header p {
		margin: 6px 0 14px;
		color: var(--muted);
		font-size: 13px;
	}
	.close {
		display: inline-flex;
		margin-left: auto;
		padding: 7px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.close:hover {
		background: var(--hover);
		color: var(--text);
	}
	.cols {
		flex: 1;
		display: grid;
		grid-template-columns: 230px 1fr;
		gap: 16px;
		min-height: 0;
	}
	ul {
		margin: 0;
		padding: 0 4px 0 0;
		overflow-y: auto;
		list-style: none;
		border-right: 1px solid var(--border);
	}
	li > button,
	li.now > span {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 8px 10px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	li.now > span {
		cursor: default;
		opacity: 0.7;
	}
	li > button:hover {
		background: var(--hover);
	}
	li > button.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	b {
		font-size: 13px;
		font-weight: 600;
	}
	small,
	.empty,
	.muted {
		color: var(--muted);
		font-size: 12px;
	}
	.empty {
		padding: 10px;
		line-height: 1.5;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		min-width: 0;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.stats {
		flex: 1;
		color: var(--muted);
		font-size: 12.5px;
	}
	.minus {
		color: #e05d5d;
		font-weight: 600;
	}
	.plus {
		color: #5fb878;
		font-weight: 600;
	}
	.diff {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: 8px 0;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--bg) 60%, transparent);
		font: 12.5px/1.6 var(--font-code);
	}
	.line {
		padding: 0 12px 0 6px;
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--muted);
	}
	.sign {
		display: inline-block;
		width: 16px;
		color: inherit;
		user-select: none;
	}
	.line.added {
		background: color-mix(in srgb, #5fb878 16%, transparent);
		color: var(--text);
	}
	.line.removed {
		background: color-mix(in srgb, #e05d5d 16%, transparent);
		color: var(--text);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, #e05d5d 60%, transparent);
	}
	.fold {
		padding: 2px 22px;
		color: var(--muted);
		font-family: var(--font-ui);
		font-size: 11.5px;
		font-style: italic;
	}
	.legend {
		margin: 0;
		color: var(--muted);
		font-size: 11.5px;
	}
	.ok {
		margin: 0;
		color: #5fb878;
		font-size: 12.5px;
	}
	button.ghost,
	button.primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	button.ghost {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
	button.primary {
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
</style>
