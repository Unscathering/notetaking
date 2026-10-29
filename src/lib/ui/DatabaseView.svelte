<script lang="ts">
	// A folder as a database: its notes as rows, their properties as columns.
	// Table (edit cells in place, sort by a column), gallery (cards), or board
	// (cards grouped by a property; drag one to another group to change it).
	// Everything is written back into each note's properties.
	import { fade } from "svelte/transition";
	import { noteTitle } from "../cave";
	import { isBoardText } from "../board";
	import { readProps, writeProps, type NoteProps } from "../notes";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { folder, ms }: { folder: string; ms: number } = $props();

	const KEY = $derived(`basalt.db.${ws.cave?.id ?? ""}.${folder}`);
	function settings() {
		try {
			return { mode: "table", sort: "", desc: false, hidden: [] as string[], extra: [] as string[], groupBy: "status", ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as object) };
		} catch {
			return { mode: "table", sort: "", desc: false, hidden: [] as string[], extra: [] as string[], groupBy: "status" };
		}
	}
	let view = $state(settings());
	$effect(() => {
		try {
			localStorage.setItem(KEY, JSON.stringify(view));
		} catch {
			// Not remembered this time.
		}
	});

	let filter = $state("");
	let editing = $state<{ path: string; key: string } | null>(null);
	let draft = $state("");

	interface Row {
		path: string;
		name: string;
		props: NoteProps;
		/** Every property as text, by name; "description" and "tags" included. */
		values: Record<string, string>;
	}

	const rows = $derived.by(() => {
		const out: Row[] = [];
		for (const path of ws.files) {
			if (!(path.startsWith(`${folder}/`) || folder === "") || path.startsWith("Templates/")) continue;
			const text = ws.texts.get(path) ?? "";
			if (isBoardText(text)) continue;
			const props = readProps(text);
			const values: Record<string, string> = { ...props.other };
			if (props.description) values.description = props.description;
			if (props.tags.length) values.tags = props.tags.join(", ");
			out.push({ path, name: noteTitle(path), props, values });
		}
		return out;
	});

	/** Columns: every property used, most used first, plus any you added. */
	const columns = $derived.by(() => {
		const count = new Map<string, number>();
		for (const r of rows) for (const k of Object.keys(r.values)) if (k !== "basalt" && k !== "banner" && k !== "cssclass") count.set(k, (count.get(k) ?? 0) + 1);
		for (const k of view.extra) if (!count.has(k)) count.set(k, 0);
		const order = (k: string) => (k === "description" ? -2 : k === "tags" ? -1 : 0);
		return [...count].sort((a, b) => order(a[0]) - order(b[0]) || b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
	});
	const shown = $derived(columns.filter((c) => !view.hidden.includes(c)));

	const list = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		let out = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || Object.values(r.values).some((v) => v.toLowerCase().includes(q)));
		if (view.sort) {
			const key = (r: Row) => (view.sort === "name" ? r.name : (r.values[view.sort] ?? "")).toLowerCase();
			// Notes without a value go last, whichever way it's sorted.
			out = [...out].sort((a, b) => (!key(a) ? 1 : 0) - (!key(b) ? 1 : 0) || key(a).localeCompare(key(b), undefined, { numeric: true }) * (view.desc ? -1 : 1));
		}
		return out;
	});

	/** Board groups: each value of the grouping property, and one for notes without it. */
	const groups = $derived.by(() => {
		const by = new Map<string, Row[]>();
		for (const r of list) {
			const v = r.values[view.groupBy]?.trim() || "";
			by.set(v, [...(by.get(v) ?? []), r]);
		}
		return [...by].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
	});

	function sortBy(key: string) {
		if (view.sort === key) view.desc = !view.desc;
		else {
			view.sort = key;
			view.desc = false;
		}
	}

	/** Writes one property of one note. An empty value removes it. */
	async function set(path: string, key: string, value: string) {
		const text = ws.texts.get(path) ?? "";
		const props = readProps(text);
		const v = value.trim();
		if (key === "description") props.description = v || undefined;
		else if (key === "tags") props.tags = v.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
		else if (v) props.other[key] = v;
		else delete props.other[key];
		const next = writeProps(text, props);
		if (next !== text) await ws.writeNote(path, next);
	}

	function startEdit(path: string, key: string, value: string) {
		editing = { path, key };
		draft = value;
	}

	async function finishEdit() {
		const e = editing;
		editing = null;
		if (e) await set(e.path, e.key, draft);
	}

	function addColumn() {
		const name = prompt("Name of the new column (a property, like status, due or rating):")?.trim().toLowerCase().replace(/[^\w-]+/g, "-");
		if (name && !columns.includes(name)) view.extra = [...view.extra, name];
	}

	async function newRow() {
		const path = await ws.newNote(folder, "Untitled");
		if (path && view.mode === "board" && dragGroup) await set(path, view.groupBy, dragGroup);
	}

	// Board: drag a card to another group.
	let dragging = $state<string | null>(null);
	let dragGroup = $state<string | null>(null);
	async function drop(group: string) {
		const path = dragging;
		dragging = null;
		dragGroup = null;
		if (path) await set(path, view.groupBy, group);
	}

	const banner = (r: Row) => r.props.banner;
