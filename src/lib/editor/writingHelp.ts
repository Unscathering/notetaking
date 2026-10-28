// Writing help in the editor, a little like Grammarly:
//
// - Select text and a small bar offers Grammar, Fix and Rewrite.
// - Grammar and Fix underline each suggested change. Put the cursor in one
//   (or click it) to see the old and new words, then accept or dismiss it.
// - Rewrite shows the new version in a card: replace, try again or keep yours.
// - A whole note can be checked from the command bar (Ctrl+Shift+G), and
//   "Check grammar as I write" checks each paragraph after you leave it.
//
// Accepting is an ordinary edit, so Ctrl+Z takes it back.
import { StateEffect, StateField, type EditorState, type Extension, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, showPanel, showTooltip, type DecorationSet, type Panel, type Tooltip, type ViewUpdate } from "@codemirror/view";
import { MODES, allowed, batches, diff, prose, type Mode, type Piece } from "../ai/proofread";

export interface WritingHelpHooks {
	/** Can the AI help right now? */
	helperReady(): boolean;
	/** Wake the AI early, before it's needed. */
	warmUp(): void;
	/** New versions of these lines (one text back for a rewrite). */
	improve(mode: Mode, lines: string[]): Promise<string[]>;
	/** "Check grammar as I write" is on. */
	checkAsYouWrite(): boolean;
}

interface Suggestion {
	id: number;
	from: number;
	to: number;
	insert: string;
	why: string;
	mode: Mode;
}

interface Job {
	mode: Mode;
	from: number;
	to: number;
	/** Whole note: shown in the bar at the bottom instead of a card. */
	note: boolean;
	done: number;
	total: number;
	/** A rewrite waiting for a yes or no. */
	review?: string;
	original?: string;
	error?: string;
}

const addSuggestions = StateEffect.define<Suggestion[]>();
const dropSuggestions = StateEffect.define<{ ids?: number[]; from?: number; to?: number }>();
const setJob = StateEffect.define<Job | null>();

let nextId = 1;

/** Where a suggestion is underlined. Something to add goes on the letter before it. */
const span = (s: Suggestion): [number, number] => (s.from < s.to ? [s.from, s.to] : s.from > 0 ? [s.from - 1, s.from] : [s.from, s.from + 1]);

const suggestions = StateField.define<Suggestion[]>({
	create: () => [],
	update(list, tr) {
		if (tr.docChanged && list.length) {
			// A suggestion goes away when its words are edited by hand.
			const touched = new Set<number>();
			tr.changes.iterChangedRanges((a, b) => list.forEach((s) => a <= s.to && b >= s.from && touched.add(s.id)));
			list = list.filter((s) => !touched.has(s.id)).map((s) => ({ ...s, from: tr.changes.mapPos(s.from, 1), to: tr.changes.mapPos(s.to, -1) }));
		}
		for (const e of tr.effects) {
			if (e.is(addSuggestions)) list = [...list, ...e.value].sort((a, b) => a.from - b.from);
			if (e.is(dropSuggestions)) {
				const { ids, from, to } = e.value;
				list = list.filter((s) => !(ids ? ids.includes(s.id) : from == null || to == null || (s.from <= to && s.to >= from)));
			}
		}
		return list;
	},
	provide: (f) =>
		EditorView.decorations.from(f, (list) =>
			Decoration.set(
				list.map((s) => Decoration.mark({ class: `cm-help-mark cm-help-${s.mode}`, attributes: { title: s.why } }).range(...span(s))),
				true
			) as DecorationSet
		),
});

const job = StateField.define<Job | null>({
	create: () => null,
	update(j, tr: Transaction) {
		for (const e of tr.effects) if (e.is(setJob)) j = e.value;
		if (j && tr.docChanged) j = { ...j, from: tr.changes.mapPos(j.from, -1), to: tr.changes.mapPos(j.to, 1) };
		return j;
	},
});

// ---- Running a job ----

/** Bumped to stop whatever is running. */
let run = 0;

