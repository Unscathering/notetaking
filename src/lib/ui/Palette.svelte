<script lang="ts">
	// The command palette (every action, with icons) and the note switcher.
	// Type to filter; arrow keys and Enter to pick.
	import { fly, fade } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { COMMANDS } from "../commands";
	import { noteTitle, parentOf } from "../cave";
	import { ws } from "../workspace.svelte";
	import { icon, type IconName } from "./icons";

	interface Props {
		mode: "palette" | "switcher";
		ms: number;
	}
	let { mode, ms }: Props = $props();

	interface Item {
		label: string;
		sub?: string;
		icon: IconName;
		keys?: string;
		run: () => unknown;
	}

	let query = $state("");
	let picked = $state(0);
	let input: HTMLInputElement | undefined = $state();

	/** Loose matching: every typed letter appears in order. Earlier and tighter matches rank higher. */
	function score(text: string, q: string): number {
		if (!q) return 1;
		const t = text.toLowerCase();
		const direct = t.indexOf(q);
		if (direct >= 0) return 100 - direct;
		let at = 0, gaps = 0;
		for (const ch of q) {
			const i = t.indexOf(ch, at);
			if (i < 0) return 0;
			gaps += i - at;
			at = i + 1;
		}
		return Math.max(1, 50 - gaps);
	}

	const items = $derived.by((): Item[] => {
		const q = query.trim().toLowerCase();
		const all: Item[] =
			mode === "palette"
				? COMMANDS.filter((c) => c.id !== "palette").map((c) => ({ label: c.label, icon: c.icon, keys: c.keys, run: c.run }))
				: ws.notes.map((p) => ({ label: noteTitle(p), sub: parentOf(p), icon: "file" as IconName, run: () => ws.open(p) }));
		return all
			.map((it) => ({ it, s: score(`${it.label} ${it.sub ?? ""}`, q) }))
			.filter((x) => x.s > 0)
			.sort((a, b) => b.s - a.s)
			.slice(0, 50)
			.map((x) => x.it);
	});

	$effect(() => {
		void query;
		picked = 0;
	});
	$effect(() => {
		input?.focus();
	});

	function choose(i: number) {
		const it = items[i];
		if (!it) return;
		ws.modal = null;
		void it.run();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (items.length) picked = (picked + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
		} else if (e.key === "Enter") {
			e.preventDefault();
			choose(picked);
		} else if (e.key === "Escape") {
			ws.modal = null;
		}
		e.stopPropagation();
	}
</script>

<div class="scrim" transition:fade={{ duration: ms }} onclick={() => (ws.modal = null)} role="presentation"></div>
<div class="palette" transition:fly={{ y: -12, duration: ms, easing: cubicOut }} role="dialog" aria-label={mode === "palette" ? "Command palette" : "Open a note"}>
	<div class="field">
		<span>{@html icon(mode === "palette" ? "command" : "search")}</span>
		<input bind:this={input} bind:value={query} {onkeydown} placeholder={mode === "palette" ? "Type a command…" : "Find a note…"} />
	</div>
	<ul>
		{#each items as it, i (it.label + (it.sub ?? ""))}
			<li>
				<button class:is-picked={i === picked} onmousemove={() => (picked = i)} onclick={() => choose(i)}>
					<span class="ico">{@html icon(it.icon)}</span>
					<span class="label">{it.label}</span>
					{#if it.sub}<span class="sub">{it.sub}</span>{/if}
					{#if it.keys}<kbd>{it.keys}</kbd>{/if}
				</button>
			</li>
		{:else}
			<li class="none">Nothing matches.</li>
		{/each}
	</ul>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: color-mix(in srgb, black 30%, transparent);
	}
	.palette {
		position: fixed;
		top: 12vh;
		left: 50%;
		z-index: 51;
		width: min(620px, calc(100vw - 32px));
		translate: -50% 0;
		overflow: hidden;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--glass-edge), 0 28px 70px rgba(0, 0, 0, 0.4);
	}
	.field {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		color: var(--muted);
	}
	.field span {
		display: inline-flex;
	}
	input,
	input:focus-visible {
		flex: 1;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 16px;
	}
	ul {
		max-height: min(420px, 60vh);
		margin: 0;
		padding: 6px;
		overflow-y: auto;
		list-style: none;
	}
	li button {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 9px 10px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	li button.is-picked {
		background: var(--accent-soft);
	}
	.ico {
		display: inline-flex;
		color: var(--accent);
	}
	.label {
		flex: 1;
	}
	.sub {
		color: var(--muted);
		font-size: 12.5px;
	}
	kbd {
		padding: 2px 6px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.5);
		color: var(--muted);
		font: 12px var(--font-ui);
	}
	.none {
		padding: 14px;
		color: var(--muted);
	}
</style>
