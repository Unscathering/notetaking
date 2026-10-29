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
import { noteHeader } from "./properties";
import { suggestions, type SuggestHooks } from "./suggest";
import { richBlocks, type BlockHooks } from "./blocks";
import { blockHandles, dimOthers, pasteAndDrop, typewriter, type BehaviorHooks } from "./behaviors";
import { writingHelp, type WritingHelpHooks } from "./writingHelp";
import { liveBlocks, type LiveHooks } from "./liveBlocks";

const highlight = HighlightStyle.define([
	{ tag: t.heading, color: "var(--heading)", fontWeight: "var(--heading-weight)" },
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
	".cm-line": { padding: "0 2px", transition: "opacity var(--dur) var(--ease)" },
	".cm-cursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px", transition: "left 80ms ease-out, top 80ms ease-out" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--accent-soft) !important" },
	".cm-placeholder": { color: "var(--muted)" },
	".cm-h": { color: "var(--heading)", fontFamily: "var(--font-heading)", fontWeight: "var(--heading-weight)", lineHeight: "1.3" },
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
	".cm-banner": { position: "relative", width: "var(--pane-width, 100%)", height: "var(--banner-height)", marginLeft: "calc((100% - var(--pane-width, 100%)) / 2)", marginTop: "calc(-48px * var(--density))", marginBottom: "22px", overflow: "hidden", background: "var(--raised)" },
	".cm-banner img": { width: "100%", height: "100%", objectFit: "cover", opacity: "0", transition: "opacity var(--dur) var(--ease)", maskImage: "linear-gradient(black 55%, transparent)", WebkitMaskImage: "linear-gradient(black 55%, transparent)" },
	".cm-banner.is-loaded": { background: "transparent" },
	".cm-banner.is-loaded img": { opacity: "1" },
	".cm-banner-tools": { position: "absolute", right: "18px", top: "14px", display: "flex", gap: "6px", opacity: "0", transition: "opacity var(--dur) var(--ease)" },
	".cm-banner:hover .cm-banner-tools": { opacity: "1" },
	".cm-banner-tools button, .cm-add-banner": { padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "999px", backgroundColor: "var(--surface-float)", backdropFilter: "blur(10px)", color: "var(--text)", font: "12px var(--font-ui)", cursor: "pointer" },
	".cm-add-banner": { marginLeft: "auto", background: "transparent", backdropFilter: "none", color: "var(--muted)", borderStyle: "dashed", opacity: "0", transition: "opacity var(--dur) var(--ease)" },
	".cm-props:hover .cm-add-banner": { opacity: "1" },
	".cm-add-banner:hover": { color: "var(--text)", borderColor: "var(--accent)" },
	".cm-props": { padding: "0 2px 18px", marginBottom: "6px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-ui)" },
	".cm-props-desc": { width: "100%", padding: "2px 0", border: "0", outline: "0", background: "transparent", color: "var(--muted)", font: "italic 1.02em var(--font-editor)" },
	".cm-props-desc:focus": { color: "var(--text)" },
	".cm-props-tags": { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginTop: "8px" },
	".cm-tag": { display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 9px", borderRadius: "999px", background: "var(--accent-soft)", color: "var(--accent)", fontSize: "0.8em", fontWeight: "600" },
	".cm-tag-x": { border: "0", padding: "0 0 0 2px", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer", opacity: "0.6" },
	".cm-tag-x:hover": { opacity: "1" },
	".cm-tag-add": { width: "70px", padding: "2px 6px", border: "1px dashed var(--border)", borderRadius: "999px", outline: "0", background: "transparent", color: "var(--text)", fontSize: "0.8em" },
	".cm-tag-add:focus": { borderColor: "var(--accent)", width: "120px" },
	".cm-hashtag": { padding: "1px 7px", borderRadius: "999px", background: "var(--accent-soft)", color: "var(--accent)", fontSize: "0.88em", fontWeight: "600" },
	".cm-callout": { padding: "0 16px !important", background: "color-mix(in srgb, var(--callout) 12%, transparent)", borderLeft: "3px solid var(--callout)", "--callout": "var(--link)" },
	".cm-callout-first": { paddingTop: "8px !important", borderTopRightRadius: "var(--radius)", fontWeight: "650", color: "var(--callout)" },
	".cm-callout-last": { paddingBottom: "8px !important", borderBottomRightRadius: "var(--radius)" },
	".cm-callout-tip, .cm-callout-success": { "--callout": "#5fb878" },
	".cm-callout-warning, .cm-callout-question": { "--callout": "#e5a84b" },
	".cm-callout-danger": { "--callout": "#e05d5d" },
	".cm-callout-note, .cm-callout-info": { "--callout": "#5b9bf0" },
	".cm-callout-quote": { "--callout": "var(--muted)" },
	".cm-callout-label": { color: "var(--callout)" },
	".cm-callout, .cm-callout *": { fontStyle: "normal" },
	".cm-table-wrap": { margin: "6px 0 10px", overflowX: "auto" },
	".cm-table": { borderCollapse: "separate", borderSpacing: "0", width: "100%", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", fontSize: "0.95em" },
	".cm-table th, .cm-table td": { padding: "7px 12px", borderBottom: "1px solid var(--border)", borderRight: "1px solid var(--border)", outline: "none", minWidth: "60px", verticalAlign: "top", transition: "background-color var(--dur) var(--ease)" },
	".cm-table th": { background: "var(--raised)", color: "var(--heading)", fontWeight: "650", textAlign: "left" },
	".cm-table tr:last-child td": { borderBottom: "0" },
	".cm-table th:last-child, .cm-table td:last-child": { borderRight: "0" },
	".cm-table td:focus, .cm-table th:focus": { background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1.5px var(--accent)" },
	".cm-table-bar": { display: "flex", gap: "6px", marginTop: "6px", opacity: "0", transition: "opacity var(--dur) var(--ease)" },
	".cm-table-wrap:hover .cm-table-bar, .cm-table-wrap:focus-within .cm-table-bar": { opacity: "1" },
	".cm-table-bar button": { padding: "3px 9px", border: "1px solid var(--border)", borderRadius: "calc(var(--radius) * 0.6)", background: "var(--raised)", color: "var(--muted)", font: "12px var(--font-ui)", cursor: "pointer" },
	".cm-table-bar button:hover": { color: "var(--text)", borderColor: "var(--accent)" },
	".cm-image": { margin: "8px 0", textAlign: "center", cursor: "pointer" },
	".cm-image img": { maxWidth: "100%", maxHeight: "70vh", borderRadius: "var(--radius)", boxShadow: "0 8px 30px rgba(0,0,0,0.25)" },
	".cm-image figcaption": { marginTop: "6px", color: "var(--muted)", fontSize: "0.85em" },
	".cm-image.is-missing": { padding: "18px", border: "1px dashed var(--border)", borderRadius: "var(--radius)", color: "var(--muted)" },
	".cm-image.is-missing::after": { content: "'Image not found'" },
	".cm-block-handle": { position: "absolute", zIndex: "5", display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "1.5em", marginTop: "0.1em", borderRadius: "5px", color: "var(--muted)", opacity: "0", cursor: "grab", transition: "opacity var(--dur) var(--ease), background-color var(--dur) var(--ease)" },
	".cm-block-handle.is-shown": { opacity: "0.7" },
	".cm-block-handle:hover, .cm-block-handle.is-dragging": { opacity: "1", background: "var(--hover)", color: "var(--text)" },
	"&.cm-moving-block, &.cm-moving-block *": { cursor: "grabbing !important" },
	".cm-drop-line": { position: "absolute", zIndex: "5", height: "3px", marginTop: "-1.5px", borderRadius: "3px", background: "var(--accent)", opacity: "0", pointerEvents: "none", transition: "top 80ms ease-out, opacity var(--dur) var(--ease)" },
	".cm-drop-line.is-shown": { opacity: "1" },
	".cm-dimmed": { opacity: "0.3", transition: "opacity var(--dur) var(--ease)" },
	".cm-tooltip.cm-tooltip-autocomplete": { padding: "4px", border: "1px solid var(--border)", borderRadius: "var(--radius)", backgroundColor: "var(--surface-float)", backgroundImage: "var(--glass-grain)", backdropFilter: "var(--float-filter)", boxShadow: "var(--glass-edge), 0 14px 34px rgba(0,0,0,0.35)", fontFamily: "var(--font-ui)" },
	".cm-tooltip-autocomplete > ul": { maxHeight: "300px !important", fontFamily: "var(--font-ui) !important" },
	".cm-tooltip-autocomplete > ul > li": { padding: "6px 10px !important", borderRadius: "calc(var(--radius) * 0.7)", color: "var(--text)", lineHeight: "1.3" },
	".cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "var(--accent-soft) !important", color: "var(--text) !important" },
	".cm-completionDetail": { marginLeft: "12px", color: "var(--muted)", fontStyle: "normal", fontSize: "0.85em" },
	".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)", fontWeight: "650" },
	".cm-completionInfo": { display: "none" },
	".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)", borderColor: "var(--border)" },
	".cm-searchMatch": { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)" },
	".cm-selectionMatch": { backgroundColor: "var(--hover)" },
});

export interface EditorHooks extends SuggestHooks, BlockHooks, BehaviorHooks, WritingHelpHooks {
	onChange(text: string): void;
	openLink(target: string): void;
	live: LiveHooks;
	/** The line the cursor moved to (0-based). */
	onCursor?(line: number): void;
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
		noteHeader(hooks),
		richBlocks(hooks),
		suggestions(hooks),
		blockHandles,
		pasteAndDrop(hooks),
		typewriter,
		dimOthers,
		wikilinkClicks(hooks.openLink),
		writingHelp(hooks),
		liveBlocks(hooks.live),
		look,
		placeholder("Start writing…"),
		keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
		EditorView.updateListener.of((u) => {
			if (u.docChanged) hooks.onChange(u.state.doc.toString());
			if (u.selectionSet || u.docChanged) hooks.onCursor?.(u.state.doc.lineAt(u.state.selection.main.head).number - 1);
		}),
	];
}
