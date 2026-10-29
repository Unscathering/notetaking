// The note header: instead of the raw `---` properties block, a note shows its
// description and tags as a tidy header you can edit directly. Clicking into
// the block's lines (or pressing Up from the first line) shows the raw text again.
import { StateField, type EditorState, type Transaction } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { frontmatterRange, readProps, writeProps, type NoteProps } from "../notes";

export interface HeaderHooks {
	imageUrl(path: string): Promise<string | null>;
	pickImage(): Promise<string | null>;
}

/**
 * Changes the note's properties, leaving the rest of the note alone. Runs a
 * moment later, from the note's latest text, because a header input can lose
 * focus (and save) while the editor is busy redrawing it.
 */
function updateProps(view: EditorView, change: (current: NoteProps, ownTags: string[]) => NoteProps) {
	window.setTimeout(() => {
		const text = view.state.doc.toString();
		const fm = frontmatterRange(text);
		const body = fm ? text.slice(fm.to) : text;
		const current = readProps(text);
		const bodyTags = readProps(body).tags;
		const next = writeProps(text, change(current, current.tags.filter((t) => !bodyTags.includes(t))));
		const insert = next.slice(0, next.length - body.length);
		if (insert !== text.slice(0, fm ? fm.to : 0)) view.dispatch({ changes: { from: 0, to: fm ? fm.to : 0, insert } });
	});
}

class PropsWidget extends WidgetType {
	constructor(private props: NoteProps, private bodyTags: string[], private hooks: HeaderHooks, private reading = false) {
		super();
	}

	eq(other: PropsWidget) {
		return JSON.stringify(other.props) === JSON.stringify(this.props) && other.bodyTags.join() === this.bodyTags.join() && other.reading === this.reading;
	}

	toDOM(view: EditorView) {
		const root = document.createElement("div");
		root.className = "cm-props";
		// Nothing to show in view mode: no banner, description or tags.
		if (!this.props.banner && !this.props.description && !this.props.tags.length) root.classList.add("is-empty");
		const pickBanner = async () => {
			const path = await this.hooks.pickImage();
			if (path) updateProps(view, (p, own) => ({ ...p, tags: own, banner: path }));
		};

		if (this.props.banner) {
			const src = this.props.banner;
			const banner = document.createElement("div");
			banner.className = "cm-banner";
			const img = document.createElement("img");
			img.alt = "";
			img.onload = () => banner.classList.add("is-loaded");
			if (/^(https?:|data:)/.test(src)) img.src = src;
			else void this.hooks.imageUrl(decodeURI(src)).then((url) => url && (img.src = url));
			const tools = document.createElement("div");
			tools.className = "cm-banner-tools";
			const tool = (label: string, fn: () => void) => {
				const b = document.createElement("button");
				b.textContent = label;
				b.addEventListener("mousedown", (e) => {
					e.preventDefault();
					fn();
				});
				tools.append(b);
			};
			tool("Change banner", () => void pickBanner());
			tool("Remove", () => updateProps(view, (p, own) => ({ ...p, tags: own, banner: undefined })));
			banner.append(img, tools);
			root.append(banner);
			root.classList.add("has-banner");
		}

		const desc = document.createElement("input");
		desc.className = "cm-props-desc";
		desc.placeholder = "Add a description…";
		desc.value = this.props.description ?? "";
		desc.readOnly = view.state.readOnly;
		const saveDesc = () => {
			const value = desc.value.trim();
			if (value === (this.props.description ?? "")) return;
			updateProps(view, (p, own) => ({ ...p, tags: own, description: value || undefined }));
		};
		desc.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === "ArrowDown") {
				e.preventDefault();
				saveDesc();
				view.focus();
			}
		});
		desc.addEventListener("blur", saveDesc);
		root.append(desc);

		const tags = document.createElement("div");
		tags.className = "cm-props-tags";
		const own = this.props.tags.filter((t) => !this.bodyTags.includes(t));
		for (const tag of this.props.tags) {
			const chip = document.createElement("span");
			chip.className = "cm-tag";
			chip.textContent = `#${tag}`;
			if (own.includes(tag)) {
				const x = document.createElement("button");
				x.className = "cm-tag-x";
				x.textContent = "×";
				x.title = `Remove #${tag}`;
				x.addEventListener("mousedown", (e) => {
					e.preventDefault();
					updateProps(view, (p, mine) => ({ ...p, tags: mine.filter((t) => t !== tag) }));
				});
				chip.append(x);
			} else chip.title = "Written in the note's text";
			tags.append(chip);
		}
		const add = document.createElement("input");
		add.className = "cm-tag-add";
		add.placeholder = "+ tag";
		add.addEventListener("keydown", (e) => {
			if (e.key !== "Enter" && e.key !== "," && e.key !== " ") return;
			e.preventDefault();
			const tag = add.value.trim().replace(/^#/, "").toLowerCase();
			if (tag && !this.props.tags.includes(tag)) updateProps(view, (p, mine) => ({ ...p, tags: [...mine, tag] }));
			add.value = "";
		});
		tags.append(add);
		if (!this.props.banner) {
			const addBanner = document.createElement("button");
			addBanner.className = "cm-add-banner";
			addBanner.textContent = "+ Banner";
			addBanner.title = "Add a banner picture to the top of this note";
			addBanner.addEventListener("mousedown", (e) => {
				e.preventDefault();
				void pickBanner();
			});
			tags.append(addBanner);
		}
		root.append(tags);
		return root;
	}

	ignoreEvent() {
		return true;
	}
}

function decorate(state: EditorState, hooks: HeaderHooks): DecorationSet {
	const text = state.doc.toString();
	const fm = frontmatterRange(text);
	const props = readProps(text);
	const bodyTags = readProps(fm ? text.slice(fm.to) : text).tags;
	const widget = new PropsWidget(props, bodyTags, hooks, state.readOnly);
	if (!fm) return Decoration.set([Decoration.widget({ widget, block: true, side: -1 }).range(0)]);
	// Show the raw block while the cursor is inside it.
	const sel = state.selection.main;
	if (!state.readOnly && sel.from < fm.to - 1) return Decoration.none;
	return Decoration.set([Decoration.replace({ widget, block: true }).range(0, fm.to - 1)]);
}

export const noteHeader = (hooks: HeaderHooks) =>
	StateField.define<DecorationSet>({
		create: (state) => decorate(state, hooks),
		update(value: DecorationSet, tr: Transaction) {
			return tr.docChanged || tr.selection || tr.startState.readOnly !== tr.state.readOnly ? decorate(tr.state, hooks) : value;
		},
		provide: (f) => EditorView.decorations.from(f),
	});

/** Where the note's own text starts, after its properties block. */
export const bodyStart = (state: EditorState) => frontmatterRange(state.doc.toString())?.to ?? 0;
