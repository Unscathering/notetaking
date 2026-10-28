<script lang="ts">
	// A board, like Trello: lists of cards you drag between and within lists.
	// Every change is written straight back to the board's Markdown file.
	import { flip } from "svelte/animate";
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { CARD_COLORS, blankCard, parseBoard, serializeBoard, type Board, type Card } from "../board";
	import { noteTitle } from "../cave";
	import { ws } from "../workspace.svelte";
	import { showMenu } from "./ContextMenu.svelte";
	import CardDialog from "./CardDialog.svelte";
	import { icon } from "./icons";

	let { path, ms }: { path: string; ms: number } = $props();

	const board = $derived(parseBoard(ws.texts.get(path) ?? ""));
	const description = $derived(ws.props.get(path)?.description);

	/** Changes a copy of the board and saves it. */
	function change(fn: (b: Board) => void) {
		const copy = structuredClone($state.snapshot(board)) as Board;
		fn(copy);
		ws.edited(path, serializeBoard(copy));
	}

	// ---- Adding and editing ----
	let adding: string | null = $state(null);
	let draft = $state("");
	let renamingCol: string | null = $state(null);
	/** The card whose details are open, by list and position (titles can change). */
	let openCard = $state<{ col: number; index: number } | null>(null);
	let addingList = $state(false);
	let listDraft = $state("");

	function addCard(colId: string) {
		const title = draft.trim();
		if (!title) return;
		change((b) => b.columns.find((c) => c.id === colId)?.cards.push(blankCard(title)));
		draft = "";
	}

	function addList() {
		const name = listDraft.trim();
		if (!name) return;
		change((b) => b.columns.push({ id: `new:${name}`, name, cards: [] }));
		listDraft = "";
	}

	function columnMenu(e: MouseEvent, colId: string) {
		showMenu(e, [
			{ label: "Add a card", icon: "plus", run: () => ((adding = colId), (draft = "")) },
			{ label: "Rename list", icon: "pencil", run: () => (renamingCol = colId) },
			{ label: "-" },
			{ label: "Delete list", icon: "trash", danger: true, run: () => confirm("Delete this list and its cards?") && change((b) => (b.columns = b.columns.filter((c) => c.id !== colId))) },
		]);
	}

	const today = new Date().toISOString().slice(0, 10);
	const dueLabel = (d: string) => new Date(`${d}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

	// ---- Dragging (cards and lists) ----
	interface Drag {
		kind: "card" | "column";
		id: string;
		from: string;
		x: number;
		y: number;
		dx: number;
		dy: number;
		w: number;
		h: number;
		overCol: string;
		overIndex: number;
		started: boolean;
	}
	let drag: Drag | null = $state(null);
	let boardEl: HTMLDivElement | undefined = $state();
	let downAt = { x: 0, y: 0 };

	function pointerDown(e: PointerEvent, kind: Drag["kind"], id: string, from: string) {
		if (e.button !== 0 || (e.target as HTMLElement).closest("input, textarea, .no-drag")) return;
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		downAt = { x: e.clientX, y: e.clientY };
		drag = { kind, id, from, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, overCol: from, overIndex: -1, started: false };
		window.addEventListener("pointermove", pointerMove);
		window.addEventListener("pointerup", pointerUp, { once: true });
	}

	function pointerMove(e: PointerEvent) {
		if (!drag || !boardEl) return;
		if (!drag.started && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) return;
		drag.started = true;
		drag.x = e.clientX;
		drag.y = e.clientY;
		// Scroll the board when dragging near its edges.
		const br = boardEl.getBoundingClientRect();
		if (e.clientX > br.right - 60) boardEl.scrollLeft += 14;
		else if (e.clientX < br.left + 60) boardEl.scrollLeft -= 14;
		const cols = [...boardEl.querySelectorAll<HTMLElement>("[data-col]")];
		if (drag.kind === "column") {
			let index = cols.length;
			cols.forEach((el, i) => {
				const r = el.getBoundingClientRect();
				if (index === cols.length && e.clientX < r.left + r.width / 2) index = i;
			});
			drag.overIndex = index;
			return;
		}
		// Which list is under the pointer, and where in it.
		const col = cols.find((el) => {
			const r = el.getBoundingClientRect();
			return e.clientX >= r.left - 6 && e.clientX <= r.right + 6;
		});
		if (!col) return;
		drag.overCol = col.dataset.col!;
		const cards = [...col.querySelectorAll<HTMLElement>("[data-card]")].filter((el) => el.dataset.card !== drag!.id);
		let index = cards.length;
		cards.forEach((el, i) => {
			const r = el.getBoundingClientRect();
			if (index === cards.length && e.clientY < r.top + r.height / 2) index = i;
		});
		drag.overIndex = index;
	}

	function pointerUp() {
		window.removeEventListener("pointermove", pointerMove);
		const d = drag;
		drag = null;
		if (!d || !d.started || d.overIndex < 0) {
			if (d && !d.started && d.kind === "card") openAt(d.from, d.id);
			return;
		}
		change((b) => {
			if (d.kind === "column") {
				const i = b.columns.findIndex((c) => c.id === d.id);
				const [col] = b.columns.splice(i, 1);
				b.columns.splice(d.overIndex > i ? d.overIndex - 1 : d.overIndex, 0, col);
				return;
			}
			const from = b.columns.find((c) => c.id === d.from)!, to = b.columns.find((c) => c.id === d.overCol)!;
			const i = from.cards.findIndex((c) => c.id === d.id);
			const [card] = from.cards.splice(i, 1);
			to.cards.splice(d.overIndex, 0, card);
		});
	}

	const dragged = $derived.by(() => {
		if (!drag?.started) return null;
		const d = drag;
		if (d.kind === "column") return { column: board.columns.find((c) => c.id === d.id) };
		return { card: board.columns.find((c) => c.id === d.from)?.cards.find((c) => c.id === d.id) };
	});

	function openAt(colId: string, cardId: string) {
		const col = board.columns.findIndex((c) => c.id === colId);
		const index = board.columns[col]?.cards.findIndex((c) => c.id === cardId) ?? -1;
		if (index >= 0) openCard = { col, index };
	}

	const dialogCard = $derived(openCard ? board.columns[openCard.col]?.cards[openCard.index] : undefined);

	function editCard(fn: (c: Card, b: Board) => void) {
		const o = openCard;
		if (!o) return;
		change((b) => {
			const card = b.columns[o.col]?.cards[o.index];
			if (card) fn(card, b);
		});
	}

	const focus = (node: HTMLElement) => node.focus();
</script>

{#snippet face(card: Card)}
	{#if card.color}<span class="cover" style:background={CARD_COLORS[card.color] ?? card.color}></span>{/if}
	{#if card.tags.length}
		<span class="labels">{#each card.tags as t (t)}<span class="label">#{t}</span>{/each}</span>
	{/if}
	<span class="title" class:is-done={card.done}>{card.title}</span>
	{#if card.due || card.description || card.checklist.length || card.done}
		<span class="badges">
			{#if card.done}<span class="badge done">{@html icon("check", 13)} Done</span>{/if}
			{#if card.due}<span class="badge" class:late={!card.done && card.due < today} class:soon={!card.done && card.due === today}>{@html icon("calendar", 13)} {dueLabel(card.due)}</span>{/if}
			{#if card.description}<span class="badge" title="Has a description">{@html icon("files", 13)}</span>{/if}
			{#if card.checklist.length}
				{@const n = card.checklist.filter((i) => i.done).length}
				<span class="badge" class:complete={n === card.checklist.length}>{@html icon("check", 13)} {n}/{card.checklist.length}</span>
			{/if}
		</span>
	{/if}
{/snippet}

<div class="board-page">
	<header class="board-head">
		<span class="board-icon">{@html icon("board", 20)}</span>
		<div>
			<h1>{noteTitle(path)}</h1>
			{#if description}<p>{description}</p>{/if}
		</div>
		<button class="ghost" onclick={() => ws.showRaw(path)} title="Edit this board as Markdown">{@html icon("pencil", 14)} Markdown</button>
	</header>

	<div class="board" bind:this={boardEl} class:is-dragging={drag?.started}>
		{#each board.columns as col, ci (col.id)}
			<section
				class="column"
				class:is-lifted={drag?.started && drag.kind === "column" && drag.id === col.id}
				style:margin-left={drag?.started && drag.kind === "column" && drag.overIndex === ci && drag.id !== col.id ? `${drag.w + 12}px` : null}
				data-col={col.id}
				animate:flip={{ duration: ms }}
			>
				<header class="col-head" onpointerdown={(e) => pointerDown(e, "column", col.id, col.id)} oncontextmenu={(e) => columnMenu(e, col.id)} role="presentation">
					{#if renamingCol === col.id}
						<input
							class="col-name-input"
							value={col.name}
							use:focus
							onkeydown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") e.currentTarget.blur();
								if (e.key === "Escape") renamingCol = null;
							}}
							onblur={(e) => {
								const name = e.currentTarget.value.trim();
								renamingCol = null;
								if (name && name !== col.name) change((b) => (b.columns[ci].name = name));
							}}
						/>
					{:else}
						<h2 ondblclick={() => (renamingCol = col.id)}>{col.name}</h2>
					{/if}
					<span class="count">{col.cards.length}</span>
					<button class="icon no-drag" onclick={(e) => columnMenu(e, col.id)} title="List actions">{@html icon("grip", 14)}</button>
				</header>

				<div class="cards">
					{#each col.cards as card, i (card.id)}
						{@const vi = col.cards.slice(0, i).filter((c) => c.id !== drag?.id).length}
						<div class="slot" class:is-lifted={drag?.started && drag.kind === "card" && drag.id === card.id} animate:flip={{ duration: ms }} in:fly={{ y: 8, duration: ms, easing: cubicOut }}>
							{#if drag?.started && drag.kind === "card" && drag.overCol === col.id && drag.overIndex === vi && card.id !== drag.id}
								<div class="gap" style:height="{drag.h}px"></div>
							{/if}
							<button
								class="card"
								data-card={card.id}
								onpointerdown={(e) => pointerDown(e, "card", card.id, col.id)}
								onkeydown={(e) => e.key === "Enter" && openAt(col.id, card.id)}
							>
								{@render face(card)}
							</button>
						</div>
					{/each}
					{#if drag?.started && drag.kind === "card" && drag.overCol === col.id && drag.overIndex >= col.cards.filter((c) => c.id !== drag?.id).length}
						<div class="gap" style:height="{drag.h}px"></div>
					{/if}
				</div>

				{#if adding === col.id}
					<div class="adder" in:fly={{ y: -4, duration: ms }}>
						<textarea
							bind:value={draft}
							use:focus
							rows="2"
							placeholder="Card title…"
							onkeydown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									addCard(col.id);
								} else if (e.key === "Escape") adding = null;
							}}
							onblur={() => {
								addCard(col.id);
								adding = null;
							}}
						></textarea>
						<div class="adder-row">
							<button class="primary" onmousedown={(e) => { e.preventDefault(); addCard(col.id); }}>Add card</button>
							<button class="icon" onclick={() => (adding = null)} title="Cancel">{@html icon("x")}</button>
						</div>
					</div>
				{:else}
					<button class="add-card" onclick={() => ((adding = col.id), (draft = ""))}>{@html icon("plus", 14)} Add a card</button>
				{/if}
			</section>
		{/each}
		{#if drag?.started && drag.kind === "column" && drag.overIndex === board.columns.length}
			<div class="col-gap" style:width="{drag.w}px"></div>
		{/if}

		<section class="column new-list">
			{#if addingList}
				<input
					class="col-name-input"
					bind:value={listDraft}
					use:focus
					placeholder="List name…"
					onkeydown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") addList();
						if (e.key === "Escape") addingList = false;
					}}
					onblur={() => {
						addList();
						addingList = false;
					}}
				/>
			{:else}
				<button class="add-card" onclick={() => (addingList = true)}>{@html icon("plus", 14)} Add another list</button>
			{/if}
		</section>
	</div>
</div>

{#if dragged?.card && drag}
	<div class="card floating" style:left="{drag.x - drag.dx}px" style:top="{drag.y - drag.dy}px" style:width="{drag.w}px">
		{@render face(dragged.card)}
	</div>
{:else if dragged?.column && drag}
	<div class="column floating" style:left="{drag.x - drag.dx}px" style:top="{drag.y - drag.dy}px" style:width="{drag.w}px">
		<header class="col-head"><h2>{dragged.column.name}</h2><span class="count">{dragged.column.cards.length}</span></header>
		<div class="cards">
			{#each dragged.column.cards.slice(0, 6) as card (card.id)}<div class="card">{@render face(card)}</div>{/each}
		</div>
	</div>
{/if}

{#if openCard && dialogCard}
	<CardDialog
		card={dialogCard}
		columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
		column={board.columns[openCard.col].id}
		{ms}
		onchange={editCard}
		onmove={(to) => {
			const o = openCard;
			const target = board.columns.findIndex((c) => c.id === to);
			if (!o || target < 0 || target === o.col) return;
			change((b) => {
				const [card] = b.columns[o.col].cards.splice(o.index, 1);
				b.columns[target].cards.push(card);
			});
			openCard = { col: target, index: board.columns[target].cards.length };
		}}
		ondelete={() => {
			const o = openCard;
			openCard = null;
			if (o) change((b) => b.columns[o.col].cards.splice(o.index, 1));
		}}
		onclose={() => (openCard = null)}
	/>
{/if}

<style>
	.board-page {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	.board-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: calc(20px * var(--density)) 28px 12px;
	}
	.board-icon {
		display: inline-flex;
		padding: 8px;
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--accent);
	}
	.board-head div {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		color: var(--heading);
		font-size: 22px;
		letter-spacing: -0.01em;
	}
	.board-head p {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 13.5px;
	}
	.board {
		display: flex;
		flex: 1;
		align-items: flex-start;
		gap: 12px;
		min-height: 0;
		padding: 6px 28px 24px;
		overflow-x: auto;
	}
	.board.is-dragging {
		cursor: grabbing;
		user-select: none;
	}
	.column {
		display: flex;
		flex: 0 0 280px;
		flex-direction: column;
		max-height: 100%;
		padding: 8px;
		border-radius: calc(var(--radius) * 1.4);
		background: var(--part-list-bg, var(--panel));
		border: 1px solid var(--border);
		transition: opacity var(--dur) var(--ease);
	}
	.column.is-lifted {
		opacity: 0.25;
	}
	.col-gap {
		flex: 0 0 auto;
		align-self: stretch;
		border: 2px dashed var(--accent);
		border-radius: calc(var(--radius) * 1.4);
		opacity: 0.6;
	}
	.col-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 8px 6px;
		cursor: grab;
	}
	.col-head h2 {
		flex: 1;
		margin: 0;
		overflow: hidden;
		color: var(--heading);
		font-size: 14px;
		font-weight: 650;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.count {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--hover);
		color: var(--muted);
		font-size: 11.5px;
	}
	.col-name-input {
		flex: 1;
		width: 100%;
		padding: 5px 8px;
		border: 1px solid var(--accent);
		border-radius: calc(var(--radius) * 0.7);
		outline: 0;
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-weight: 600;
	}
	.cards {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 6px;
		overflow-y: auto;
		padding: 2px;
	}
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		padding: 10px 12px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--part-card-bg, var(--raised));
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
		transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.card:hover {
		border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
	}
	.card.floating {
		position: fixed;
		z-index: 80;
		pointer-events: none;
		transform: rotate(3deg) scale(1.03);
		box-shadow: 0 22px 40px rgba(0, 0, 0, 0.35);
		cursor: grabbing;
	}
	.column.floating {
		position: fixed;
		z-index: 80;
		pointer-events: none;
		transform: rotate(2deg);
		box-shadow: 0 26px 50px rgba(0, 0, 0, 0.4);
	}
	.slot {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.slot.is-lifted {
		display: none;
	}
	.column {
		transition: opacity var(--dur) var(--ease), margin-left var(--dur) var(--ease);
	}
	/* Where a dragged card will land. */
	.gap {
		flex: 0 0 auto;
		animation: open-gap var(--dur) var(--ease);
		border-radius: var(--radius);
		background: var(--accent-soft);
		border: 1.5px dashed color-mix(in srgb, var(--accent) 60%, transparent);
	}
	@keyframes open-gap {
		from {
			height: 0;
			opacity: 0;
		}
	}
	.cover {
		display: block;
		height: 6px;
		margin: -10px -12px 2px;
	}
	.labels {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.label {
		padding: 1px 8px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 11px;
		font-weight: 650;
	}
	.title {
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.title.is-done {
		color: var(--muted);
		text-decoration: line-through;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		color: var(--muted);
		font-size: 12px;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.badge.late {
		padding: 0 6px;
		border-radius: 4px;
		background: color-mix(in srgb, #e05d5d 22%, transparent);
		color: #f07a7a;
	}
	.badge.soon {
		padding: 0 6px;
		border-radius: 4px;
		background: color-mix(in srgb, #e5b84b 22%, transparent);
		color: #e5b84b;
	}
	.badge.complete,
	.badge.done {
		color: #5fb878;
	}
	.add-card {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		margin-top: 6px;
		padding: 8px 10px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.add-card:hover {
		background: var(--hover);
		color: var(--text);
	}
	.new-list {
		background: color-mix(in srgb, var(--panel) 55%, transparent);
		border-style: dashed;
	}
	.new-list .add-card {
		margin: 0;
	}
	.adder {
		margin-top: 8px;
	}
	.adder textarea {
		width: 100%;
		padding: 9px 11px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		outline: 0;
		background: var(--raised);
		color: var(--text);
		font: inherit;
		resize: none;
	}
	.adder-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}
	.primary {
		padding: 7px 14px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.ghost:hover {
		color: var(--text);
		background: var(--hover);
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
