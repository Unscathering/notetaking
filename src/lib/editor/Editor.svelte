<script lang="ts">
	// One editor for all tabs. Each note keeps its own editor state (text, undo
	// history, cursor and scroll), so switching tabs feels instant and nothing is lost.
	import { EditorState } from "@codemirror/state";
	import { EditorView } from "@codemirror/view";
	import { onMount } from "svelte";
	import { editorExtensions } from "./setup";

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
		return EditorState.create({
			doc: initial,
			extensions: editorExtensions({ onChange: (t) => onchange(p, t), openLink: (target) => onopenlink(target) }),
		});
	}

	onMount(() => {
		view = new EditorView({ parent: host, state: stateFor(path, text) });
		shown = path;
		view.focus();
		return () => view?.destroy();
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
