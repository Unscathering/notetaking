// Everything the editor is made of: Markdown language support, live preview,
// keyboard shortcuts and a look that comes entirely from the theme's variables.
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting, indentOnInput, bracketMatching } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, dropCursor, keymap, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { livePreview, wikilinkClicks } from "./livePreview";

const highlight = HighlightStyle.define([
	{ tag: t.heading, color: "var(--heading)", fontWeight: "700" },
	{ tag: t.strong, fontWeight: "700" },
	{ tag: t.emphasis, fontStyle: "italic" },
	{ tag: t.strikethrough, textDecoration: "line-through", color: "var(--muted)" },
	{ tag: [t.link, t.url], color: "var(--link)" },
	{ tag: t.monospace, fontFamily: "var(--font-code)", color: "var(--code)" },
	{ tag: t.quote, color: "var(--muted)", fontStyle: "italic" },
	{ tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--muted)" },
	// Code inside fenced blocks.
	{ tag: [t.keyword, t.operatorKeyword], color: "var(--accent)" },
	{ tag: [t.string, t.special(t.string)], color: "var(--link)" },
	{ tag: [t.comment], color: "var(--muted)", fontStyle: "italic" },
	{ tag: [t.number, t.bool, t.null], color: "var(--code)" },
	{ tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--heading)" },
]);

const look = EditorView.theme({
	"&": { height: "100%", color: "var(--text)", backgroundColor: "transparent", fontSize: "var(--text-size)" },
	"&.cm-focused": { outline: "none" },
	".cm-scroller": { fontFamily: "var(--font-editor)", lineHeight: "var(--line-height)", overflow: "auto" },
	".cm-content": {
		maxWidth: "var(--text-width)",
		margin: "0 auto",
		padding: "calc(48px * var(--density)) calc(28px * var(--density)) 40vh",
		caretColor: "var(--accent)",
	},
	".cm-line": { padding: "0 2px" },
	".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px", transition: "left 80ms ease-out, top 80ms ease-out" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
	".cm-placeholder": { color: "var(--muted)" },
	".cm-h": { color: "var(--heading)", fontWeight: "700", lineHeight: "1.3" },
	".cm-h1": { fontSize: "calc(1em * var(--heading-scale) * var(--heading-scale) * var(--heading-scale))", paddingTop: "0.4em", letterSpacing: "-0.015em" },
	".cm-h2": { fontSize: "calc(1em * var(--heading-scale) * var(--heading-scale))", paddingTop: "0.6em" },
	".cm-h3": { fontSize: "calc(1em * var(--heading-scale))", paddingTop: "0.5em" },
	".cm-h4, .cm-h5, .cm-h6": { fontSize: "1em", paddingTop: "0.4em" },
	".cm-quote": { borderLeft: "3px solid var(--accent)", paddingLeft: "14px !important", color: "var(--muted)" },
	".cm-codeblock": { backgroundColor: "var(--raised)", fontFamily: "var(--font-code)", fontSize: "0.9em", padding: "0 14px !important" },
	".cm-code-first": { borderTopLeftRadius: "var(--radius)", borderTopRightRadius: "var(--radius)", paddingTop: "6px !important" },
	".cm-code-last": { borderBottomLeftRadius: "var(--radius)", borderBottomRightRadius: "var(--radius)", paddingBottom: "6px !important" },
	".cm-code-label": { float: "right", lineHeight: "2", fontFamily: "var(--font-ui)", fontSize: "0.75em", color: "var(--muted)", textTransform: "lowercase", letterSpacing: "0.04em" },
	".cm-wikilink, .cm-link-text": { color: "var(--link)", textDecoration: "underline", textDecorationColor: "color-mix(in srgb, var(--link) 40%, transparent)", textUnderlineOffset: "3px", cursor: "pointer", transition: "text-decoration-color var(--dur) var(--ease)" },
	".cm-wikilink:hover": { textDecorationColor: "var(--link)" },
	".cm-bullet": { color: "var(--accent)", fontWeight: "700", padding: "0 0.25em" },
	".cm-task": {
		display: "inline-block", width: "1em", height: "1em", verticalAlign: "-0.15em", marginRight: "0.35em",
		border: "2px solid var(--muted)", borderRadius: "calc(var(--radius) * 0.5)", cursor: "pointer",
		transition: "background-color var(--dur) var(--ease), border-color var(--dur) var(--ease), transform var(--dur) var(--ease)",
	},
	".cm-task:hover": { borderColor: "var(--accent)", transform: "scale(1.08)" },
	".cm-task.is-done": {
		backgroundColor: "var(--accent)", borderColor: "var(--accent)",
		backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
		backgroundSize: "85%", backgroundPosition: "center", backgroundRepeat: "no-repeat",
	},
	".cm-task-done": { color: "var(--muted)", textDecoration: "line-through" },
	".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)", borderColor: "var(--border)" },
	".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)" },
	".cm-selectionMatch": { backgroundColor: "var(--hover)" },
});

export interface EditorHooks {
	onChange(text: string): void;
	openLink(target: string): void;
}

export function editorExtensions(hooks: EditorHooks): Extension[] {
	return [
		history(),
		drawSelection(),
		dropCursor(),
		indentOnInput(),
		bracketMatching(),
		highlightSelectionMatches(),
		search({ top: true }),
		EditorView.lineWrapping,
		EditorState.allowMultipleSelections.of(true),
		markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
		syntaxHighlighting(highlight),
		livePreview,
		wikilinkClicks(hooks.openLink),
		look,
		placeholder("Start writing…"),
		keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
		EditorView.updateListener.of((u) => {
			if (u.docChanged) hooks.onChange(u.state.doc.toString());
		}),
	];
}
