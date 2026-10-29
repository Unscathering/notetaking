// Live preview: Markdown shows its formatting as you type, and the symbols that
// make it (# ** ` [[ ]] >) step out of the way on lines you are not editing.
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";

const hide = Decoration.replace({});
const lineClass = (cls: string) => Decoration.line({ class: cls });

class BulletWidget extends WidgetType {
	eq() {
		return true;
	}
	toDOM() {
		const s = document.createElement("span");
		s.className = "cm-bullet";
		s.textContent = "•";
		return s;
	}
}

const CALLOUT_ICONS: Record<string, string> = { note: "✎", info: "ℹ", tip: "✦", success: "✓", warning: "⚠", danger: "⛔", question: "?", quote: "❝" };

class CalloutLabelWidget extends WidgetType {
	constructor(private kind: string) {
		super();
	}
	eq(other: CalloutLabelWidget) {
		return other.kind === this.kind;
	}
	toDOM() {
		const s = document.createElement("span");
		s.className = "cm-callout-label";
		s.textContent = `${CALLOUT_ICONS[this.kind] ?? "✎"} `;
		return s;
	}
}

/** The language name shown at the top of a code block in place of its ``` fence. */
class CodeLabelWidget extends WidgetType {
	constructor(private label: string) {
		super();
	}
	eq(other: CodeLabelWidget) {
		return other.label === this.label;
	}
	toDOM() {
		const s = document.createElement("span");
		s.className = "cm-code-label";
		s.textContent = this.label;
		return s;
	}
}

class CheckboxWidget extends WidgetType {
	constructor(private checked: boolean, private at: number) {
		super();
	}
	eq(other: CheckboxWidget) {
		return other.checked === this.checked && other.at === this.at;
	}
	toDOM(view: EditorView) {
		const box = document.createElement("span");
		box.className = `cm-task${this.checked ? " is-done" : ""}`;
		box.setAttribute("role", "checkbox");
		box.setAttribute("aria-checked", String(this.checked));
		box.addEventListener("mousedown", (e) => {
			e.preventDefault();
			view.dispatch({ changes: { from: this.at + 1, to: this.at + 2, insert: this.checked ? " " : "x" } });
		});
		return box;
	}
	ignoreEvent() {
		return false;
	}
}

/** Lines the cursor or a selection touches: their symbols stay visible. */
function activeLines(state: EditorState): Set<number> {
	const lines = new Set<number>();
	// View mode: nothing is being edited, so every line shows tidy.
	if (state.readOnly) return lines;
	for (const r of state.selection.ranges) {
		const a = state.doc.lineAt(r.from).number, b = state.doc.lineAt(r.to).number;
		for (let n = a; n <= b; n++) lines.add(n);
	}
	return lines;
}

const WIKILINK = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]/g;

