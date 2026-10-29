<script lang="ts">
	// One editor for all tabs. Each note keeps its own editor state (text, undo
	// history, cursor and scroll), so switching tabs feels instant and nothing is lost.
	import { EditorState, Transaction } from "@codemirror/state";
	import { EditorView } from "@codemirror/view";
	import { onMount } from "svelte";
	import { EditorSelection } from "@codemirror/state";
	import { editorExtensions, viewMode, viewing } from "./setup";
	import { frontmatterRange } from "../notes";
	import { isView, ws } from "../workspace.svelte";
	import { noteTitle } from "../cave";
	import { writing } from "../writing.svelte";
	import { helpHooks } from "../ai/writer";
	import { activeEditor } from "./active";
	import { liveHooksFor } from "../liveHooks";
	import { refreshLive } from "./liveBlocks";
	import { readProps } from "../notes";

	interface Props {
		path: string;
		text: string;
		onchange: (path: string, text: string) => void;
		onopenlink: (target: string, newTab?: boolean) => void;
	}
	let { path, text, onchange, onopenlink }: Props = $props();

	let host: HTMLDivElement;
	let view: EditorView | null = null;
	const states = new Map<string, { state: EditorState; scroll: number }>();
	let shown = "";

	/**
	 * Where each note's editor state saves to. Renaming a note moves its entry,
	 * so the state (undo, cursor) carries on under the new name.
	 */
	const homes = new Map<string, { p: string }>();

	function stateFor(p: string, initial: string): EditorState {
		const saved = states.get(p);
		if (saved) return saved.state;
		const home = { p };
		homes.set(p, home);
		// Start just after the note's properties, so the header shows tidy.
		const start = frontmatterRange(initial)?.to ?? 0;
		return EditorState.create({
			doc: initial,
			selection: { anchor: Math.min(start, initial.length) },
			extensions: editorExtensions({
				onChange: (t) => onchange(home.p, t),
				openLink: (target, newTab) => onopenlink(target, newTab),
				noteNames: () => ws.notes.map((n) => n.replace(/\.md$/i, "")),
				pickImage: () => ws.pickImage(),
				saveImage: (bytes, ext) => ws.saveImage(bytes, ext),
				imageUrl: (src) => ws.cave?.fileUrl(src) ?? Promise.resolve(null),
				...helpHooks,
				live: liveHooksFor(() => home.p),
				onCursor: (line) => (ws.cursorLine = line),
				onSelection: (n) => (ws.selectedWords = n),
				peek: (target) => {
					const found = ws.resolve(target);
					if (!found) return null;
					const t = ws.texts.get(found) ?? "";
					const body = t.slice(frontmatterRange(t)?.to ?? 0).replace(/^\s+/, "").replace(/^#\s+.*\n+/, "").replace(/```basalt[\s\S]*?```/g, "").slice(0, 700);
					return { title: noteTitle(found), text: body };
				},
				title:
					writing.inlineTitle && !isView(p)
						? {
								get name() {
									return noteTitle(home.p);
								},
								rename: (name) => void renameFromTitle(home.p, name),
								renameQuietly: (name) => void ws.rename(home.p, name),
								fresh: () => ws.takeFresh(home.p),
							}
						: undefined,
			}, ws.isViewing(p)),
		});
	}

	// A renamed note keeps its editor state (and the editor stays put if it's showing).
	function moved(from: string, to: string) {
		const swap = (k: string) => (k === from ? to : k.startsWith(`${from}/`) ? to + k.slice(from.length) : k);
		for (const [k, home] of [...homes]) {
			const n = swap(k);
			if (n === k) continue;
			homes.delete(k);
			homes.set(n, home);
			home.p = n;
			const st = states.get(k);
			states.delete(k);
			if (st) states.set(n, st);
		}
		shown = swap(shown);
	}
	ws.hooks.renamed.push(moved);

	/**
	 * Renames a note from its inline title. A first heading that matched the old
	 * name (as notes used to start) changes with it, so the two never disagree.
	 */
	async function renameFromTitle(p: string, name: string) {
		const text = ws.texts.get(p) ?? "";
		const start = frontmatterRange(text)?.to ?? 0;
		const body = text.slice(start);
		const lead = body.length - body.trimStart().length;
		const line = body.slice(lead).split("\n", 1)[0];
		if (line.trimEnd() === `# ${noteTitle(p)}`) {
			const at = start + lead;
			await ws.writeNote(p, text.slice(0, at) + `# ${name}` + text.slice(at + line.length));
		}
		await ws.rename(p, name);
	}

	onMount(() => {
		view = new EditorView({ parent: host, state: stateFor(path, text) });
		activeEditor.view = view;
		mounted = true;
		// Commands (like writing help) act on whichever pane you were last in.
		view.contentDOM.addEventListener("focus", () => (activeEditor.view = view));
		shown = path;
		// Banners stretch across the whole pane, wider than the text column.
		const measure = new ResizeObserver(() => view && view.dom.style.setProperty("--pane-width", `${view.scrollDOM.clientWidth}px`));
		measure.observe(view.scrollDOM);
		view.focus();
		return () => {
			ws.hooks.renamed.splice(ws.hooks.renamed.indexOf(moved), 1);
			measure.disconnect();
			if (activeEditor.view === view) activeEditor.view = null;
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
		if (view.state.doc.toString() !== o.text) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: o.text }, annotations: Transaction.remote.of(true) });
	});

	// Many notes changed at once (a restored backup): forget every kept state and show the new text.
	$effect(() => {
		const n = ws.reloaded;
		if (!n || !view) return;
		states.clear();
		const t = ws.texts.get(shown);
		if (t != null) view.setState(stateFor(shown, t));
	});

	// The same note changed somewhere else (the other pane, a live block, the AI) while this
	// editor isn't the one being typed in: show the new text.
	$effect(() => {
		const t = ws.texts.get(path);
		if (!mounted || !view || t == null || shown !== path || view.hasFocus) return;
		if (view.state.doc.toString() !== t) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t }, annotations: Transaction.remote.of(true) });
	});

	// Live blocks and embeds redraw when any note changes (a moment later, not on every key).
	let liveTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		for (const t of ws.texts.values()) void t;
		void ws.meta.looks;
		clearTimeout(liveTimer);
		liveTimer = setTimeout(() => {
			const doc = view?.state.doc.toString() ?? "";
			if (view && (doc.includes("```basalt") || doc.includes("![["))) view.dispatch({ effects: refreshLive.of(Date.now()) });
		}, 300);
	});

	let noteClasses: string[] = [];
	let mounted = $state(false);
	// `cssclass: dashboard` (or cssclasses) in a note's properties: classes around its editor, for snippets
	// (`dashboard` and `note-dashboard`).
	$effect(() => {
		if (!mounted) return;
		const props = readProps(ws.texts.get(path) ?? text);
		const names = `${props.other.cssclass ?? ""} ${props.other.cssclasses ?? ""}`.split(/[\s,\[\]]+/).map((c) => c.replace(/["']/g, "")).filter((c) => /^[\w-]+$/.test(c));
		const classes = [...new Set(names.flatMap((c) => [c, c.startsWith("note-") ? c : `note-${c}`]))];
		// On the wrapper: CodeMirror manages the editor element's own classes.
		host.classList.remove(...noteClasses);
		host.classList.add(...classes);
		noteClasses = classes;
		host.dataset.cssclass = classes.join(" ");
		// A dashboard's own color (its accent property), for looks like Komorebi to use.
		const accent = /^#[0-9a-f]{6}$/i.test(props.other.accent ?? "") ? props.other.accent! : "";
		const vars = ["--k-accent", "--k-accent-2", "--k-glow", "--k-surface", "--k-overlay", "--k-raised", "--k-border", "--k-border-hover", "--k-text", "--k-muted", "--k-deep", "--note-accent"];
		for (const v of vars) host.style.removeProperty(v);
		if (accent) {
			const c = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));
			// The whole look follows the color: dark glass tinted with it, its light shade for text.
			const mix = (t: number, toward: number[]) => c.map((v, i) => Math.round(v * t + toward[i] * (1 - t))).join(", ");
			const night = [10, 10, 18], day = [240, 240, 245];
			host.style.setProperty("--k-accent", `rgb(${mix(0.55, day)})`);
			host.style.setProperty("--k-accent-2", accent);
			host.style.setProperty("--k-glow", c.join(", "));
			host.style.setProperty("--k-surface", `rgba(${mix(0.16, night)}, 0.46)`);
			host.style.setProperty("--k-overlay", `rgba(${mix(0.22, night)}, 0.32)`);
			host.style.setProperty("--k-raised", `rgba(${mix(0.38, night)}, 0.36)`);
			host.style.setProperty("--k-border", `rgba(${mix(0.6, day)}, 0.18)`);
			host.style.setProperty("--k-border-hover", `rgba(${mix(0.3, day)}, 0.48)`);
			host.style.setProperty("--k-text", `rgb(${mix(0.12, day)})`);
			host.style.setProperty("--k-muted", `rgb(${mix(0.35, [150, 150, 160])})`);
			host.style.setProperty("--k-deep", mix(0.1, [4, 4, 8]));
			host.style.setProperty("--note-accent", accent);
		}
	});

	// View mode: read only and tidy (see setup.ts), and a class for the styles that hide empty bits.
	$effect(() => {
		const on = ws.isViewing(path);
		if (!mounted || !view || shown !== path) return;
		if (view.state.readOnly !== on) view.dispatch({ effects: viewMode.reconfigure(viewing(on)) });
		host.classList.toggle("is-reading", on);
	});

	// Turning the inline title on or off: every note's editor is made again.
	let titles = writing.inlineTitle;
	$effect(() => {
		const on = writing.inlineTitle;
		if (on === titles || !view) return;
		titles = on;
		states.clear();
		view.setState(stateFor(shown, view.state.doc.toString()));
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
