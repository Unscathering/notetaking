// Parts of a note that show other notes, live:
//
// - ```basalt blocks (see src/lib/query.ts): lists of notes, tasks, tags or
//   backlinks, as a list, cards, a table or a count. The building blocks of
//   dashboards. Tasks can be ticked right there.
// - Embeds: a line that is just ![[Note]] (or ![[Note#Heading]]) shows that
//   note (or that section of it) in place.
//
// Like tables, they turn back into their Markdown while the cursor is in
// them. They redraw when any note changes. Every part has a class
// (basalt-block, basalt-show-cards, basalt-card, basalt-embed, ...) for snippets.
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { markdown } from "../ai/markdown";
import { WIDGETS, type Row, type Spec } from "../query";
import { streak, type HabitDay } from "../habits";
import { editInPlace, widget, type WidgetHooks } from "./widgets";
import { groupRows } from "../query";
import { PIECES, addCard, addNote, editCard, hide, moveCard, order, pin, removeCard, showHidden, unpin } from "./blockEdit";
import { showMenu } from "../ui/ContextMenu.svelte";
import { icon, type IconName } from "../ui/icons";

export interface LiveHooks extends WidgetHooks {
	/** Runs a ```basalt block. */
	runBlock(source: string): { spec: Spec; rows: Row[] };
	/** An embedded note's text (or one heading's section of it), and its path. */
	embed(target: string): { path: string; text: string } | null;
	open(path: string): void;
	toggleTask(path: string, line: number): void;
	folderColor(folder: string): string | undefined;
	/** Every note's name, for picking notes into a list. */
	noteNames(): string[];
	/** The folder the note with the block is in. */
	folder(): string;
	/** The habit tracker's data: habits and the last `days` days. */
	habits(days: number): { list: string[]; days: HabitDay[] };
	/** Opens (making it if needed) the daily note for a date. */
	openDay(date: string): void;
}

/** Sent when notes change, so live parts redraw. */
export const refreshLive = StateEffect.define<number>();

/** Opens one ```basalt block as text to edit it (its </> button), or closes it (null). */
const editBlock = StateEffect.define<{ from: number; to: number } | null>();

/** The block open as text, if any. It closes when the cursor leaves it. */
const openBlock = StateField.define<{ from: number; to: number } | null>({
	create: () => null,
	update(value, tr) {
		for (const e of tr.effects) if (e.is(editBlock)) return e.value;
		if (!value) return value;
		const next = tr.docChanged ? { from: tr.changes.mapPos(value.from, -1), to: tr.changes.mapPos(value.to, 1) } : value;
		const head = tr.state.selection.main.head;
		return head < next.from || head > next.to ? null : next;
	},
});

/** Where a drawn block's text is: from its opening ``` line to its closing one. */
function blockRange(view: EditorView, dom: HTMLElement) {
	const doc = view.state.doc;
	const start = doc.lineAt(view.posAtDOM(dom));
	let end = start.number + 1;
	while (end <= doc.lines && doc.line(end).text.trim() !== "```") end++;
	return { start, end: Math.min(end, doc.lines) };
}

/**
 * A title or text changed in place (widgets.ts `editInPlace`): rewrite its
 * `key: value` line in the block, or add one if the block didn't have it.
 */
function setInPlace(view: EditorView, dom: HTMLElement, detail: { key: string; old: string; value: string }) {
	if (view.state.readOnly) return;
	const doc = view.state.doc;
	const { start, end } = blockRange(view, dom);
	const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`^(\\s*${escape(detail.key)}\\s*:\\s*)${escape(detail.old)}\\s*$`, "i");
	for (let n = start.number + 1; n < end; n++) {
		const line = doc.line(n);
		const m = match.exec(line.text);
		if (!m) continue;
		if (!detail.value) return view.dispatch({ changes: { from: line.from, to: Math.min(line.to + 1, doc.length) } });
		return view.dispatch({ changes: { from: line.from + m[1].length, to: line.to, insert: detail.value } });
	}
	// Not there yet: add it, in a block that is one card (in columns there's no telling which card).
	const rows = Array.from({ length: end - start.number - 1 }, (_, i) => doc.line(start.number + 1 + i).text);
	if (detail.value && !rows.some((l) => /^\s*==\s*$/.test(l))) view.dispatch({ changes: { from: start.to, insert: `\n${detail.key}: ${detail.value}` } });
}

/** A change to one block's lines (blockEdit.ts), sent up from a part of it as "basalt-organize". */
type Organize = (lines: string[]) => string[];
const organize = (from: HTMLElement, edit: Organize) => from.dispatchEvent(new CustomEvent("basalt-organize", { bubbles: true, detail: edit }));

function rewrite(view: EditorView, dom: HTMLElement, edit: Organize) {
	if (view.state.readOnly) return;
	const doc = view.state.doc;
	const { start, end } = blockRange(view, dom);
	if (end <= start.number) return;
	const from = doc.line(start.number + 1).from, to = doc.line(end).from;
	const body = view.state.sliceDoc(from, to).replace(/\n$/, "");
	const next = edit(body.split("\n"));
	// Nothing left: the whole block goes.
	if (!next.some((l) => l.trim())) return removeBlock(view, dom);
	const insert = next.join("\n");
	if (insert !== body) view.dispatch({ changes: { from, to: to - 1, insert } });
}

