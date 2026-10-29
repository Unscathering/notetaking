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
import type { Row, Spec } from "../query";
import { streak, type HabitDay } from "../habits";

export interface LiveHooks {
	/** Runs a ```basalt block. */
	runBlock(source: string): { spec: Spec; rows: Row[] };
	/** An embedded note's text (or one heading's section of it), and its path. */
	embed(target: string): { path: string; text: string } | null;
	open(path: string): void;
	toggleTask(path: string, line: number): void;
	folderColor(folder: string): string | undefined;
	/** The habit tracker's data: habits and the last `days` days. */
	habits(days: number): { list: string[]; days: HabitDay[] };
	/** Opens (making it if needed) the daily note for a date. */
	openDay(date: string): void;
}

/** Sent when notes change, so live parts redraw. */
export const refreshLive = StateEffect.define<number>();

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

class QueryWidget extends WidgetType {
	constructor(
		private source: string,
		private stamp: number,
		private hooks: LiveHooks
	) {
		super();
	}

	eq(other: QueryWidget) {
		return other.source === this.source && other.stamp === this.stamp;
	}

	toDOM() {
		const { spec, rows } = this.hooks.runBlock(this.source);
		const box = el("div", `basalt-block basalt-show-${spec.show} basalt-list-${spec.list}`);
		if (spec.title) box.append(el("div", "basalt-title", spec.title));
		if (spec.unknown.length) box.append(el("div", "basalt-warn", `Didn't understand: ${spec.unknown.join("; ")}`));
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
		if (spec.show === "cards") {
			const grid = el("div", "basalt-cards");
			for (const r of rows) {
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
				grid.append(card);
			}
			box.append(grid);
			return box;
		}
		const list = el("ul", "basalt-items");
		for (const r of rows) {
			const li = el("li");
			li.append(this.item(r, spec));
			if (r.task?.due) li.append(el("span", "basalt-due", r.task.due));
			if (r.count != null) li.append(el("span", "basalt-due", String(r.count)));
			list.append(li);
		}
		box.append(list);
		return box;
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
	// In view mode the cursor never opens a block up as text.
	const touches = (from: number, to: number) => !state.readOnly && sel.from <= to && sel.to >= from;
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
			if (!touches(from, to)) decos.push(Decoration.replace({ widget: new QueryWidget(state.sliceDoc(doc.line(n + 1).from, doc.line(end).from), stamp, hooks), block: true }).range(from, to));
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
		update: (value, tr) => (tr.docChanged || tr.selection || tr.startState.readOnly !== tr.state.readOnly || tr.effects.some((e) => e.is(refreshLive)) ? build(tr.state, hooks, tr.state.field(stamp)) : value),
		provide: (f) => EditorView.decorations.from(f),
	});
	return [stamp, decos, look];
};

const look = EditorView.theme({
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
	".basalt-embed": { padding: "10px 16px", borderLeft: "3px solid var(--accent)", borderRadius: "0 var(--radius) var(--radius) 0", background: "color-mix(in srgb, var(--raised) 50%, transparent)" },
	".basalt-embed-head": { marginBottom: "4px", fontSize: "0.85em" },
	".basalt-embed-body h1, .basalt-embed-body h2, .basalt-embed-body h3": { margin: "6px 0 4px", color: "var(--heading)", fontSize: "1.1em" },
	".basalt-embed-body p": { margin: "0 0 6px" },
	".basalt-embed.is-missing": { borderLeftColor: "var(--muted)" },
});
