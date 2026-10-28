// How the editor behaves while you write: drag handles to move blocks around,
// pasting links and images, typewriter scrolling and dimming other paragraphs.
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { writing } from "../writing.svelte";

export interface BehaviorHooks {
	/** Saves image bytes into the cave and returns the path to link to. */
	saveImage(bytes: Uint8Array, ext: string): Promise<string | null>;
}

/** The top-level block (paragraph, list item, heading, table…) at a position, as whole lines. */
function blockAt(state: EditorState, pos: number): { from: number; to: number } | null {
	let node = syntaxTree(state).resolveInner(pos, 1);
	while (node.parent && node.parent.name !== "Document") {
		// List items move one at a time, not the whole list.
		if (node.name === "ListItem") break;
		node = node.parent;
	}
	if (node.name === "Document") return null;
	const from = state.doc.lineAt(node.from).from;
	let to = state.doc.lineAt(node.to).to;
	// A list item's range can end at the start of the next line.
	if (node.to > from && state.doc.lineAt(node.to).from === node.to && node.to > node.from) to = state.doc.lineAt(node.to - 1).to;
	return { from, to };
}

// ---- Drag handles ----

export const blockHandles = ViewPlugin.fromClass(
	class {
		handle: HTMLElement;
		marker: HTMLElement;
		block: { from: number; to: number } | null = null;
		dragging: { from: number; to: number } | null = null;
		dropAt: number | null = null;

		constructor(private view: EditorView) {
			this.handle = document.createElement("div");
			this.handle.className = "cm-block-handle";
			this.handle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
			this.handle.title = "Drag to move";
			this.marker = document.createElement("div");
			this.marker.className = "cm-drop-line";
			view.scrollDOM.append(this.handle, this.marker);
			view.contentDOM.addEventListener("mousemove", this.hover);
			view.scrollDOM.addEventListener("mouseleave", this.leave);
			this.handle.addEventListener("pointerdown", this.down);
		}

		/** Places an element next to a document position, inside the scrolling area. */
		place(el: HTMLElement, pos: number, side: "top" | "bottom", x?: number) {
			const coords = this.view.coordsAtPos(pos, side === "top" ? 1 : -1);
			if (!coords) return false;
			const box = this.view.scrollDOM.getBoundingClientRect();
			el.style.top = `${(side === "top" ? coords.top : coords.bottom) - box.top + this.view.scrollDOM.scrollTop}px`;
			if (x !== undefined) el.style.left = `${x}px`;
			return true;
		}

		hover = (e: MouseEvent) => {
			if (this.dragging) return;
			const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
			if (pos === null) return;
			const block = blockAt(this.view.state, pos);
			if (!block) return this.leave();
			this.block = block;
			const left = this.view.contentDOM.getBoundingClientRect().left - this.view.scrollDOM.getBoundingClientRect().left;
			const line = this.view.state.doc.lineAt(block.from);
			const indent = /^\s*/.exec(line.text)![0].length;
			const textLeft = this.view.coordsAtPos(line.from + indent)?.left;
			const x = textLeft !== undefined ? textLeft - this.view.scrollDOM.getBoundingClientRect().left - 26 : left;
			if (this.place(this.handle, block.from, "top", x)) this.handle.classList.add("is-shown");
		};

		leave = () => {
			if (!this.dragging) this.handle.classList.remove("is-shown");
		};

		down = (e: PointerEvent) => {
			if (!this.block) return;
			e.preventDefault();
			this.dragging = this.block;
			this.handle.classList.add("is-dragging");
			this.view.dom.classList.add("cm-moving-block");
			window.addEventListener("pointermove", this.move);
			window.addEventListener("pointerup", this.up, { once: true });
		};

		move = (e: PointerEvent) => {
			if (!this.dragging) return;
			const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
			if (pos === null) return;
			const over = blockAt(this.view.state, pos);
			if (!over) return;
			// Drop above or below the block under the pointer, whichever half it's in.
			const top = this.view.coordsAtPos(over.from, 1)?.top ?? 0, bottom = this.view.coordsAtPos(over.to, -1)?.bottom ?? 0;
			const below = e.clientY > (top + bottom) / 2;
			this.dropAt = below ? over.to : over.from;
			const box = this.view.contentDOM.getBoundingClientRect(), sbox = this.view.scrollDOM.getBoundingClientRect();
			this.marker.style.width = `${box.width - 40}px`;
			this.place(this.marker, this.dropAt, below ? "bottom" : "top", box.left - sbox.left + 20);
			this.marker.classList.add("is-shown");
		};

		up = () => {
			window.removeEventListener("pointermove", this.move);
			const block = this.dragging, at = this.dropAt;
			this.dragging = this.dropAt = null;
			this.handle.classList.remove("is-dragging", "is-shown");
			this.marker.classList.remove("is-shown");
			this.view.dom.classList.remove("cm-moving-block");
			if (!block || at === null || (at >= block.from && at <= block.to)) return;
			const { state } = this.view;
			const { doc } = state;
			const text = state.sliceDoc(block.from, block.to);
			// Take the block out along with its line break, and the blank line after it if
			// there is one, so paragraphs keep their spacing wherever they land.
			let cutFrom = block.from, cutTo = Math.min(block.to + 1, doc.length), gap = "";
			if (cutTo < doc.length && doc.lineAt(cutTo).length === 0) (cutTo = Math.min(cutTo + 1, doc.length)), (gap = "\n");
			else if (cutTo === block.to && block.from > 0) {
				// The last block in the note: take the line break before it instead.
				cutFrom = block.from - 1;
				if (cutFrom > 0 && doc.lineAt(cutFrom - 1).length === 0) (cutFrom -= 1), (gap = "\n");
			}
			const insert = at === doc.lineAt(at).from ? `${text}\n${gap}` : `\n${gap}${text}`;
			this.view.dispatch({ changes: [{ from: cutFrom, to: cutTo }, { from: at, insert }], scrollIntoView: false, userEvent: "move.block" });
		};

		update(u: ViewUpdate) {
			if (u.docChanged || u.geometryChanged) this.leave();
		}

		destroy() {
			this.handle.remove();
			this.marker.remove();
			this.view.contentDOM.removeEventListener("mousemove", this.hover);
			this.view.scrollDOM.removeEventListener("mouseleave", this.leave);
		}
	}
);

