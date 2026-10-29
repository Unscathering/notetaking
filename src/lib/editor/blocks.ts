// Blocks that become real interface while you're not editing them: tables turn
// into a grid you can type in like a spreadsheet, and images show inline.
import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

export interface BlockHooks {
	/** A URL the page can show for an image path in the cave. */
	imageUrl(path: string): Promise<string | null>;
}

// ---- Tables ----

type Align = "left" | "center" | "right" | null;

interface Table {
	rows: string[][];
	align: Align[];
}

const splitRow = (line: string) =>
	line
		.trim()
		.replace(/^\||\|$/g, "")
		.split(/(?<!\\)\|/)
		.map((c) => c.trim());

function parseTable(text: string): Table {
	const lines = text.split("\n").filter((l) => l.trim());
	const head = splitRow(lines[0] ?? "");
	const align = splitRow(lines[1] ?? "").map((c): Align => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : null));
	const rows = [head, ...lines.slice(2).map(splitRow)];
	const width = Math.max(...rows.map((r) => r.length));
	for (const r of rows) while (r.length < width) r.push("");
	while (align.length < width) align.push(null);
	return { rows, align };
}

function tableText(t: Table): string {
	const width = t.rows[0].length;
	const sizes = Array.from({ length: width }, (_, c) => Math.max(3, ...t.rows.map((r) => r[c].length)));
	const row = (r: string[]) => `| ${r.map((cell, c) => cell.padEnd(sizes[c])).join(" | ")} |`;
	const rule = `| ${t.align.map((a, c) => { const dash = "-".repeat(Math.max(3, sizes[c] - (a === "center" ? 2 : a ? 1 : 0))); return a === "center" ? `:${dash}:` : a === "right" ? `${dash}:` : a === "left" ? `:${dash}` : dash; }).join(" | ")} |`;
	return [row(t.rows[0]), rule, ...t.rows.slice(1).map(row)].join("\n");
}

/** Which cell to focus after the table redraws (it redraws after every change). */
let focusAfter: { from: number; r: number; c: number } | null = null;
let redrawing = false;

class TableWidget extends WidgetType {
	constructor(private source: string, private from: number, private to: number, private reading = false) {
		super();
	}

	eq(other: TableWidget) {
		return other.source === this.source && other.from === this.from && other.reading === this.reading;
	}

	toDOM(view: EditorView) {
		const table = parseTable(this.source);
		const wrap = document.createElement("div");
		wrap.className = "cm-table-wrap";
		// Makes each cell its own little text box instead of part of the note's text.
		wrap.contentEditable = "false";
		const el = document.createElement("table");
		el.className = "cm-table";
		const cells: HTMLElement[][] = [];

		const save = (next: Table, focus?: { r: number; c: number }) => {
			const text = tableText(next);
			if (focus) focusAfter = { from: this.from, ...focus };
			if (text !== this.source) {
				// Redrawing removes the focused cell, which counts as leaving it; don't save twice.
				redrawing = true;
				try {
					view.dispatch({ changes: { from: this.from, to: this.to, insert: text } });
				} finally {
					redrawing = false;
				}
			}
			else if (focus) cells[focus.r]?.[focus.c]?.focus();
		};
		const read = (): Table => ({ rows: cells.map((r) => r.map((c) => c.textContent?.replace(/\|/g, "\\|").replace(/\n/g, " ").trim() ?? "")), align: [...table.align] });

		table.rows.forEach((row, r) => {
			const tr = document.createElement("tr");
			cells.push([]);
			row.forEach((text, c) => {
				const cell = document.createElement(r === 0 ? "th" : "td");
				cell.contentEditable = this.reading ? "false" : "plaintext-only";
				cell.textContent = text.replace(/\\\|/g, "|");
				if (table.align[c]) cell.style.textAlign = table.align[c]!;
				cell.addEventListener("keydown", (e) => {
					const width = row.length, height = table.rows.length;
					if (e.key === "Tab") {
						e.preventDefault();
						let nr = r, nc = c + (e.shiftKey ? -1 : 1);
						if (nc >= width) (nc = 0), nr++;
						if (nc < 0) (nc = width - 1), nr--;
						const next = read();
						if (nr >= height) next.rows.push(Array(width).fill(""));
						if (nr < 0) return;
						save(next, { r: nr, c: nc });
					} else if (e.key === "Enter") {
						e.preventDefault();
						const next = read();
						if (r + 1 >= height) next.rows.push(Array(width).fill(""));
						save(next, { r: r + 1, c });
					} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
						// Select just this cell's text, not the whole note.
						e.preventDefault();
						const range = document.createRange();
						range.selectNodeContents(cell);
						getSelection()?.removeAllRanges();
						getSelection()?.addRange(range);
					} else if (e.key === "Escape") {
						cell.blur();
						view.focus();
					}
				});
				cell.addEventListener("blur", (e) => {
					// Moving to another cell of the same table saves once, from that cell's keys.
					if (redrawing || wrap.contains(e.relatedTarget as Node)) return;
					save(read());
				});
				cells[r].push(cell);
				tr.append(cell);
			});
			el.append(tr);
		});
		wrap.append(el);

