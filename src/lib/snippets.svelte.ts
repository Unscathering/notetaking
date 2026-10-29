// CSS snippets: little stylesheets that change how Basalt looks, beyond what
// the Appearance window offers. They're plain .css files in the cave's
// .basalt/snippets folder (so they travel with the cave and can be shared as
// files); each can be turned on or off. Notes with `cssclass: something` in
// their properties get that class on their editor, so a snippet can style just
// those notes (like a dashboard). MODDING.md lists the classes and variables.
import { ws } from "./workspace.svelte";
import { KOMOREBI_CSS } from "./komorebi";

export const SNIPPET_DIR = ".basalt/snippets";

export const snippets = $state({ names: [] as string[], texts: {} as Record<string, string> });

const on = () => ws.meta.snippets ?? [];

/** Reads the snippets folder and applies the ones that are on. */
/** Fingerprints of the Komorebi snippet as earlier versions wrote it (0.18.0). */
const OLD_KOMOREBI = [0x7dfdb796];
function hash(text: string) {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
	return h;
}

export async function loadSnippets() {
	const cave = ws.cave;
	if (!cave) return;
	const names = (await cave.listDir(SNIPPET_DIR)).filter((n) => n.endsWith(".css")).sort();
	const texts: Record<string, string> = {};
	for (const n of names) texts[n] = await cave.read(`${SNIPPET_DIR}/${n}`);
	// The Komorebi snippet as an older Basalt made it, never edited: bring it up to date.
	if (texts["komorebi.css"] && OLD_KOMOREBI.includes(hash(texts["komorebi.css"].trim()))) {
		texts["komorebi.css"] = KOMOREBI_CSS;
		await cave.write(`${SNIPPET_DIR}/komorebi.css`, KOMOREBI_CSS);
	}
	snippets.names = names;
	snippets.texts = texts;
	apply();
}

/** Puts the snippets that are on into the page, in name order. */
export function apply() {
	const want = new Set(on().filter((n) => n in snippets.texts));
	for (const tag of document.querySelectorAll<HTMLStyleElement>("style[data-snippet]")) if (!want.has(tag.dataset.snippet!)) tag.remove();
	for (const name of snippets.names) {
		if (!want.has(name)) continue;
		let tag = document.querySelector<HTMLStyleElement>(`style[data-snippet="${CSS.escape(name)}"]`);
		if (!tag) {
			tag = document.createElement("style");
			tag.dataset.snippet = name;
			document.head.append(tag);
		}
		if (tag.textContent !== snippets.texts[name]) tag.textContent = snippets.texts[name];
	}
}

export async function toggleSnippet(name: string, enabled: boolean) {
	ws.meta.snippets = enabled ? [...new Set([...on(), name])] : on().filter((n) => n !== name);
	await ws.saveMeta();
	apply();
}

/** Saves a snippet's text and shows the change straight away. */
export async function saveSnippet(name: string, css: string) {
	snippets.texts[name] = css;
	if (!snippets.names.includes(name)) snippets.names = [...snippets.names, name].sort();
	apply();
	await ws.cave?.write(`${SNIPPET_DIR}/${name}`, css);
}

export async function newSnippet(base = "my-snippet", css = STARTER) {
	let name = `${base}.css`;
	for (let n = 2; snippets.names.includes(name); n++) name = `${base}-${n}.css`;
	await saveSnippet(name, css);
	await toggleSnippet(name, true);
	return name;
}

/** Adds one of the examples and turns it on, unless a snippet by that name is there already. */
export async function useExample(name: string) {
	await loadSnippets();
	if (snippets.names.some((n) => n.replace(/(-\d+)?\.css$/, "") === name)) return;
	const ex = EXAMPLES.find((e) => e.name === name);
	if (ex) await newSnippet(name, ex.css);
}

export async function deleteSnippet(name: string) {
	await ws.cave?.remove(`${SNIPPET_DIR}/${name}`);
	delete snippets.texts[name];
	snippets.names = snippets.names.filter((n) => n !== name);
	await toggleSnippet(name, false);
}

const STARTER = `/* A CSS snippet. Changes show as you type.
   Theme colors: var(--accent), var(--text), var(--muted), var(--bg), var(--raised), var(--border)
   Notes with "cssclass: dashboard" in their properties match .note-dashboard
   See MODDING.md for every class you can style. */

.cm-content h1 {
  /* color: var(--accent); */
}
`;

/** Ready-made snippets to start from (and to learn from). */
export const EXAMPLES: Array<{ name: string; about: string; css: string }> = [
	{
		name: "komorebi",
		about: "Frosted glass dashboard tiles with // labels, a clock header and tiles that breathe. For notes with cssclass: dashboard komorebi (add a color way: sakura, matcha, ember, glacier, mono).",
		css: KOMOREBI_CSS,
	},
	{
		name: "dashboard",
		about: "For notes with cssclass: dashboard. Wide, no properties header, big titles, roomy cards.",
		css: `/* Dashboard notes: add "cssclass: dashboard" to a note's properties. */
.note-dashboard .cm-content {
  max-width: 1100px;
}
.note-dashboard .cm-props {
  display: none;
}
.note-dashboard .cm-h1 {
  font-size: 2.4em;
  letter-spacing: -0.02em;
}
.note-dashboard .basalt-block {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.4);
  background: color-mix(in srgb, var(--raised) 55%, transparent);
}
.note-dashboard .basalt-cards {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.note-dashboard .basalt-count {
  color: var(--accent);
}
`,
	},
	{
		name: "accent-headings",
		about: "Headings in your accent color, with a soft underline.",
		css: `.cm-content .cm-h1, .cm-content .cm-h2 {
  color: var(--accent);
}
.cm-content .cm-h2 {
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  padding-bottom: 4px;
}
`,
	},
	{
		name: "big-checkboxes",
		about: "Larger, rounder checkboxes for task lists.",
		css: `.cm-task {
  width: 1.25em !important;
  height: 1.25em !important;
  border-radius: 50% !important;
}
`,
	},
	{
		name: "quiet-sidebar",
		about: "A calmer sidebar: smaller, lighter names until you hover it.",
		css: `.sidebar {
  opacity: 0.7;
  transition: opacity var(--dur) var(--ease);
}
.sidebar:hover {
  opacity: 1;
}
`,
	},
];
