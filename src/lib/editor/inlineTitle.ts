// The inline title, like Obsidian's: the note's name, big, above its text.
// Typing in it renames the note (on Enter or when you click away); Escape puts
// the old name back. A note that was just made opens with its title selected,
// ready to be named.
import type { EditorView } from "@codemirror/view";
import { bodyStart } from "./properties";

export interface TitleHooks {
	/** The note's name, without ".md". */
	name: string;
	rename(name: string): void;
	/** True once, for a note that was just made: select its title. */
	fresh(): boolean;
}

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