/** Finds a line again if the note changed while the AI was busy. */
function locate(state: EditorState, p: Piece): Piece | null {
	if (state.doc.sliceString(p.from, p.to) === p.text) return p;
	const text = state.doc.toString();
	const at = text.indexOf(p.text, Math.max(0, p.from - 2000));
	return at >= 0 ? { ...p, from: at, to: at + p.text.length } : null;
}

/** Checks lines and underlines what should change. Returns how many suggestions. */
async function check(view: EditorView, hooks: WritingHelpHooks, mode: Mode, pieces: Piece[], onBatch?: (done: number) => void): Promise<number> {
	const mine = run;
	let found = 0, done = 0;
	for (const group of batches(pieces)) {
		const answers = await hooks.improve(mode, group.map((p) => p.text));
		if (mine !== run) return found;
		const list: Suggestion[] = [];
		group.forEach((p, i) => {
			const here = locate(view.state, p);
			if (!here || answers[i] == null) return;
			for (const e of allowed(mode, here.text, diff(here.text, answers[i]))) list.push({ id: nextId++, mode, why: e.why, from: here.from + e.from, to: here.from + e.to, insert: e.insert });
		});
		view.dispatch({ effects: [dropSuggestions.of({ from: group[0].from, to: group.at(-1)!.to }), addSuggestions.of(list)] });
		found += list.length;
		done += group.length;
		onBatch?.(done);
	}
	return found;
}

/** Grammar, fix or rewrite on the selection, or on the whole note. */
export async function startHelp(view: EditorView, hooks: WritingHelpHooks, mode: Mode, wholeNote = false) {
	if (!hooks.helperReady()) {
		view.dispatch({ effects: setJob.of({ mode, from: 0, to: 0, note: true, done: 0, total: 0, error: "Set up the AI first: open the AI panel (Ctrl+J) and pick a model." }) });
		return;
	}
	const sel = view.state.selection.main;
	const note = wholeNote || sel.empty;
	const from = note ? 0 : sel.from, to = note ? view.state.doc.length : sel.to;
	const mine = ++run;
	const fail = (e: unknown) => mine === run && view.dispatch({ effects: setJob.of({ mode, from, to, note, done: 0, total: 0, error: e instanceof Error ? e.message : String(e) }) });
	if (mode === "rewrite") {
		const original = view.state.doc.sliceString(from, to);
		if (!original.trim()) return;
		view.dispatch({ effects: setJob.of({ mode, from, to, note: false, done: 0, total: 1, original }) });
		try {
			const [text] = await hooks.improve("rewrite", original.split("\n"));
			if (mine === run) view.dispatch({ effects: setJob.of({ mode, from, to, note: false, done: 1, total: 1, original, review: text || original }) });
		} catch (e) {
			fail(e);
		}
		return;
	}
	const pieces = prose(view.state.doc.toString(), from, to);
	if (!pieces.length) return;
	view.dispatch({ effects: [dropSuggestions.of({ from, to }), setJob.of({ mode, from, to, note, done: 0, total: pieces.length })] });
	try {
		const found = await check(view, hooks, mode, pieces, (done) => mine === run && view.dispatch({ effects: setJob.of({ mode, from, to, note, done, total: pieces.length }) }));
		if (mine !== run) return;
		view.dispatch({ effects: setJob.of(null) });
		if (!found) flash(view, mode === "grammar" ? "No grammar mistakes found." : "Nothing to fix. It reads well.");
	} catch (e) {
		fail(e);
	}
}

export function stopHelp(view: EditorView) {
	run++;
	view.dispatch({ effects: setJob.of(null) });
}

function accept(view: EditorView, list: Suggestion[]) {
	if (!list.length) return;
	view.dispatch({ changes: list.map((s) => ({ from: s.from, to: s.to, insert: s.insert })), effects: dropSuggestions.of({ ids: list.map((s) => s.id) }), userEvent: "input.help" });
}

