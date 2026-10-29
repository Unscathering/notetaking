// The inline title, like Obsidian's: the note's name, big, above its text.
// Typing in it renames the note (on Enter or when you click away); Escape puts
// the old name back. A note that was just made opens with its title selected,
// ready to be named.
import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { bodyStart } from "./properties";

export interface TitleHooks {
	/** The note's name, without ".md". */
	name: string;
	rename(name: string): void;
	/** Renames without touching the text (the text is where the new name came from). */
	renameQuietly(name: string): void;
	/** True once, for a note that was just made: select its title. */
	fresh(): boolean;
}

/**
 * The note's first line, if it's a top heading: notes used to start with their
 * name as a heading. Such a heading is the note's title (the inline one isn't
 * shown too), and if it said the note's name, editing it renames the note.
 */
export function firstHeading(state: EditorState): { from: number; to: number; text: string } | null {
	const start = bodyStart(state);
	for (let n = state.doc.lineAt(start).number; n <= Math.min(state.doc.lines, state.doc.lineAt(start).number + 3); n++) {
		const line = state.doc.line(n);
		if (!line.text.trim()) continue;
		const m = /^#\s+(.+?)\s*$/.exec(line.text);
		return m ? { from: line.from, to: line.to, text: m[1] } : null;
	}
	return null;
}

/** Leaving a title heading you changed renames the note to match. */
export const titleSync = (hooks: TitleHooks) =>
	ViewPlugin.fromClass(
		class {
			/** The cursor is in the title heading (and the editor has focus). */
			inside = false;
			/** The heading said the note's name when the cursor went in. */
			was = false;
			update(u: ViewUpdate) {
				if (!u.selectionSet && !u.docChanged && !u.focusChanged) return;
				const h = firstHeading(u.state);
				const head = u.state.selection.main.head;
				const now = u.view.hasFocus && !!h && head >= h.from && head <= h.to;
				if (now && !this.inside) this.was = h?.text === hooks.name;
				else if (!now && this.inside && this.was) {
					const name = h?.text.replace(/[\\/:*?"<>|]/g, "-").trim();
					if (name && name !== hooks.name) hooks.renameQuietly(name);
				}
				this.inside = now;
			}
		},
	);

/** The title, for the note header (properties.ts) to put under the banner. */
export function titleBox(view: EditorView, hooks: TitleHooks): HTMLElement {
	const box = document.createElement("div");
	box.className = "basalt-inline-title";
	box.textContent = hooks.name;
	box.spellcheck = false;
	if (view.state.readOnly) return box;
	box.contentEditable = "plaintext-only";
	// Enter renames and moves on, and the blur that follows mustn't rename again.
	let settled = false;
	box.addEventListener("focus", () => (settled = false));
	const done = (keep: boolean) => {
		if (settled) return;
		settled = true;
		const name = (box.textContent ?? "").replace(/\s+/g, " ").trim();
		if (keep && name && name !== hooks.name) hooks.rename(name);
		else box.textContent = hooks.name;
	};
	const toBody = () => {
		const at = bodyStart(view.state);
		view.focus();
		view.dispatch({ selection: { anchor: at } });
	};
	box.addEventListener("keydown", (e) => {
		e.stopPropagation();
		if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "Tab") {
			e.preventDefault();
			done(true);
			toBody();
		} else if (e.key === "Escape") {
			e.preventDefault();
			done(false);
			toBody();
		}
	});
	box.addEventListener("blur", () => done(true));
	// One line of plain text, even when pasting.
	box.addEventListener("paste", (e) => {
		e.preventDefault();
		document.execCommand("insertText", false, (e.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " "));
	});
	if (hooks.fresh())
		requestAnimationFrame(() => {
			box.focus();
			const range = document.createRange();
			range.selectNodeContents(box);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		});
	return box;
}