		const bar = document.createElement("div");
		bar.className = "cm-table-bar";
		const button = (label: string, title: string, fn: () => void) => {
			const b = document.createElement("button");
			b.textContent = label;
			b.title = title;
			b.addEventListener("mousedown", (e) => {
				e.preventDefault();
				fn();
			});
			bar.append(b);
		};
		button("+ Row", "Add a row", () => {
			const next = read();
			next.rows.push(Array(next.rows[0].length).fill(""));
			save(next, { r: next.rows.length - 1, c: 0 });
		});
		button("+ Column", "Add a column", () => {
			const next = read();
			next.rows.forEach((row, i) => row.push(i === 0 ? `Column ${row.length + 1}` : ""));
			next.align.push(null);
			save(next, { r: 0, c: next.rows[0].length - 1 });
		});
		button("− Row", "Remove the last row", () => {
			const next = read();
			if (next.rows.length > 2) next.rows.pop();
			save(next);
		});
		button("− Column", "Remove the last column", () => {
			const next = read();
			if (next.rows[0].length > 1) {
				next.rows.forEach((row) => row.pop());
				next.align.pop();
			}
			save(next);
		});
		button("Markdown", "Edit as plain text", () => view.dispatch({ selection: { anchor: this.from } }));
		wrap.append(bar);

		if (focusAfter && focusAfter.from === this.from) {
			const f = focusAfter;
			focusAfter = null;
			requestAnimationFrame(() => {
				const cell = cells[f.r]?.[f.c];
				if (!cell) return;
				cell.focus();
				const range = document.createRange();
				range.selectNodeContents(cell);
				range.collapse(false);
				getSelection()?.removeAllRanges();
				getSelection()?.addRange(range);
			});
		}
		return wrap;
	}

	ignoreEvent() {
		return true;
	}
}

// ---- Images ----

class ImageWidget extends WidgetType {
	constructor(private src: string, private alt: string, private at: number, private hooks: BlockHooks) {
		super();
	}

	eq(other: ImageWidget) {
		return other.src === this.src && other.alt === this.alt;
	}

	toDOM(view: EditorView) {
		const figure = document.createElement("figure");
		figure.className = "cm-image";
		const img = document.createElement("img");
		img.alt = this.alt;
		img.draggable = false;
		if (/^(https?:|data:)/.test(this.src)) img.src = this.src;
		else void this.hooks.imageUrl(decodeURI(this.src)).then((url) => url ? (img.src = url) : figure.classList.add("is-missing"));
		img.addEventListener("load", () => view.requestMeasure());
		figure.append(img);
		if (this.alt) {
			const cap = document.createElement("figcaption");
			cap.textContent = this.alt;
			figure.append(cap);
		}
		figure.addEventListener("mousedown", (e) => {
			e.preventDefault();
			view.dispatch({ selection: { anchor: this.at } });
			view.focus();
		});
		return figure;
	}

	ignoreEvent() {
		return false;
	}
}

function build(state: EditorState, hooks: BlockHooks): DecorationSet {
	const decos: Range<Decoration>[] = [];
	const sel = state.selection.main;
	// In view mode the cursor never opens a block up as text.
	const touches = (from: number, to: number) => !state.readOnly && sel.from <= to && sel.to >= from;
	syntaxTree(state).iterate({
		enter: (node) => {
			if (node.name === "Table") {
				const from = state.doc.lineAt(node.from).from, to = state.doc.lineAt(node.to).to;
				if (!touches(from, to)) decos.push(Decoration.replace({ widget: new TableWidget(state.sliceDoc(from, to), from, to, state.readOnly), block: true }).range(from, to));
				return false;
			}
			if (node.name === "Image") {
				const line = state.doc.lineAt(node.from);
				// Only images on a line of their own become pictures.
				if (line.text.trim() !== state.sliceDoc(node.from, node.to).trim() || touches(line.from, line.to)) return false;
				const m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(line.text.trim());
				if (m) decos.push(Decoration.replace({ widget: new ImageWidget(m[2], m[1], line.from, hooks), block: true }).range(line.from, line.to));
				return false;
			}
			return undefined;
		},
	});
	return Decoration.set(decos, true);
}

export const richBlocks = (hooks: BlockHooks) =>
	StateField.define<DecorationSet>({
		create: (state) => build(state, hooks),
		update: (value, tr) => (tr.docChanged || tr.selection || tr.startState.readOnly !== tr.state.readOnly || syntaxTree(tr.startState) !== syntaxTree(tr.state) ? build(tr.state, hooks) : value),
		provide: (f) => EditorView.decorations.from(f),
	});