/** The ```basalt blocks in the note, as line numbers. */
function allBlocks(view: EditorView) {
	const doc = view.state.doc;
	const out: Array<{ start: number; end: number }> = [];
	for (let n = 1; n <= doc.lines; n++) {
		if (!/^```basalt\s*$/.test(doc.line(n).text.trim())) continue;
		let end = n + 1;
		while (end <= doc.lines && doc.line(end).text.trim() !== "```") end++;
		if (end > doc.lines) break;
		out.push({ start: n, end });
		n = end;
	}
	return out;
}

/** Swaps a block with the one before or after it (what's between them stays put). */
function moveBlock(view: EditorView, dom: HTMLElement, step: -1 | 1) {
	const doc = view.state.doc;
	const here = blockRange(view, dom).start.number;
	const list = allBlocks(view);
	const i = list.findIndex((b) => b.start === here);
	const other = list[i + step];
	if (i < 0 || !other) return;
	const [first, second] = step < 0 ? [other, list[i]] : [list[i], other];
	const range = (b: { start: number; end: number }) => ({ from: doc.line(b.start).from, to: doc.line(b.end).to });
	const r1 = range(first), r2 = range(second);
	view.dispatch({
		changes: [
			{ from: r1.from, to: r1.to, insert: view.state.sliceDoc(r2.from, r2.to) },
			{ from: r2.from, to: r2.to, insert: view.state.sliceDoc(r1.from, r1.to) },
		],
	});
}

function removeBlock(view: EditorView, dom: HTMLElement) {
	const doc = view.state.doc;
	const { start, end } = blockRange(view, dom);
	let from = start.from, to = doc.line(end).to;
	// Take one blank line with it, so no gap is left behind.
	if (to < doc.length && !doc.lineAt(to + 1).text.trim()) to = doc.lineAt(to + 1).to;
	else if (start.number > 1 && !doc.line(start.number - 1).text.trim()) from = doc.line(start.number - 1).from;
	view.dispatch({ changes: { from, to: Math.min(to + (to < doc.length ? 1 : 0), doc.length) } });
}

/** A new block after this one, with what was picked from the + menu. */
function addBlock(view: EditorView, dom: HTMLElement, lines: string[]) {
	const end = view.state.doc.line(blockRange(view, dom).end).to;
	view.dispatch({ changes: { from: end, insert: `\n\n\`\`\`basalt\n${lines.join("\n")}\n\`\`\`` } });
}

/** The + menu: pieces to add to the dashboard. */
function piecesMenu(e: MouseEvent, folder: string, add: (lines: string[]) => void) {
	const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
	showMenu(
		new MouseEvent("contextmenu", { clientX: r.left, clientY: r.bottom + 4 }),
		PIECES.map((p) => ({ label: p.name, icon: p.icon as IconName, run: () => add(p.lines(folder)) })),
	);
}

function toolButton(name: IconName | "</>", title: string, run: (e: MouseEvent) => void) {
	const b = el("button", "basalt-tool");
	b.title = title;
	if (name === "</>") b.textContent = name;
	else b.innerHTML = icon(name, 13);
	b.addEventListener("mousedown", (e) => {
		e.preventDefault();
		e.stopPropagation();
	});
	b.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		run(e);
	});
	return b;
}

/**
 * A block's tools, shown on hover while editing: move it up or down, add a
 * piece after it, open it as text (</>), or remove it. Also where changes made
 * inside the block (a title edited in place, a pinned note) are written back.
 */
function blockTools(view: EditorView, dom: HTMLElement, hooks: LiveHooks) {
	dom.addEventListener("basalt-set", (e) => setInPlace(view, dom, (e as CustomEvent).detail));
	dom.addEventListener("basalt-organize", (e) => rewrite(view, dom, (e as CustomEvent).detail as Organize));
	if (view.state.readOnly) return;
	const bar = el("div", "basalt-tools");
	bar.append(
		toolButton("up", "Move up", () => moveBlock(view, dom, -1)),
		toolButton("down", "Move down", () => moveBlock(view, dom, 1)),
		toolButton("plus", "Add something after this", (e) => piecesMenu(e, hooks.folder(), (lines) => addBlock(view, dom, lines))),
		toolButton("</>", "Edit this block as text", () => {
			const doc = view.state.doc;
			const { start, end } = blockRange(view, dom);
			const to = doc.line(end).to;
			view.dispatch({ effects: editBlock.of({ from: start.from, to }), selection: { anchor: Math.min(to, doc.line(Math.min(start.number + 1, doc.lines)).to) } });
			view.focus();
		}),
		toolButton("trash", "Remove (Ctrl+Z brings it back)", () => removeBlock(view, dom)),
	);
	dom.append(bar);
}

/** A card's tools inside a block laid out in columns: move it around, add one under it, remove it. */
function cardTools(box: HTMLElement, card: number, hooks: LiveHooks) {
	const bar = el("div", "basalt-tools basalt-card-tools");
	const send = (edit: Organize) => organize(box, edit);
	bar.append(
		toolButton("back", "Move to the column on the left", () => send((l) => moveCard(l, card, "left"))),
		toolButton("up", "Move up", () => send((l) => moveCard(l, card, "up"))),
		toolButton("down", "Move down", () => send((l) => moveCard(l, card, "down"))),
		toolButton("forward", "Move to the column on the right", () => send((l) => moveCard(l, card, "right"))),
		toolButton("plus", "Add a card under this one", (e) => piecesMenu(e, hooks.folder(), (lines) => send((l) => addCard(l, card, lines)))),
		toolButton("trash", "Remove this card (Ctrl+Z brings it back)", () => send((l) => removeCard(l, card))),
	);
	box.append(bar);
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text != null) e.textContent = text;
	return e;
};