</script>

<div class="db">
	<header>
		<div class="title">
			<span class="ico">{@html icon("table", 18)}</span>
			<div>
				<h1>{folder || "All notes"}</h1>
				<p>{list.length} {list.length === 1 ? "note" : "notes"}{filter ? ` matching “${filter}”` : ""}</p>
			</div>
		</div>
		<div class="tools">
			<div class="modes">
				{#each [["table", "Table", "table"], ["gallery", "Gallery", "layout"], ["board", "Board", "board"]] as [id, label, ico] (id)}
					<button class:is-on={view.mode === id} onclick={() => (view.mode = id)}>{@html icon(ico as "table", 14)} {label}</button>
				{/each}
			</div>
			<input class="filter" bind:value={filter} placeholder="Filter…" onkeydown={(e) => e.stopPropagation()} />
			<button class="primary" onclick={newRow}>{@html icon("plus", 14)} New</button>
		</div>
	</header>

	{#if view.mode === "board"}
		<div class="group-pick">
			Group by
			<select bind:value={view.groupBy}>
				{#each columns.filter((c) => c !== "description" && c !== "tags") as c (c)}<option value={c}>{c}</option>{/each}
				{#if !columns.includes(view.groupBy)}<option value={view.groupBy}>{view.groupBy}</option>{/if}
			</select>
		</div>
	{/if}

	<div class="body" in:fade={{ duration: ms }}>
		{#if view.mode === "table"}
			<table>
				<thead>
					<tr>
						<th><button onclick={() => sortBy("name")}>Name {view.sort === "name" ? (view.desc ? "↓" : "↑") : ""}</button></th>
						{#each shown as c (c)}
							<th>
								<button onclick={() => sortBy(c)}>{c} {view.sort === c ? (view.desc ? "↓" : "↑") : ""}</button>
								<button class="hide" title="Hide this column" onclick={() => (view.hidden = [...view.hidden, c])}>{@html icon("x", 11)}</button>
							</th>
						{/each}
						<th class="add"><button onclick={addColumn} title="Add a column">{@html icon("plus", 13)}</button></th>
					</tr>
				</thead>
				<tbody>
					{#each list as r (r.path)}
						<tr>
							<td class="name"><button onclick={() => ws.open(r.path)}>{@html icon("file", 13)} {r.name}</button></td>
							{#each shown as c (c)}
								<td class="cell" onclick={() => editing?.path !== r.path || editing?.key !== c ? startEdit(r.path, c, r.values[c] ?? "") : null}>
									{#if editing?.path === r.path && editing?.key === c}
										<!-- svelte-ignore a11y_autofocus -->
										<input bind:value={draft} autofocus onblur={finishEdit} onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") void finishEdit(); if (e.key === "Escape") editing = null; }} />
									{:else if c === "tags"}
										{#each r.props.tags as t (t)}<span class="tag">#{t}</span>{/each}
									{:else}
										{r.values[c] ?? ""}
									{/if}
								</td>
							{/each}
							<td></td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if view.hidden.length}
				<p class="hidden">Hidden: {#each view.hidden as h (h)}<button onclick={() => (view.hidden = view.hidden.filter((x) => x !== h))}>{h} {@html icon("eye", 11)}</button>{/each}</p>
			{/if}
		{:else if view.mode === "gallery"}
			<div class="gallery">
				{#each list as r (r.path)}
					<button class="card" onclick={() => ws.open(r.path)}>
						{#if banner(r)}<span class="cover" style:background-image="url({banner(r)})"></span>{/if}
						<b>{r.name}</b>
						{#if r.props.description}<span class="desc">{r.props.description}</span>{/if}
						<span class="meta">
							{#each shown.filter((c) => c !== "description" && c !== "tags" && r.values[c]).slice(0, 3) as c (c)}<span class="pill">{c}: {r.values[c]}</span>{/each}
							{#each r.props.tags.slice(0, 3) as t (t)}<span class="tag">#{t}</span>{/each}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<div class="board">
				{#each groups as [group, items] (group)}
					<div class="col" class:is-target={dragGroup === group && dragging} role="group" aria-label={group || "None"} ondragover={(e) => { e.preventDefault(); dragGroup = group; }} ondrop={(e) => { e.preventDefault(); void drop(group); }}>
						<div class="col-head"><b>{group || `No ${view.groupBy}`}</b><span>{items.length}</span></div>
						{#each items as r (r.path)}
							<button class="card" draggable="true" ondragstart={(e) => { dragging = r.path; e.dataTransfer?.setData("text/plain", r.path); }} ondragend={() => { dragging = null; dragGroup = null; }} onclick={() => ws.open(r.path)} class:is-dragging={dragging === r.path}>
								<b>{r.name}</b>
								{#if r.props.description}<span class="desc">{r.props.description}</span>{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
			<p class="hidden">Drag a card to another column to change its {view.groupBy}.</p>
		{/if}
	</div>
</div>

<style>
	.db {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		padding: 22px 26px 0;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ico {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--accent);
	}
	h1 {
		margin: 0;
		color: var(--heading);
		font-family: var(--font-heading);
		font-size: 22px;
	}
	header p {
		margin: 2px 0 0;
		color: var(--muted);
		font-size: 12.5px;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.modes {
		display: flex;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.modes button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border: 0;
		border-radius: calc(var(--radius) * 0.7);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.modes button.is-on {
		background: var(--accent-soft);
		color: var(--text);
	}
	.filter {
		width: 160px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
	}
	.filter:focus {
		border-color: var(--accent);
	}
	.primary {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 7px 12px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.group-pick {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
		color: var(--muted);
		font-size: 12.5px;
	}
	.group-pick select {
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text);
		font: inherit;
	}
	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding-bottom: 24px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 0;
		border-bottom: 1px solid var(--border);
		background: var(--surface-panel);
		text-align: left;
		white-space: nowrap;
	}
	th button {
		padding: 8px 10px;
		border: 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 11.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
	}
	th .hide {
		padding: 4px;
		opacity: 0;
	}
	th:hover .hide {
		opacity: 1;
	}
	th.add button {
		display: inline-flex;
	}
	td {
		height: 36px;
		padding: 0 10px;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
		vertical-align: middle;
	}
	tr:hover td {
		background: color-mix(in srgb, var(--hover) 60%, transparent);
	}
	td.name button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	td.name button:hover {
		color: var(--link);
	}
	td.cell {
		min-width: 110px;
		color: var(--text);
		cursor: text;
	}
	td input {
		width: 100%;
		padding: 5px 7px;
		border: 1px solid var(--accent);
		border-radius: calc(var(--radius) * 0.7);
		outline: 0;
		background: var(--bg);
		color: var(--text);
		font: inherit;
	}
	.tag {
		display: inline-block;
		margin: 1px 4px 1px 0;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 11.5px;
		font-weight: 600;
	}
	.pill {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--hover);
		font-size: 11px;
	}
	.hidden {
		color: var(--muted);
		font-size: 12px;
	}
	.hidden button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-left: 6px;
		padding: 2px 8px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 14px;
	}
	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		padding: 14px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		background: color-mix(in srgb, var(--raised) 60%, transparent);
		color: var(--text);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		transition: transform var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.card:hover {
		transform: translateY(-2px);
		border-color: var(--accent);
	}
	.cover {
		width: calc(100% + 28px);
		height: 90px;
		margin: -14px -14px 4px;
		background-position: center;
		background-size: cover;
	}
	.desc {
		color: var(--muted);
		font-size: 12.5px;
		line-height: 1.45;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: auto;
	}
	.board {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 100%;
	}
	.col {
		display: flex;
		flex: 0 0 250px;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		border: 1px solid transparent;
		border-radius: calc(var(--radius) * 1.2);
		background: color-mix(in srgb, var(--raised) 35%, transparent);
		transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.col.is-target {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.col-head {
		display: flex;
		justify-content: space-between;
		padding: 2px 4px;
		font-size: 12.5px;
		text-transform: capitalize;
	}
	.col-head span {
		color: var(--muted);
	}
	.col .card {
		width: 100%;
		cursor: grab;
	}
	.card.is-dragging {
		opacity: 0.4;
	}
</style>