const dismiss = (view: EditorView, list: Suggestion[]) => view.dispatch({ effects: dropSuggestions.of({ ids: list.map((s) => s.id) }) });

// A short message in the bottom bar, like "No grammar mistakes found."
const setFlash = StateEffect.define<string | null>();
const flashField = StateField.define<string | null>({
	create: () => null,
	update: (v, tr) => tr.effects.reduce((x, e) => (e.is(setFlash) ? e.value : x), v),
});
function flash(view: EditorView, text: string) {
	view.dispatch({ effects: setFlash.of(text) });
	setTimeout(() => view.state.field(flashField, false) === text && view.dispatch({ effects: setFlash.of(null) }), 3500);
}

// ---- What you see ----

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
	const e = document.createElement(tag);
	e.className = cls;
	if (text != null) e.textContent = text;
	return e;
}

/** A button that doesn't take the cursor out of the note. */
function button(label: string, cls: string, onClick: () => void, title?: string) {
	const b = el("button", `cm-help-btn ${cls}`, label);
	if (title) b.title = title;
	b.onmousedown = (e) => e.preventDefault();
	b.onclick = onClick;
	return b;
}

const sparkle = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06 4 20M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg>`;

function working(mode: Mode, j: Job, view: EditorView) {
	const row = el("div", "cm-help-working");
	row.innerHTML = sparkle;
	row.append(el("span", "", `${MODES[mode].working}…${j.total > 1 ? ` ${j.done} of ${j.total}` : ""}`), button("Stop", "is-quiet", () => stopHelp(view)));
	return row;
}

function tooltips(hooks: WritingHelpHooks) {
	return showTooltip.computeN([suggestions, job, "selection"], (state): readonly Tooltip[] => {
		const j = state.field(job);
		const sel = state.selection.main;
		// A rewrite in progress or waiting for an answer.
		if (j && !j.note) {
			return [
				{
					pos: j.from,
					above: false,
					create(view) {
						const dom = el("div", "cm-help-card");
						if (j.error) {
							dom.append(el("p", "cm-help-error", j.error), button("OK", "is-quiet", () => view.dispatch({ effects: setJob.of(null) })));
						} else if (j.review == null) dom.append(working(j.mode, j, view));
						else {
							dom.append(el("div", "cm-help-title", "Rewritten"), el("div", "cm-help-new", j.review));
							const row = el("div", "cm-help-row");
							row.append(
								button("Replace", "is-go", () => view.dispatch({ changes: { from: j.from, to: j.to, insert: j.review! }, effects: setJob.of(null), userEvent: "input.help" })),
								button("Try again", "is-quiet", () => {
									view.dispatch({ selection: { anchor: j.from, head: j.to } });
									void startHelp(view, hooks, "rewrite");
								}),
								button("Keep mine", "is-quiet", () => view.dispatch({ effects: setJob.of(null) }))
							);
							dom.append(row);
						}
						return { dom };
					},
				},
			];
		}
		// The cursor is in an underlined change.
		const list = state.field(suggestions);
		const here = sel.empty ? list.find((s) => sel.head >= span(s)[0] && sel.head <= span(s)[1]) : undefined;
		if (here) {
			return [
				{
					pos: here.from,
					above: false,
					create(view) {
						const dom = el("div", "cm-help-card");
						dom.append(el("div", "cm-help-title", here.why));
						const change = el("div", "cm-help-change");
						const old = state.doc.sliceString(here.from, here.to);
						if (old) change.append(el("s", "cm-help-old", old));
						change.append(el("span", "cm-help-arrow", "→"), el("b", "cm-help-new-word", here.insert.trim() ? here.insert : "(remove)"));
						const row = el("div", "cm-help-row");
						row.append(
							button("Accept", "is-go", () => accept(view, [here])),
							button("Dismiss", "is-quiet", () => dismiss(view, [here]))
						);
						const same = list.filter((s) => s.mode === here.mode);
						if (same.length > 1) row.append(button(`Accept all ${same.length}`, "is-quiet", () => accept(view, same)));
						dom.append(change, row);
						return { dom };
					},
				},
			];
		}
		// Some text is selected: offer help.
		if (!sel.empty && !j && state.doc.sliceString(sel.from, sel.to).trim().length > 2 && hooks.helperReady()) {
			return [
				{
					pos: sel.from,
					above: true,
					create(view) {
						hooks.warmUp();
						const dom = el("div", "cm-help-bar");
						const ico = el("span", "cm-help-ico");
						ico.innerHTML = sparkle;
						dom.append(ico);
						for (const mode of ["grammar", "fix", "rewrite"] as Mode[]) dom.append(button(MODES[mode].name, "", () => void startHelp(view, hooks, mode), MODES[mode].about));
						return { dom };
					},
				},
			];
		}
		return [];
	});
}

/** The bar at the bottom: a whole-note check's progress, and what it found. */
function bottomBar(view: EditorView): Panel {
	const dom = el("div", "cm-help-panel");
	const draw = (state: EditorState) => {
		const j = state.field(job);
		const list = state.field(suggestions);
		const note = state.field(flashField);
		dom.replaceChildren();
		if (j?.note && j.error) dom.append(el("span", "cm-help-error", j.error), button("OK", "is-quiet", () => view.dispatch({ effects: setJob.of(null) })));
		else if (j?.note) dom.append(working(j.mode, j, view));
		else if (list.length) {
			const span = el("span", "");
			span.innerHTML = sparkle;
			span.append(` ${list.length} ${list.length === 1 ? "suggestion" : "suggestions"} · click an underline to see it`);
			dom.append(span, button("Accept all", "is-go", () => accept(view, state.field(suggestions))), button("Dismiss all", "is-quiet", () => dismiss(view, state.field(suggestions))));
		} else if (note) dom.append(el("span", "", note));
		dom.classList.toggle("is-empty", !dom.childElementCount);
	};
	draw(view.state);
	return { dom, update: (u) => draw(u.state) };
}

/** Checks each paragraph you change once you've moved on from it, if that's turned on. */
const asYouWrite = (hooks: WritingHelpHooks) =>
	ViewPlugin.fromClass(
		class {
			dirty: Array<{ from: number; to: number }> = [];
			timer: ReturnType<typeof setTimeout> | undefined;
			constructor(readonly view: EditorView) {}
			update(u: ViewUpdate) {
				if (u.docChanged && hooks.checkAsYouWrite()) {
					this.dirty = this.dirty.map((r) => ({ from: u.changes.mapPos(r.from, -1), to: u.changes.mapPos(r.to, 1) }));
					u.changes.iterChangedRanges((_a, _b, from, to) => {
						const a = u.state.doc.lineAt(from), b = u.state.doc.lineAt(to);
						this.dirty.push({ from: a.from, to: b.to });
					});
				}
				if ((u.docChanged || u.selectionSet) && this.dirty.length) {
					clearTimeout(this.timer);
					this.timer = setTimeout(() => this.go(), 1500);
				}
			}
			go() {
				const state = this.view.state;
				if (!hooks.checkAsYouWrite() || !hooks.helperReady() || state.field(job)) return;
				const head = state.doc.lineAt(state.selection.main.head);
				// Only paragraphs you've left, so it never jumps in while you type.
				const ready = this.dirty.filter((r) => r.to < head.from || r.from > head.to);
				if (!ready.length) return;
				this.dirty = this.dirty.filter((r) => !ready.includes(r));
				const text = state.doc.toString();
				const pieces = ready.flatMap((r) => prose(text, Math.min(r.from, text.length), Math.min(r.to, text.length)));
				if (pieces.length) void check(this.view, hooks, "grammar", pieces).catch(() => {});
			}
			destroy() {
				clearTimeout(this.timer);
			}
		}
	);

const look = EditorView.theme({
	".cm-help-mark": { textDecoration: "underline wavy", textDecorationThickness: "1.5px", textUnderlineOffset: "4px", textDecorationSkipInk: "none", cursor: "pointer", borderRadius: "3px", transition: "background-color var(--dur) var(--ease)" },
	".cm-help-grammar": { textDecorationColor: "#e05d5d" },
	".cm-help-fix": { textDecorationColor: "var(--link)" },
	".cm-help-mark:hover": { backgroundColor: "var(--hover)" },
	// CodeMirror's own tooltip box stays out of the way; the bar and cards draw themselves.
	".cm-tooltip:has(.cm-help-bar), .cm-tooltip:has(.cm-help-card)": { border: "0 !important", background: "transparent !important" },
	".cm-help-bar, .cm-help-card": { border: "1px solid var(--border)", borderRadius: "calc(var(--radius) * 1.2)", backgroundColor: "var(--surface-float)", backgroundImage: "var(--glass-grain)", backdropFilter: "var(--float-filter)", boxShadow: "var(--glass-edge), 0 14px 34px rgba(0,0,0,0.35)", fontFamily: "var(--font-ui)", color: "var(--text)" },
	".cm-help-bar": { display: "flex", alignItems: "center", gap: "2px", padding: "4px", marginBottom: "6px" },
	".cm-help-ico": { display: "inline-flex", padding: "0 6px 0 4px", color: "var(--accent)" },
	".cm-help-btn": { padding: "5px 10px", border: "0", borderRadius: "var(--radius)", background: "transparent", color: "var(--text)", font: "600 12.5px var(--font-ui)", cursor: "pointer", transition: "background-color var(--dur) var(--ease)" },
	".cm-help-btn:hover": { background: "var(--hover)" },
	".cm-help-btn.is-go": { background: "var(--accent)", color: "var(--on-accent)" },
	".cm-help-btn.is-quiet": { color: "var(--muted)", fontWeight: "500" },
	".cm-help-btn.is-quiet:hover": { color: "var(--text)" },
	".cm-help-card": { maxWidth: "min(460px, 80vw)", marginTop: "6px", padding: "10px 12px", fontSize: "13px", lineHeight: "1.5" },
	".cm-help-title": { marginBottom: "4px", color: "var(--muted)", fontSize: "11.5px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.04em" },
	".cm-help-change": { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px", marginBottom: "8px", fontSize: "14px" },
	".cm-help-old": { color: "var(--muted)", textDecorationColor: "#e05d5d" },
	".cm-help-arrow": { color: "var(--muted)" },
	".cm-help-new-word": { color: "#5fb878" },
	".cm-help-new": { maxHeight: "260px", overflowY: "auto", marginBottom: "8px", padding: "8px 10px", borderLeft: "2px solid var(--accent)", background: "color-mix(in srgb, var(--accent-soft) 50%, transparent)", borderRadius: "0 var(--radius) var(--radius) 0", whiteSpace: "pre-wrap", fontFamily: "var(--font-editor)" },
	".cm-help-row": { display: "flex", flexWrap: "wrap", gap: "6px" },
	".cm-help-working": { display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "12.5px" },
	".cm-help-working svg, .cm-help-panel svg": { color: "var(--accent)", verticalAlign: "-2px" },
	".cm-help-working svg": { animation: "cm-help-pulse 1.2s ease-in-out infinite" },
	"@keyframes cm-help-pulse": { "50%": { opacity: "0.35" } },
	".cm-help-error": { margin: "0 0 8px", color: "var(--text)" },
	".cm-panels-bottom": { borderTop: "0", background: "transparent" },
	".cm-help-panel": { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "6px 12px", fontFamily: "var(--font-ui)", fontSize: "12.5px", color: "var(--muted)" },
	".cm-help-panel.is-empty": { display: "none" },
});

export function writingHelp(hooks: WritingHelpHooks): Extension {
	return [suggestions, job, flashField, tooltips(hooks), showPanel.of(bottomBar), asYouWrite(hooks), look];
}