/** Clicks on live parts open notes instead of moving the cursor into the block. */
function link(e: HTMLElement, open: () => void) {
	e.addEventListener("mousedown", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
	});
	e.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		open();
	});
}

/** What to stop (clocks, timers) when a block's drawing is taken off the page. */
const stops = new WeakMap<HTMLElement, Array<() => void>>();

/**
 * A block laid out in columns: `columns: 220px 1fr 200px` (optional), then each
 * column starts with a line `==`, and `--` starts the next card in a column.
 */
const isRow = (source: string) => /^\s*==\s*$/m.test(source);

class RowWidget extends WidgetType {
	constructor(
		private source: string,
		private stamp: number,
		private hooks: LiveHooks,
		private reading = false
	) {
		super();
	}

	eq(other: RowWidget) {
		return other.source === this.source && other.stamp === this.stamp && other.reading === this.reading;
	}

	toDOM(view: EditorView) {
		const later: Array<() => void> = [];
		const [head, ...columns] = this.source.split(/^\s*==\s*$/m);
		const widths = /^\s*columns\s*:\s*(.+)$/im.exec(head)?.[1]?.trim();
		const row = el("div", "basalt-row");
		if (widths) row.style.gridTemplateColumns = widths.split(/[\s,]+/).map((w) => (/^\d+(\.\d+)?$/.test(w) ? `${w}fr` : w)).join(" ");
		else row.style.gridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`;
		let n = 0;
		for (const column of columns) {
			const col = el("div", "basalt-column");
			for (const card of column.split(/^\s*--\s*$/m)) if (card.trim()) col.append(new QueryWidget(card, this.stamp, this.hooks, this.reading, n++, true).draw(later));
			row.append(col);
		}
		stops.set(row, later);
		blockTools(view, row, this.hooks);
		return row;
	}

	destroy(dom: HTMLElement) {
		for (const stop of stops.get(dom) ?? []) stop();
	}

	ignoreEvent() {
		return true;
	}
}

class QueryWidget extends WidgetType {
	constructor(
		private source: string,
		private stamp: number,
		private hooks: LiveHooks,
		private reading = false,
		/** Which card it is, counting in reading order (0 when it's a block of its own). */
		private card = 0,
		/** One of several cards laid out in columns. */
		private inRow = false
	) {
		super();
	}

	eq(other: QueryWidget) {
		return other.source === this.source && other.stamp === this.stamp && other.reading === this.reading;
	}

	toDOM(view: EditorView) {
		const later: Array<() => void> = [];
		const dom = this.draw(later);
		stops.set(dom, later);
		blockTools(view, dom, this.hooks);
		return dom;
	}

	destroy(dom: HTMLElement) {
		for (const stop of stops.get(dom) ?? []) stop();
	}

	draw(later: Array<() => void>): HTMLElement {
		const box = this.drawInner(later);
		if (this.inRow && !this.reading) cardTools(box, this.card, this.hooks);
		return box;
	}

	/** Sends a change to this card's own lines. */
	private change(from: HTMLElement, edit: (card: string[]) => string[]) {
		organize(from, (lines) => editCard(lines, this.card, edit));
	}

	private drawInner(later: Array<() => void>): HTMLElement {
		const { spec, rows } = this.hooks.runBlock(this.source);
		const box = el("div", `basalt-block basalt-show-${spec.show} basalt-list-${spec.list}`);
		if (spec.title) {
			const title = el("div", "basalt-title", spec.title);
			editInPlace(title, "title", spec.title, { editable: !this.reading });
			box.append(title);
		}
		if (spec.unknown.length) box.append(el("div", "basalt-warn", `Didn't understand: ${spec.unknown.join("; ")}`));
		if ((WIDGETS as readonly string[]).includes(spec.list)) return widget(box, spec, { ...this.hooks, editable: !this.reading }, later);
		if (spec.list === "habits") return this.tracker(box, spec);
		if (spec.show === "count") {
			box.append(el("div", "basalt-count", String(rows.length)), el("div", "basalt-count-label", spec.title ? "" : spec.list));
			return box;
		}
		if (!rows.length) {
			box.append(el("div", "basalt-empty", "Nothing here yet."));
			return box;
		}
		if (spec.show === "table") {
			const cols = spec.columns.length ? spec.columns : spec.list === "tasks" ? ["due", "note"] : ["folder"];
			const table = el("table", "basalt-table");
			const head = el("tr");
			head.append(el("th", "", spec.list === "tasks" ? "Task" : "Note"), ...cols.map((c) => el("th", "", c)));
			table.append(head);
			for (const r of rows) {
				const tr = el("tr");
				const name = el("td");
				name.append(this.item(r, spec));
				tr.append(name, ...cols.map((c) => el("td", "", c === "folder" ? r.folder : c === "note" ? r.path.split("/").pop()!.replace(/\.md$/, "") : c === "due" ? (r.task?.due ?? r.props.due ?? "") : c === "tags" ? r.tags.map((t) => `#${t}`).join(" ") : (r.props[c.toLowerCase()] ?? ""))));
				table.append(tr);
			}
			box.append(table);
			return box;
		}
		const groups = groupRows(rows, spec.group);
		if (spec.show === "cards") {
			for (const g of groups) {
				if (g.name) box.append(el("div", "basalt-group", g.name));
				const grid = el("div", "basalt-cards");
				for (const r of g.rows) {
					const card = el("div", "basalt-card");
					const color = this.hooks.folderColor(r.folder.split("/")[0]);
					if (color) card.style.setProperty("--card-color", color);
					card.append(el("div", "basalt-card-title", r.title));
					if (r.description) card.append(el("div", "basalt-card-text", r.description));
					const meta = el("div", "basalt-card-meta", [r.folder, ...r.tags.slice(0, 3).map((t) => `#${t}`)].filter(Boolean).join(" · "));
					if (r.task?.due) meta.textContent = `due ${r.task.due}`;
					if (r.count != null) meta.textContent = `${r.count} ${r.count === 1 ? "note" : "notes"}`;
					card.append(meta);
					if (r.path) link(card, () => this.hooks.open(r.path));
					this.arrange(card, r, spec, rows);
					grid.append(card);
				}
				box.append(grid);
			}
			this.extras(box, spec);
			return box;
		}
		for (const g of groups) {
			if (g.name) box.append(el("div", "basalt-group", g.name));
			const list = el("ul", "basalt-items");
			for (const r of g.rows) {
				const li = el("li");
				li.append(this.item(r, spec));
				if (r.task?.due) li.append(el("span", "basalt-due", r.task.due));
				if (r.count != null) li.append(el("span", "basalt-due", String(r.count)));
				this.arrange(li, r, spec, rows);
				list.append(li);
			}
			box.append(list);
		}
		this.extras(box, spec);
		return box;
	}