// ---- Pasting and dropping ----

const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

async function insertImages(view: EditorView, files: File[], hooks: BehaviorHooks, at?: number) {
	const links: string[] = [];
	for (const f of files) {
		const ext = IMAGE_EXT[f.type];
		if (!ext) continue;
		const path = await hooks.saveImage(new Uint8Array(await f.arrayBuffer()), ext);
		if (path) links.push(`![](${encodeURI(path)})`);
	}
	if (!links.length) return;
	const pos = at ?? view.state.selection.main.head;
	const line = view.state.doc.lineAt(pos);
	const text = `${line.text.trim() ? "\n" : ""}${links.join("\n")}\n`;
	view.dispatch({ changes: { from: line.to, insert: text }, selection: { anchor: line.to + text.length } });
}

export const pasteAndDrop = (hooks: BehaviorHooks) =>
	EditorView.domEventHandlers({
		paste(e, view) {
			const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
			if (files.length) {
				e.preventDefault();
				void insertImages(view, files, hooks);
				return true;
			}
			// Pasting a link over selected text turns the text into a link.
			const text = e.clipboardData?.getData("text/plain")?.trim() ?? "";
			const sel = view.state.selection.main;
			if (/^https?:\/\/\S+$/.test(text) && !sel.empty) {
				e.preventDefault();
				view.dispatch(view.state.replaceSelection(`[${view.state.sliceDoc(sel.from, sel.to)}](${text})`));
				return true;
			}
			return false;
		},
		drop(e, view) {
			const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
			if (!files.length) return false;
			e.preventDefault();
			void insertImages(view, files, hooks, view.posAtCoords({ x: e.clientX, y: e.clientY }) ?? undefined);
			return true;
		},
	});

// ---- Typewriter scrolling and dimming ----

export const typewriter = ViewPlugin.fromClass(
	class {
		update(u: ViewUpdate) {
			if (!writing.typewriter || !(u.selectionSet || u.docChanged) || !u.view.hasFocus) return;
			const head = u.state.selection.main.head;
			// Scroll after this update finishes; the editor doesn't allow it during one.
			requestAnimationFrame(() => u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: "center" }) }));
		}
	}
);

const dimmed = Decoration.line({ class: "cm-dimmed" });

export const dimOthers = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet = Decoration.none;
		constructor(view: EditorView) {
			this.decorations = this.build(view);
		}
		build(view: EditorView): DecorationSet {
			if (!writing.dimOthers) return Decoration.none;
			const here = blockAt(view.state, view.state.selection.main.head);
			const b = new RangeSetBuilder<Decoration>();
			for (const { from, to } of view.visibleRanges) {
				for (let pos = from; pos <= to; ) {
					const line = view.state.doc.lineAt(pos);
					if (!here || line.to < here.from || line.from > here.to) b.add(line.from, line.from, dimmed);
					pos = line.to + 1;
				}
			}
			return b.finish();
		}
		update(u: ViewUpdate) {
			this.decorations = this.build(u.view);
		}
	},
	{ decorations: (v) => v.decorations }
);
