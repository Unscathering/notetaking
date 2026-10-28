<script lang="ts">
	// A card's details: title, color, tags, due date, description and checklist.
	// Every change saves straight away.
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { CARD_COLORS, type Board, type Card } from "../board";
	import { icon } from "./icons";

	interface Props {
		card: Card;
		columns: Array<{ id: string; name: string }>;
		column: string;
		ms: number;
		onchange: (fn: (c: Card, b: Board) => void) => void;
		onmove: (to: string) => void;
		ondelete: () => void;
		onclose: () => void;
	}
	let { card, columns, column, ms, onchange, onmove, ondelete, onclose }: Props = $props();

	let tagDraft = $state("");
	let itemDraft = $state("");
	const done = $derived(card.checklist.filter((i) => i.done).length);

	const grow = (node: HTMLTextAreaElement) => {
		const fit = () => {
			node.style.height = "auto";
			node.style.height = `${node.scrollHeight + 2}px`;
		};
		fit();
		node.addEventListener("input", fit);
	};
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="scrim" transition:fade={{ duration: ms }} onclick={onclose} role="presentation"></div>
<div class="dialog" transition:fly={{ y: 16, duration: ms, easing: cubicOut }} role="dialog" aria-label="Card">
	{#if card.color}<div class="cover" style:background={CARD_COLORS[card.color] ?? card.color}></div>{/if}
	<div class="body">
		<header>
			<button class="check" class:is-on={card.done} onclick={() => onchange((c) => (c.done = !c.done))} title={card.done ? "Mark as not done" : "Mark as done"}>{@html icon("check", 14)}</button>
			<textarea class="title" rows="1" value={card.title} use:grow onkeydown={(e) => { if (e.key === "Escape") return onclose();
						e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} onblur={(e) => { const t = e.currentTarget.value.trim(); if (t && t !== card.title) onchange((c) => (c.title = t)); }}></textarea>
			<button class="icon" onclick={onclose} title="Close (Esc)">{@html icon("x")}</button>
		</header>
		<p class="where">
			In list
			<select value={column} onchange={(e) => onmove(e.currentTarget.value)}>
				{#each columns as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
			</select>
		</p>

		<div class="grid">
			<section>
				<h3>Color</h3>
				<div class="swatches">
					<button class="swatch none" class:is-on={!card.color} onclick={() => onchange((c) => (c.color = undefined))} title="No color">{@html icon("x", 12)}</button>
					{#each Object.entries(CARD_COLORS) as [name, hex] (name)}
						<button class="swatch" class:is-on={card.color === name} style:background={hex} onclick={() => onchange((c) => (c.color = name))} title={name}></button>
					{/each}
				</div>
			</section>
			<section>
				<h3>Due date</h3>
				<div class="due">
					<input type="date" value={card.due ?? ""} onchange={(e) => onchange((c) => (c.due = e.currentTarget.value || undefined))} />
					{#if card.due}<button class="icon" onclick={() => onchange((c) => (c.due = undefined))} title="Remove the date">{@html icon("x", 14)}</button>{/if}
				</div>
			</section>
		</div>

		<section>
			<h3>Tags</h3>
			<div class="tags">
				{#each card.tags as t (t)}
					<span class="tag">#{t}<button onclick={() => onchange((c) => (c.tags = c.tags.filter((x) => x !== t)))} title="Remove">×</button></span>
				{/each}
				<input
					class="tag-add"
					placeholder="+ tag"
					bind:value={tagDraft}
					onkeydown={(e) => {
						if (e.key === "Escape") return onclose();
						e.stopPropagation();
						if (e.key !== "Enter" && e.key !== " " && e.key !== ",") return;
						e.preventDefault();
						const t = tagDraft.trim().replace(/^#/, "").toLowerCase();
						if (t && !card.tags.includes(t)) onchange((c) => c.tags.push(t));
						tagDraft = "";
					}}
				/>
			</div>
		</section>

		<section>
			<h3>Description</h3>
			<textarea class="desc" placeholder="Add more detail…" value={card.description} use:grow onkeydown={(e) => (e.key === "Escape" ? onclose() : e.stopPropagation())} onblur={(e) => { const d = e.currentTarget.value; if (d !== card.description) onchange((c) => (c.description = d)); }}></textarea>
		</section>

		<section>
			<h3>Checklist {#if card.checklist.length}<span class="progress-label">{done}/{card.checklist.length}</span>{/if}</h3>
			{#if card.checklist.length}
				<div class="bar"><span style:width="{(done / card.checklist.length) * 100}%"></span></div>
			{/if}
			<ul class="checklist">
				{#each card.checklist as item, i (i)}
					<li>
						<button class="box" class:is-on={item.done} onclick={() => onchange((c) => (c.checklist[i].done = !c.checklist[i].done))}>{@html icon("check", 12)}</button>
						<input class:is-done={item.done} value={item.text} onkeydown={(e) => (e.key === "Escape" ? onclose() : e.stopPropagation())} onblur={(e) => { const t = e.currentTarget.value.trim(); if (t !== item.text) onchange((c) => (t ? (c.checklist[i].text = t) : c.checklist.splice(i, 1))); }} />
						<button class="icon" onclick={() => onchange((c) => c.checklist.splice(i, 1))} title="Remove">{@html icon("x", 13)}</button>
					</li>
				{/each}
			</ul>
			<input
				class="item-add"
				placeholder="Add an item…"
				bind:value={itemDraft}
				onkeydown={(e) => {
					if (e.key === "Escape") return onclose();
						e.stopPropagation();
					if (e.key !== "Enter") return;
					const t = itemDraft.trim();
					if (t) onchange((c) => c.checklist.push({ text: t, done: false }));
					itemDraft = "";
				}}
			/>
		</section>

		<footer>
			<button class="danger" onclick={() => confirm("Delete this card?") && ondelete()}>{@html icon("trash", 14)} Delete card</button>
		</footer>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: color-mix(in srgb, black 45%, transparent);
	}
	.dialog {
		position: fixed;
		top: 7vh;
		left: 50%;
		z-index: 71;
		width: min(600px, calc(100vw - 32px));
		max-height: 86vh;
		translate: -50% 0;
		overflow-y: auto;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--glass-edge), 0 30px 80px rgba(0, 0, 0, 0.45);
	}
	.cover {
		height: 54px;
	}
	.body {
		padding: 18px 22px 20px;
	}
	header {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}
	.check,
	.box {
		display: inline-flex;
		flex: none;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--muted);
		border-radius: 50%;
		background: transparent;
		color: transparent;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.check {
		width: 24px;
		height: 24px;
		margin-top: 4px;
	}
	.check.is-on,
	.box.is-on {
		border-color: #5fb878;
		background: #5fb878;
		color: white;
	}
	.title {
		flex: 1;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: calc(var(--radius) * 0.7);
		outline: 0;
		background: transparent;
		color: var(--heading);
		font: 650 20px/1.35 var(--font-ui);
		resize: none;
	}
	.title:focus {
		border-color: var(--accent);
		background: var(--bg);
	}
	.where {
		margin: 4px 0 16px 34px;
		color: var(--muted);
		font-size: 13px;
	}
	select,
	input[type="date"] {
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.7);
		background: var(--raised);
		color: var(--text);
		font: inherit;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 16px;
	}
	section {
		margin: 0 0 18px;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 8px;
		color: var(--muted);
		font-size: 11.5px;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.progress-label {
		letter-spacing: 0;
	}
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.swatch {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: 2px solid transparent;
		border-radius: 7px;
		cursor: pointer;
		transition: transform var(--dur) var(--ease);
	}
	.swatch:hover {
		transform: scale(1.1);
	}
	.swatch.is-on {
		border-color: var(--text);
	}
	.swatch.none {
		background: var(--raised);
		color: var(--muted);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	.due {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 12.5px;
		font-weight: 650;
	}
	.tag button {
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
		opacity: 0.6;
	}
	.tag-add,
	.item-add {
		padding: 5px 10px;
		border: 1px dashed var(--border);
		border-radius: 999px;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
	}
	.item-add {
		width: 100%;
		border-radius: var(--radius);
	}
	.tag-add:focus,
	.item-add:focus {
		border-color: var(--accent);
	}
	.desc {
		width: 100%;
		min-height: 80px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		outline: 0;
		background: var(--bg);
		color: var(--text);
		font: 14px/1.55 var(--font-editor);
		resize: none;
	}
	.desc:focus {
		border-color: var(--accent);
	}
	.bar {
		height: 6px;
		margin-bottom: 8px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--hover);
	}
	.bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: #5fb878;
		transition: width var(--dur) var(--ease);
	}
	.checklist {
		margin: 0 0 8px;
		padding: 0;
		list-style: none;
	}
	.checklist li {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 0;
	}
	.box {
		width: 18px;
		height: 18px;
		border-radius: 5px;
	}
	.checklist input {
		flex: 1;
		padding: 4px 6px;
		border: 1px solid transparent;
		border-radius: calc(var(--radius) * 0.6);
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
	}
	.checklist input:focus {
		border-color: var(--border);
		background: var(--bg);
	}
	.checklist input.is-done {
		color: var(--muted);
		text-decoration: line-through;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 6px;
		border-top: 1px solid var(--border);
	}
	.danger {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		padding: 7px 12px;
		border: 0;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 16%, transparent);
		color: #f07a7a;
		font: inherit;
		cursor: pointer;
	}
	.icon {
		display: inline-flex;
		padding: 5px;
		border: 0;
		border-radius: calc(var(--radius) * 0.6);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.icon:hover {
		background: var(--hover);
		color: var(--text);
	}
</style>