	/**
	 * While editing: pin or hide a row (buttons on hover), and drag rows into
	 * the order you want (which pins them all, in that order).
	 */
	private arrange(row: HTMLElement, r: Row, spec: Spec, all: Row[]) {
		if (this.reading || !r.title) return;
		const pinned = spec.pin.includes(r.title.toLowerCase());
		const picked = spec.notes.some((n) => n.toLowerCase() === r.title.toLowerCase());
		row.classList.add("basalt-arrangeable");
		if (pinned) row.classList.add("is-pinned");
		const tools = el("span", "basalt-row-tools");
		tools.append(
			toolButton("pin", pinned ? "Unpin" : "Pin to the top", () => this.change(row, (c) => (pinned ? unpin(c, r.title) : pin(c, r.title)))),
			spec.list === "picked" || (picked && !spec.from.length && !spec.tag)
				? toolButton("x", "Take out of this list", () => this.change(row, (c) => c.filter((l) => !(/^\s*note\s*:/i.test(l) && l.split(":").slice(1).join(":").trim().toLowerCase() === r.title.toLowerCase()))))
				: toolButton("eyeOff", "Hide from this list", () => this.change(row, (c) => hide(c, r.title))),
		);
		row.append(tools);
		// Dragging rows into order.
		row.draggable = true;
		row.addEventListener("dragstart", (e) => {
			e.stopPropagation();
			e.dataTransfer?.setData("text/basalt-row", r.title);
			row.classList.add("is-dragging");
		});
		row.addEventListener("dragend", () => row.classList.remove("is-dragging"));
		row.addEventListener("dragover", (e) => {
			if (!e.dataTransfer?.types.includes("text/basalt-row")) return;
			e.preventDefault();
			e.stopPropagation();
			const after = e.offsetY > row.offsetHeight / 2 || (row.classList.contains("basalt-card") && e.offsetX > row.offsetWidth / 2);
			row.classList.toggle("drop-before", !after);
			row.classList.toggle("drop-after", after);
		});
		row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
		row.addEventListener("drop", (e) => {
			const moved = e.dataTransfer?.getData("text/basalt-row");
			const after = row.classList.contains("drop-after");
			row.classList.remove("drop-before", "drop-after");
			if (!moved || moved === r.title) return;
			e.preventDefault();
			e.stopPropagation();
			const names = all.map((x) => x.title).filter((t) => t !== moved);
			names.splice(names.indexOf(r.title) + (after ? 1 : 0), 0, moved);
			this.change(row, (c) => order(c, names));
		});
	}

	/** Under a list while editing: pick a note into it, and bring back hidden ones. */
	private extras(box: HTMLElement, spec: Spec) {
		if (this.reading) return;
		const foot = el("div", "basalt-foot");
		if (spec.list === "notes" || spec.list === "picked") {
			const input = el("input", "basalt-pick") as HTMLInputElement;
			input.placeholder = "+ Add a note…";
			const id = `basalt-notes-${Math.random().toString(36).slice(2)}`;
			const options = el("datalist");
			options.id = id;
			input.setAttribute("list", id);
			input.addEventListener("focus", () => options.replaceChildren(...this.hooks.noteNames().map((n) => Object.assign(document.createElement("option"), { value: n }))), { once: true });
			for (const ev of ["mousedown", "keyup", "input", "paste", "beforeinput"]) input.addEventListener(ev, (e) => e.stopPropagation());
			input.addEventListener("keydown", (e) => {
				e.stopPropagation();
				if (e.key !== "Enter") return;
				e.preventDefault();
				const name = input.value.trim();
				const real = this.hooks.noteNames().find((n) => n.toLowerCase() === name.toLowerCase());
				if (real) this.change(input, (c) => pin(addNote(c, real), real));
				else input.select();
			});
			foot.append(input, options);
		}
		if (spec.hide.length) {
			const back = el("button", "basalt-unhide", `${spec.hide.length} hidden · show`);
			link(back, () => this.change(back, showHidden));
			foot.append(back);
		}
		if (foot.childElementCount) box.append(foot);
	}

