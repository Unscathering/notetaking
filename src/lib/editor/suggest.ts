// Pop-up suggestions while writing: the "/" menu of things to insert, and note
// names after "[[".
import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";

export interface SuggestHooks {
	noteNames(): string[];
	/** Asks for an image file, saves it in the cave and returns its path. */
	pickImage(): Promise<string | null>;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Replaces the typed "/word" with `text`, putting the cursor at `|` if there is one. */
function insert(text: string) {
	return (view: EditorView, _c: Completion, from: number, to: number) => {
		const cursor = text.indexOf("|");
		const clean = text.replace("|", "");
		view.dispatch({ changes: { from, to, insert: clean }, selection: { anchor: from + (cursor < 0 ? clean.length : cursor) } });
	};
}

const BLOCKS: Array<{ label: string; detail: string; text: string; keywords?: string }> = [
	{ label: "Heading 1", detail: "Big title", text: "# |", keywords: "h1 title" },
	{ label: "Heading 2", detail: "Section", text: "## |", keywords: "h2" },
	{ label: "Heading 3", detail: "Small section", text: "### |", keywords: "h3" },
	{ label: "Bullet list", detail: "• item", text: "- |", keywords: "ul unordered" },
	{ label: "Numbered list", detail: "1. item", text: "1. |", keywords: "ol ordered" },
	{ label: "Checklist", detail: "☐ task", text: "- [ ] |", keywords: "todo task checkbox" },
	{ label: "Quote", detail: "❝", text: "> |", keywords: "blockquote" },
	{ label: "Callout: note", detail: "Blue box", text: "> [!note] |\n> ", keywords: "info admonition" },
	{ label: "Callout: tip", detail: "Green box", text: "> [!tip] |\n> ", keywords: "hint admonition" },
	{ label: "Callout: warning", detail: "Orange box", text: "> [!warning] |\n> ", keywords: "caution admonition" },
	{ label: "Code block", detail: "```", text: "```\n|\n```", keywords: "pre snippet" },
	{ label: "Table", detail: "3 × 2", text: "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| | | |\n", keywords: "grid" },
	{ label: "Divider", detail: "———", text: "---\n|", keywords: "hr rule line" },
	{ label: "Link to a note", detail: "[[ ]]", text: "[[|]]", keywords: "wiki" },
	{ label: "Embed a note", detail: "![[ ]]", text: "![[|]]", keywords: "transclude include show" },
	{ label: "Live list of notes", detail: "basalt", text: "```basalt\nfrom: |\nshow: list\n```", keywords: "query dataview dashboard folder" },
	{ label: "Live cards", detail: "basalt", text: "```basalt\nfrom: |\nshow: cards\n```", keywords: "query dataview dashboard gallery" },
	{ label: "Live table", detail: "basalt", text: "```basalt\nfrom: |\nshow: table\ncolumns: status\n```", keywords: "query dataview dashboard database" },
	{ label: "Open tasks", detail: "basalt", text: "```basalt\nlist: tasks|\n```", keywords: "query todo dashboard checklist" },
	{ label: "Habit tracker", detail: "basalt", text: "```basalt\nlist: habits\ndays: 28|\n```", keywords: "habits streak tracker routine" },
	{ label: "Links to this note", detail: "basalt", text: "```basalt\nlist: backlinks|\n```", keywords: "backlinks query" },
	{ label: "Today's date", detail: "", text: "", keywords: "date now" },
];

function slashMenu(hooks: SuggestHooks) {
	return (ctx: CompletionContext): CompletionResult | null => {
		// "/" at the start of a line or after a space.
		const m = ctx.matchBefore(/(?:^|\s)\/[\w ]*$/);
		if (!m) return null;
		const slash = m.from + m.text.indexOf("/");
		const query = m.text.slice(m.text.indexOf("/") + 1).trim().toLowerCase();
		const items = [...BLOCKS, { label: "Image", detail: "from a file", text: "", keywords: "picture photo" }];
		const words = (b: (typeof items)[number]) => `${b.label} ${b.keywords ?? ""}`.toLowerCase().split(/[\s:]+/);
		const options: Completion[] = items
			.filter((b) => !query || words(b).some((w) => w.startsWith(query)) || b.label.toLowerCase().includes(query))
			.map((b) => ({
				label: b.label,
				detail: b.label === "Today's date" ? today() : b.detail,
				type: "text",
				apply:
					b.label === "Image"
						? (view: EditorView, _c: Completion, f: number, t: number) => {
								view.dispatch({ changes: { from: f, to: t, insert: "" } });
								void hooks.pickImage().then((path) => path && view.dispatch(view.state.replaceSelection(`![](${encodeURI(path)})\n`)));
							}
						: insert(b.label === "Today's date" ? today() : b.text),
			}));
		// Typing on past what matches nothing closes the menu.
		if (!options.length) return null;
		return { from: slash, options, filter: false };
	};
}

function noteLinks(hooks: SuggestHooks) {
	return (ctx: CompletionContext): CompletionResult | null => {
		const m = ctx.matchBefore(/\[\[[^\]\n]*$/);
		if (!m) return null;
		const after = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2);
		return {
			from: m.from + 2,
			options: hooks.noteNames().map((name) => ({
				label: name,
				type: "file",
				apply: (view: EditorView, _c: Completion, from: number, to: number) => {
					// Finish the link, using the "]]" already there if the editor added one.
					view.dispatch({ changes: { from, to: after === "]]" ? to + 2 : to, insert: `${name}]]` }, selection: { anchor: from + name.length + 2 } });
				},
			})),
			validFor: /^[^\]\n]*$/,
		};
	};
}

export const suggestions = (hooks: SuggestHooks) =>
	autocompletion({ override: [slashMenu(hooks), noteLinks(hooks)], icons: false, closeOnBlur: true, activateOnTyping: true, maxRenderedOptions: 30 });