function build(view: EditorView): DecorationSet {
	const { state } = view;
	const active = activeLines(state);
	const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
	const decos: Range<Decoration>[] = [];

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(state).iterate({
			from,
			to,
			enter: (node) => {
				const name = node.name;
				const heading = /^ATXHeading(\d)$/.exec(name);
				if (heading) {
					decos.push(lineClass(`cm-h cm-h${heading[1]}`).range(state.doc.lineAt(node.from).from));
					return;
				}
				if (name === "HeaderMark" && !isActive(node.from)) {
					// Hide "## " including the space after it.
					const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
					decos.push(hide.range(node.from, end));
				} else if ((name === "EmphasisMark" || name === "StrikethroughMark") && !isActive(node.from)) {
					decos.push(hide.range(node.from, node.to));
				} else if (name === "CodeMark" && node.node.parent?.name === "InlineCode" && !isActive(node.from)) {
					decos.push(hide.range(node.from, node.to));
				} else if (name === "Blockquote") {
					// "> [!tip] Title" makes a colored callout box instead of a plain quote.
					const first = state.doc.lineAt(node.from);
					const callout = /^>\s*\[!(\w+)\]/.exec(first.text);
					const kind = callout ? callout[1].toLowerCase() : null;
					for (let pos = node.from; pos <= node.to; ) {
						const line = state.doc.lineAt(pos);
						const edge = (line.from === first.from ? " cm-callout-first" : "") + (line.to >= node.to ? " cm-callout-last" : "");
						decos.push(lineClass(kind ? `cm-callout cm-callout-${kind}${edge}` : "cm-quote").range(line.from));
						pos = line.to + 1;
					}
					if (callout && !isActive(first.from)) {
						const markEnd = first.from + callout[0].length;
						decos.push(Decoration.replace({ widget: new CalloutLabelWidget(kind!) }).range(first.from, markEnd));
					}
				} else if (name === "QuoteMark" && !isActive(node.from) && !/^>\s*\[!\w+\]/.test(state.doc.lineAt(node.from).text)) {
					// (A callout's first line is covered by its label instead.)
					const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
					decos.push(hide.range(node.from, end));
				} else if (name === "FencedCode") {
					// Away from the block, its ``` fences give way to a small language label.
					const first = state.doc.lineAt(node.from), last = state.doc.lineAt(node.to);
					let editing = false;
					for (let n = first.number; n <= last.number && !editing; n++) editing = active.has(n);
					if (!editing) {
						const info = node.node.getChild("CodeInfo");
						const label = info ? state.doc.sliceString(info.from, info.to) : "";
						decos.push(Decoration.replace({ widget: new CodeLabelWidget(label) }).range(first.from, first.to));
						if (last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text)) decos.push(hide.range(last.from, last.to));
					}
					for (let pos = node.from; pos <= node.to; ) {
						const line = state.doc.lineAt(pos);
						const edge = line.from === state.doc.lineAt(node.from).from ? " cm-code-first" : line.to >= node.to ? " cm-code-last" : "";
						decos.push(lineClass(`cm-codeblock${edge}`).range(line.from));
						pos = line.to + 1;
					}
				} else if (name === "Link" && !isActive(node.from)) {
					// [text](url): show only the text.
					const marks = node.node.getChildren("LinkMark");
					const url = node.node.getChild("URL");
					if (marks.length >= 2) {
						decos.push(hide.range(marks[0].from, marks[0].to));
						decos.push(Decoration.mark({ class: "cm-link-text" }).range(marks[0].to, marks[1].from));
						decos.push(hide.range(marks[1].from, url ? node.to : marks[1].to));
					}
				} else if (name === "ListMark" && !isActive(node.from)) {
					const text = state.doc.sliceString(node.from, node.to);
					const next = state.doc.sliceString(node.to, node.to + 4);
					// Task items get a checkbox instead of "- [ ]".
					const task = /^ \[( |x|X)\]/.exec(next);
					if (task && (text === "-" || text === "*" || text === "+")) {
						decos.push(Decoration.replace({ widget: new CheckboxWidget(task[1] !== " ", node.to + 1) }).range(node.from, node.to + 4));
						const lineEnd = state.doc.lineAt(node.from).to;
						if (task[1] !== " " && node.to + 5 < lineEnd) decos.push(Decoration.mark({ class: "cm-task-done" }).range(node.to + 5, lineEnd));
					} else if (text === "-" || text === "*" || text === "+") {
						decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
					}
				}
			},
		});

		// [[Wiki links]] between notes, and #tags.
		const text = state.doc.sliceString(from, to);
		for (const m of text.matchAll(/(^|\s)(#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu)) {
			const start = from + m.index! + m[1].length;
			const line = state.doc.lineAt(start);
			// Not headings ("# Title") or code.
			if (/^#{1,6}\s/.test(line.text) && start === line.from) continue;
			const inside = syntaxTree(state).resolveInner(start, 1).name;
			if (/Code|URL/.test(inside)) continue;
			decos.push(Decoration.mark({ class: "cm-hashtag" }).range(start, start + m[2].length));
		}
		for (const m of text.matchAll(WIKILINK)) {
			const start = from + m.index!, end = start + m[0].length;
			const target = m[1].trim();
			const editing = isActive(start);
			const link = Decoration.mark({ class: "cm-wikilink", attributes: { "data-target": target } });
			if (editing) {
				decos.push(link.range(start, end));
			} else {
				const shownFrom = m[2] ? start + 2 + m[1].length + 1 : start + 2;
				decos.push(hide.range(start, shownFrom));
				decos.push(link.range(shownFrom, end - 2));
				decos.push(hide.range(end - 2, end));
			}
		}
	}
	// Builders need ranges in order; decorations from the two passes interleave.
	decos.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
	const builder = new RangeSetBuilder<Decoration>();
	for (const d of decos) builder.add(d.from, d.to, d.value);
	return builder.finish();
}

export const livePreview = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = build(view);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.selectionSet || u.viewportChanged || u.startState.readOnly !== u.state.readOnly || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view);
		}
	},
	{ decorations: (v) => v.decorations }
);

/** Calls `open` with the note name when a [[link]] is clicked. */
export const wikilinkClicks = (open: (target: string) => void) =>
	EditorView.domEventHandlers({
		mousedown(e) {
			const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-wikilink");
			if (!el?.dataset.target || e.button !== 0) return false;
			// Ctrl-click or a click on a line you are not editing follows the link.
			e.preventDefault();
			open(el.dataset.target);
			return true;
		},
	});