	/** Habits down the side, days across; a filled square is a day it was done. */
	private tracker(box: HTMLElement, spec: Spec) {
		const { list, days } = this.hooks.habits(spec.days);
		// Habits from the Habits note, plus any written in daily notes but not listed.
		const names = [...new Set([...list, ...days.flatMap((d) => [...d.lines.keys()])])];
		if (!names.length) {
			box.append(el("div", "basalt-empty", "No habits yet. Make a note called “Habits” with a checklist of them; new daily notes will include it."));
			return box;
		}
		const grid = el("div", "basalt-habits");
		grid.style.setProperty("--days", String(days.length));
		grid.append(el("span", "basalt-habit-name"));
		for (const d of days) {
			const day = new Date(`${d.date}T12:00:00`);
			const head = el("span", "basalt-habit-day", day.getDate() === 1 || d === days[0] ? day.toLocaleDateString(undefined, { month: "short" }) : "");
			head.title = d.date;
			grid.append(head);
		}
		grid.append(el("span", "basalt-habit-streak", "Streak"));
		for (const name of names) {
			grid.append(el("span", "basalt-habit-name", name));
			for (const d of days) {
				const on = d.done.has(name);
				const cell = el("button", `basalt-habit-cell${on ? " is-done" : ""}${d === days.at(-1) ? " is-today" : ""}`);
				cell.title = `${name} · ${d.date}${on ? " · done" : d.path ? "" : " · no daily note"}`;
				link(cell, () => {
					const line = d.lines.get(name);
					if (d.path && line != null) this.hooks.toggleTask(d.path, line);
					else this.hooks.openDay(d.date);
				});
				grid.append(cell);
			}
			const n = streak(days, name);
			grid.append(el("span", "basalt-habit-streak", n ? `${n}🔥` : "–"));
		}
		box.append(grid);
		return box;
	}

	/** One row: a task with its tick box, or a link to a note. */
	private item(r: Row, spec: Spec) {
		const span = el("span", "basalt-item");
		if (r.task) {
			const box = el("input") as HTMLInputElement;
			box.type = "checkbox";
			box.checked = r.task.done;
			box.className = "basalt-check";
			box.disabled = r.task.line < 0;
			box.addEventListener("mousedown", (e) => e.stopPropagation());
			box.addEventListener("click", (e) => {
				e.stopPropagation();
				this.hooks.toggleTask(r.path, r.task!.line);
			});
			const label = el("a", r.task.done ? "basalt-link is-done" : "basalt-link", r.title);
			link(label, () => this.hooks.open(r.path));
			span.append(box, label);
			if (spec.list === "tasks") span.title = r.path.replace(/\.md$/, "");
			return span;
		}
		const a = el("a", "basalt-link", r.title);
		if (r.path) link(a, () => this.hooks.open(r.path));
		span.append(a);
		return span;
	}

	ignoreEvent() {
		return true;
	}
}

class EmbedWidget extends WidgetType {
	constructor(
		private target: string,
		private stamp: number,
		private hooks: LiveHooks
	) {
		super();
	}

	eq(other: EmbedWidget) {
		return other.target === this.target && other.stamp === this.stamp;
	}

	toDOM() {
		const found = this.hooks.embed(this.target);
		const box = el("div", "basalt-embed");
		const head = el("div", "basalt-embed-head");
		const name = el("a", "basalt-link", this.target);
		head.append(name);
		box.append(head);
		if (!found) {
			box.classList.add("is-missing");
			box.append(el("div", "basalt-empty", `There's no note called “${this.target.split("#")[0]}” yet.`));
			return box;
		}
		link(name, () => this.hooks.open(found.path));
		const body = el("div", "basalt-embed-body");
		body.innerHTML = markdown(found.text);
		for (const a of body.querySelectorAll<HTMLElement>("a[data-note]")) link(a, () => this.hooks.open(a.dataset.note ?? ""));
		box.append(body);
		return box;
	}

	ignoreEvent() {
		return true;
	}
}

function build(state: EditorState, hooks: LiveHooks, stamp: number): DecorationSet {
	const decos: Range<Decoration>[] = [];
	const sel = state.selection.main;
	// Embeds open as text when the cursor is on them; never in view mode.
	const touches = (from: number, to: number) => !state.readOnly && sel.from <= to && sel.to >= from;
	// Blocks stay drawn wherever the cursor goes, unless opened with their </> button.
	const open = state.readOnly ? null : state.field(openBlock, false);
	const opened = (from: number, to: number) => !!open && open.from <= to && open.to >= from;
	const doc = state.doc;
	for (let n = 1; n <= doc.lines; n++) {
		const line = doc.line(n);
		const t = line.text.trim();
		// ```basalt … ```
		if (/^```basalt\s*$/.test(t)) {
			let end = n + 1;
			while (end <= doc.lines && doc.line(end).text.trim() !== "```") end++;
			if (end > doc.lines) break;
			const from = line.from, to = doc.line(end).to;
			const source = state.sliceDoc(doc.line(n + 1).from, doc.line(end).from);
			if (!opened(from, to)) decos.push(Decoration.replace({ widget: isRow(source) ? new RowWidget(source, stamp, hooks, state.readOnly) : new QueryWidget(source, stamp, hooks, state.readOnly), block: true }).range(from, to));
			n = end;
			continue;
		}
		// A line that is only ![[Note]].
		const embed = /^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(t);
		if (embed && !touches(line.from, line.to)) decos.push(Decoration.replace({ widget: new EmbedWidget(embed[1].trim(), stamp, hooks), block: true }).range(line.from, line.to));
	}
	return Decoration.set(decos, true);
}

