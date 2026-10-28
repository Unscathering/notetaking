<script lang="ts">
	// One editor for all tabs. Each note keeps its own editor state (text, undo
	// history, cursor and scroll), so switching tabs feels instant and nothing is lost.
	import { EditorState } from "@codemirror/state";
	import { EditorView } from "@codemirror/view";
	import { onMount } from "svelte";
	import { EditorSelection } from "@codemirror/state";
	import { editorExtensions } from "./setup";
	import { frontmatterRange } from "../notes";
	import { ws } from "../workspace.svelte";
	import { writing } from "../writing.svelte";

	interface Props {
		path: string;
		text: string;
		onchange: (path: string, text: string) => void;
		onopenlink: (target: string) => void;
	}
	let { path, text, onchange, onopenlink }: Props = $props();

	let host: HTMLDivElement;
	let view: EditorView | null = null;
	const states = new Map<string, { state: EditorState; scroll: number }>();
	let shown = "";

	function stateFor(p: string, initial: string): EditorState {
		const saved = states.get(p);
		if (saved) return saved.state;
		// Start just after the note's properties, so the header shows tidy.
		const start = frontmatterRange(initial)?.to ?? 0;
		return EditorState.create({
			doc: initial,
			selection: { anchor: Math.min(start, initial.length) },
			extensions: editorExtensions({
				onChange: (t) => onchange(p, t),
				openLink: (target) => onopenlink(target),
				noteNames: () => ws.notes.map((n) => n.replace(/\.md$/i, "")),
				pickImage: () => ws.pickImage(),
				saveImage: (bytes, ext) => ws.saveImage(bytes, ext),
				imageUrl: (src) => ws.cave?.fileUrl(src) ?? Promise.resolve(null),
			}),
		});
	}

	onMount(() => {
		view = new EditorView({ parent: host, state: stateFor(path, text) });
		shown = path;
		// Banners stretch across the whole pane, wider than the text column.
		const measure = new ResizeObserver(() => view && view.dom.style.setProperty("--pane-width", `${view.scrollDOM.clientWidth}px`));
		measure.observe(view.scrollDOM);
		view.focus();
		return () => {
			measure.disconnect();
			view?.destroy();
		};
	});

	// Switching notes: keep the old note's state, bring in the new one.
	$effect(() => {
		const p = path, t = text;
		if (!view || p === shown) return;
		states.set(shown, { state: view.state, scroll: view.scrollDOM.scrollTop });
		const next = states.get(p);
		view.setState(stateFor(p, t));
		view.scrollDOM.scrollTop = next?.scroll ?? 0;
		shown = p;
		view.focus();
	});

	// A note changed from outside (for example by the AI): show the new text,
	// keeping undo so Ctrl+Z still brings the old text back.
	$effect(() => {
		const o = ws.outside;
		if (!o || !view) return;
		if (o.path !== shown) return void states.delete(o.path);
		if (view.state.doc.toString() !== o.text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: o.text } });
	});

	// Spell check follows the writing setting.
	$effect(() => {
		const on = writing.spellcheck;
		if (view) view.contentDOM.spellcheck = on;
	});

	// Jump to a line, for example from a search result.
	$effect(() => {
		const r = ws.reveal;
		if (!view || !r || r.path !== path || shown !== path) return;
		const line = view.state.doc.line(Math.min(r.line + 1, view.state.doc.lines));
		view.dispatch({ selection: EditorSelection.cursor(line.from), effects: EditorView.scrollIntoView(line.from, { y: "center" }) });
		view.focus();
		ws.reveal = null;
	});

	/** Forget a note's state, for example when its tab closes. */
	export function forget(p: string) {
		states.delete(p);
	}
</script>

<div class="editor" bind:this={host}></div>

<style>
	.editor {
		height: 100%;
		min-height: 0;
	}
</style>