export const liveBlocks = (hooks: LiveHooks) => {
	const stamp = StateField.define<number>({
		create: () => 0,
		update: (v, tr) => tr.effects.reduce((x, e) => (e.is(refreshLive) ? e.value : x), v),
	});
	const decos = StateField.define<DecorationSet>({
		create: (state) => build(state, hooks, 0),
		update: (value, tr) =>
			tr.docChanged || tr.selection || tr.startState.readOnly !== tr.state.readOnly || tr.startState.field(openBlock, false) !== tr.state.field(openBlock, false) || tr.effects.some((e) => e.is(refreshLive)) ? build(tr.state, hooks, tr.state.field(stamp)) : value,
		provide: (f) => EditorView.decorations.from(f),
	});
	return [openBlock, stamp, decos, look];
};

const look = EditorView.theme({
	".basalt-block, .basalt-row": { position: "relative" },
	".basalt-tools": { position: "absolute", top: "6px", right: "6px", zIndex: "3", display: "flex", gap: "1px", padding: "2px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface-float, var(--raised))", backdropFilter: "blur(8px)", opacity: "0", pointerEvents: "none", transition: "opacity var(--dur) var(--ease)" },
	".basalt-block:hover > .basalt-tools, .basalt-row:hover > .basalt-tools": { opacity: "1", pointerEvents: "auto" },
	".basalt-row:hover > .basalt-column .basalt-card-tools": { opacity: "0" },
	".basalt-row .basalt-block:hover > .basalt-card-tools": { opacity: "1", pointerEvents: "auto" },
	// A row's own tools sit on its top edge, on the left, clear of its cards' tools.
	".basalt-row > .basalt-tools": { top: "-13px", left: "14px", right: "auto" },
	".basalt-card-tools": { top: "4px", right: "4px" },
	".basalt-tool": { display: "grid", placeItems: "center", minWidth: "22px", height: "22px", padding: "0 4px", border: "0", borderRadius: "calc(var(--radius) * 0.6)", background: "transparent", color: "var(--muted)", font: "11px var(--font-code)", cursor: "pointer" },
	".basalt-tool:hover": { background: "var(--hover)", color: "var(--accent)" },
	".basalt-arrangeable": { position: "relative" },
	".basalt-row-tools": { display: "inline-flex", gap: "1px", marginLeft: "auto", opacity: "0", transition: "opacity var(--dur) var(--ease)" },
	".basalt-card .basalt-row-tools": { position: "absolute", top: "6px", right: "6px", padding: "1px", borderRadius: "var(--radius)", background: "var(--surface-float, var(--raised))" },
	".basalt-arrangeable:hover > .basalt-row-tools": { opacity: "1" },
	".basalt-row-tools .basalt-tool": { minWidth: "20px", height: "20px" },
	".basalt-arrangeable.is-pinned > .basalt-item .basalt-link::before, .basalt-card.is-pinned .basalt-card-title::before": { content: "'📌 '", fontSize: "0.8em" },
	".basalt-arrangeable.is-dragging": { opacity: "0.4" },
	".basalt-arrangeable.drop-before": { boxShadow: "0 -2px 0 var(--accent)" },
	".basalt-arrangeable.drop-after": { boxShadow: "0 2px 0 var(--accent)" },
	".basalt-card.drop-before": { boxShadow: "-3px 0 0 var(--accent)" },
	".basalt-card.drop-after": { boxShadow: "3px 0 0 var(--accent)" },
	".basalt-group": { margin: "10px 0 4px", color: "var(--muted)", fontSize: "0.78em", fontWeight: "650", letterSpacing: "0.06em", textTransform: "uppercase" },
	".basalt-foot": { display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" },
	".basalt-pick": { flex: "1", minWidth: "0", padding: "3px 8px", border: "1px dashed var(--border)", borderRadius: "var(--radius)", outline: "0", background: "transparent", color: "var(--text)", font: "inherit", fontSize: "0.9em", opacity: "0.6", transition: "opacity var(--dur) var(--ease)" },
	".basalt-pick:focus, .basalt-block:hover .basalt-pick": { opacity: "1" },
	".basalt-pick:focus": { borderColor: "var(--accent)", borderStyle: "solid" },
	".basalt-unhide": { border: "0", background: "transparent", color: "var(--muted)", fontSize: "0.82em", cursor: "pointer", textDecoration: "underline" },
	".basalt-block, .basalt-embed": { margin: "8px 0 12px", fontFamily: "var(--font-ui)", fontSize: "0.92em", lineHeight: "1.5" },
	".basalt-title": { marginBottom: "6px", color: "var(--heading)", fontWeight: "650", fontSize: "1.05em" },
	".basalt-warn": { marginBottom: "6px", color: "#e5a84b", fontSize: "0.85em" },
	".basalt-empty": { color: "var(--muted)", fontStyle: "italic" },
	".basalt-items": { margin: "0", paddingLeft: "4px", listStyle: "none" },
	".basalt-items li": { display: "flex", alignItems: "center", gap: "8px", padding: "2px 0" },
	".basalt-item": { display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "0" },
	".basalt-link": { color: "var(--link)", textDecoration: "underline", textDecorationColor: "color-mix(in srgb, var(--link) 35%, transparent)", textUnderlineOffset: "3px", cursor: "pointer" },
	".basalt-link.is-done": { color: "var(--muted)", textDecoration: "line-through" },
	".basalt-check": { margin: "0", accentColor: "var(--accent)", cursor: "pointer" },
	".basalt-due": { marginLeft: "auto", color: "var(--muted)", fontSize: "0.85em" },
	".basalt-cards": { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "10px" },
	".basalt-card": { "--card-color": "var(--accent)", display: "flex", flexDirection: "column", gap: "4px", padding: "12px 14px", border: "1px solid var(--border)", borderTop: "3px solid var(--card-color)", borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--raised) 60%, transparent)", cursor: "pointer", transition: "transform var(--dur) var(--ease), border-color var(--dur) var(--ease)" },
	".basalt-card:hover": { transform: "translateY(-2px)", borderColor: "var(--card-color)" },
	".basalt-card-title": { color: "var(--heading)", fontWeight: "650" },
	".basalt-card-text": { color: "var(--text)", fontSize: "0.92em" },
	".basalt-card-meta": { marginTop: "auto", color: "var(--muted)", fontSize: "0.82em" },
	".basalt-table": { width: "100%", borderCollapse: "collapse" },
	".basalt-table th, .basalt-table td": { padding: "6px 10px", borderBottom: "1px solid var(--border)", textAlign: "left" },
	".basalt-table th": { color: "var(--muted)", fontWeight: "600", fontSize: "0.85em", textTransform: "uppercase", letterSpacing: "0.04em" },
	".basalt-count": { color: "var(--heading)", fontSize: "2.4em", fontWeight: "700", lineHeight: "1.1" },
	".basalt-count-label": { color: "var(--muted)", textTransform: "capitalize" },
	".basalt-habits": { display: "grid", gridTemplateColumns: "minmax(90px, max-content) repeat(var(--days), minmax(10px, 1fr)) auto", gap: "3px", alignItems: "center", overflowX: "auto" },
	".basalt-habit-name": { paddingRight: "8px", whiteSpace: "nowrap", color: "var(--text)" },
	".basalt-habit-day": { color: "var(--muted)", fontSize: "0.75em", whiteSpace: "nowrap", overflow: "visible" },
	".basalt-habit-cell": { aspectRatio: "1", minWidth: "10px", padding: "0", border: "0", borderRadius: "3px", background: "var(--hover)", cursor: "pointer", transition: "background-color var(--dur) var(--ease), transform var(--dur) var(--ease)" },
	".basalt-habit-cell:hover": { transform: "scale(1.15)" },
	".basalt-habit-cell.is-done": { background: "var(--accent)" },
	".basalt-habit-cell.is-today": { outline: "1.5px solid color-mix(in srgb, var(--accent) 60%, transparent)", outlineOffset: "1px" },
	".basalt-habit-streak": { paddingLeft: "8px", color: "var(--muted)", fontSize: "0.85em", whiteSpace: "nowrap" },
	// Dashboards: columns and widgets (widgets.ts). Plain here; snippets dress them up.
	".basalt-row": { display: "grid", gap: "14px", alignItems: "stretch", margin: "8px 0 14px" },
	".basalt-column": { display: "flex", flexDirection: "column", gap: "14px", minWidth: "0" },
	// Columns end level: the last part of each fills what's left, so there are no gaps.
	".basalt-column > .basalt-block:last-child": { flex: "1" },
	".basalt-column > .basalt-block": { margin: "0", padding: "14px 16px", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) * 1.3)", background: "color-mix(in srgb, var(--raised) 55%, transparent)" },
	".basalt-header": { position: "relative", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "14px", padding: "20px 24px", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) * 1.4)", background: "color-mix(in srgb, var(--raised) 55%, transparent)", overflow: "hidden" },
	".basalt-header-image": { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "0", pointerEvents: "none" },
	".basalt-header.has-image::before": { content: "''", position: "absolute", inset: "0", zIndex: "0", background: "linear-gradient(90deg, rgba(0,0,0,0.35), rgba(0,0,0,0.12) 50%, rgba(0,0,0,0.3))" },
	".basalt-header > :not(.basalt-header-image)": { position: "relative", zIndex: "1" },
	".basalt-header.has-image": { color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,0.6)" },
	".basalt-editable": { outline: "none", cursor: "text", borderRadius: "4px", transition: "box-shadow var(--dur) var(--ease)" },
	".basalt-editable:hover": { boxShadow: "0 0 0 1px color-mix(in srgb, currentColor 25%, transparent)" },
	".basalt-editable:focus": { boxShadow: "0 0 0 1px var(--accent)" },
	".basalt-tagline.is-empty:not(:focus)::after": { content: "attr(data-placeholder)", opacity: "0.5" },
	".basalt-header-title": { color: "inherit", fontSize: "1.55em", fontWeight: "700", letterSpacing: "0.04em", lineHeight: "1.1" },
	".basalt-header:not(.has-image) .basalt-header-title": { color: "var(--heading)" },
	".basalt-tagline": { marginTop: "4px", color: "var(--muted)", fontSize: "0.82em" },
	".basalt-header.has-image .basalt-tagline": { color: "rgba(255,255,255,0.8)" },
	".basalt-clock": { textAlign: "center" },
	".basalt-time": { fontSize: "2.3em", fontWeight: "650", lineHeight: "1", fontVariantNumeric: "tabular-nums", letterSpacing: "0.03em" },
	".basalt-date": { marginTop: "4px", fontSize: "0.78em", opacity: "0.85" },
	".basalt-header-right": { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" },
	".basalt-greeting": { fontSize: "0.8em", opacity: "0.8" },
	".basalt-stats": { display: "flex", gap: "6px" },
	".basalt-stat": { minWidth: "48px", padding: "5px 10px", textAlign: "center", border: "1px solid color-mix(in srgb, currentColor 18%, transparent)", borderRadius: "var(--radius)", background: "color-mix(in srgb, var(--bg) 30%, transparent)" },
	".basalt-stat-num": { fontSize: "1.1em", fontWeight: "650", lineHeight: "1.1" },
	".basalt-stat-label": { fontSize: "0.68em", opacity: "0.75" },
	".basalt-tiles": { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "14px" },
	".basalt-tile": { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) * 1.2)", background: "color-mix(in srgb, var(--raised) 60%, transparent)", cursor: "pointer", transition: "transform var(--dur) var(--ease), border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)" },
	".basalt-tile:hover": { transform: "translateY(-2px) scale(1.015)", borderColor: "var(--accent)", boxShadow: "0 8px 22px rgba(0,0,0,0.2)" },
	".basalt-tile-art": { display: "grid", placeItems: "center", height: "96px", overflow: "hidden", borderRadius: "var(--radius)", background: "var(--hover)", color: "var(--muted)", fontSize: "2.2em" },
	".basalt-tile-art img": { width: "100%", height: "100%", objectFit: "cover" },
	".basalt-tile-name": { textAlign: "center", color: "var(--heading)", fontWeight: "650" },
	".basalt-tile-about": { marginTop: "-4px", textAlign: "center", color: "var(--muted)", fontSize: "0.82em" },
	".basalt-goal": { color: "var(--heading)", fontSize: "1.15em", lineHeight: "1.45" },
	".basalt-actions": { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" },
	".basalt-action": { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 4px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "transparent", color: "var(--muted)", font: "inherit", fontSize: "0.78em", cursor: "pointer", transition: "transform var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease)" },
	".basalt-action:hover": { transform: "translateY(-1px)", borderColor: "var(--accent)", color: "var(--text)" },
	".basalt-action-icon": { display: "flex", color: "var(--accent)" },
	".basalt-cal-head": { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", fontSize: "0.85em" },
	".basalt-cal-nav": { padding: "0 6px", border: "0", background: "none", color: "var(--muted)", font: "inherit", fontSize: "1.2em", cursor: "pointer" },
	".basalt-cal": { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", textAlign: "center" },
	".basalt-cal-dow": { color: "var(--muted)", fontSize: "0.68em" },
	".basalt-cal-day": { padding: "4px 0", border: "1px solid transparent", borderRadius: "calc(var(--radius) * 0.6)", background: "none", color: "var(--text)", font: "inherit", fontSize: "0.78em", cursor: "pointer" },
	".basalt-cal-day:hover": { borderColor: "var(--border)" },
	".basalt-cal-day.has-note": { color: "var(--accent)", fontWeight: "650" },
	".basalt-cal-day.is-today": { borderColor: "var(--accent)", background: "var(--accent-soft)" },
	".basalt-cal-day.is-blank": { cursor: "default", borderColor: "transparent" },
	".basalt-timer-time": { textAlign: "center", color: "var(--heading)", fontSize: "2.6em", fontWeight: "650", fontVariantNumeric: "tabular-nums", lineHeight: "1.1" },
	".basalt-timer-bar": { height: "3px", margin: "10px 0 8px", overflow: "hidden", borderRadius: "3px", background: "var(--hover)" },
	".basalt-timer-bar i": { display: "block", height: "100%", background: "var(--accent)", transition: "width 1s linear" },
	".basalt-timer-status, .basalt-timer-count": { textAlign: "center", color: "var(--muted)", fontSize: "0.75em", letterSpacing: "0.08em", textTransform: "uppercase" },
	".basalt-timer-count": { textTransform: "none", letterSpacing: "0" },
	".basalt-timer-controls": { display: "flex", justifyContent: "center", gap: "8px", margin: "10px 0" },
	".basalt-timer-btn": { display: "grid", placeItems: "center", width: "36px", height: "32px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "transparent", color: "var(--text)", cursor: "pointer" },
	".basalt-timer-btn:hover": { borderColor: "var(--accent)", color: "var(--accent)" },
	".basalt-capture-input": { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "transparent", color: "var(--text)", font: "inherit", resize: "vertical", outline: "0" },
	".basalt-capture-input:focus": { borderColor: "var(--accent)" },
	".basalt-capture-row": { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", marginTop: "6px" },
	".basalt-capture-done": { color: "var(--muted)", fontSize: "0.8em" },
	".basalt-capture-btn": { padding: "5px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "transparent", color: "var(--text)", font: "inherit", fontSize: "0.85em", cursor: "pointer" },
	".basalt-capture-btn:hover": { borderColor: "var(--accent)", color: "var(--accent)" },
	"@media (max-width: 900px)": { ".basalt-row": { gridTemplateColumns: "1fr !important" }, ".basalt-header": { gridTemplateColumns: "1fr" }, ".basalt-header-right": { alignItems: "flex-start" } },
	".basalt-embed": { padding: "10px 16px", borderLeft: "3px solid var(--accent)", borderRadius: "0 var(--radius) var(--radius) 0", background: "color-mix(in srgb, var(--raised) 50%, transparent)" },
	".basalt-embed-head": { marginBottom: "4px", fontSize: "0.85em" },
	".basalt-embed-body h1, .basalt-embed-body h2, .basalt-embed-body h3": { margin: "6px 0 4px", color: "var(--heading)", fontSize: "1.1em" },
	".basalt-embed-body p": { margin: "0 0 6px" },
	".basalt-embed.is-missing": { borderLeftColor: "var(--muted)" },
});
