// The gallery: snippets, themes and dashboards people share, kept in the
// `gallery` folder of Basalt's GitHub repository (gallery/gallery.json lists
// them). Installing copies one into the cave: a snippet into
// .basalt/snippets (turned on), a theme into the app's look, a dashboard as a
// note (with the snippet it needs). Anyone can add theirs with a pull request.
import { PRESETS, cloneTheme, type Theme } from "./theme/theme";
import { theme, useTheme } from "./theme/store.svelte";
import { newSnippet, snippets } from "./snippets.svelte";
import { ws } from "./workspace.svelte";

const BASE = "https://raw.githubusercontent.com/Unscathering/notetaking/main/gallery/";
/** For trying it against another copy (a browser preview, a fork). */
const base = () => localStorage.getItem("basalt.gallery-url") ?? BASE;

export interface Entry {
	id: string;
	name: string;
	about: string;
	author: string;
	file: string;
	/** Themes: colors to preview. */
	swatch?: string[];
	/** Dashboards: a snippet they look best with. */
	snippet?: string;
}

export interface Gallery {
	about: string;
	snippets: Entry[];
	themes: Entry[];
	dashboards: Entry[];
}

export const gallery = $state({ data: null as Gallery | null, error: "", loading: false });

async function get(file: string) {
	const res = await fetch(base() + file, { cache: "no-cache" });
	if (!res.ok) throw new Error(`The gallery said ${res.status}.`);
	return res.text();
}

export async function loadGallery() {
	if (gallery.loading) return;
	gallery.loading = true;
	gallery.error = "";
	try {
		gallery.data = JSON.parse(await get("gallery.json")) as Gallery;
	} catch (e) {
		gallery.error = `Couldn't load the gallery. Check your internet connection. (${e instanceof Error ? e.message : String(e)})`;
	} finally {
		gallery.loading = false;
	}
}

const fileName = (e: Entry) => e.file.split("/").pop()!;
export const hasSnippet = (e: Entry) => snippets.names.includes(fileName(e));

export async function installSnippet(e: Entry) {
	if (hasSnippet(e)) return;
	await newSnippet(fileName(e).replace(/\.css$/, ""), await get(e.file));
}

/** A gallery theme: a built-in theme to start from, plus its own changes. */
export async function installTheme(e: Entry) {
	const t = JSON.parse(await get(e.file)) as Partial<Theme> & { base?: string };
	const start = cloneTheme(PRESETS.find((p) => p.name === t.base) ?? PRESETS[0]);
	useTheme({
		...start,
		...t,
		name: t.name ?? e.name,
		colors: { ...start.colors, ...t.colors },
		type: { ...start.type, ...t.type },
		headings: { ...start.headings, ...t.headings },
		shape: { ...start.shape, ...t.shape },
		background: { ...start.background, ...t.background },
		glass: { ...start.glass, ...t.glass },
		motion: { ...start.motion, ...t.motion },
		sidebar: { ...start.sidebar, ...t.sidebar },
	} as Theme);
}

export const usingTheme = (e: Entry) => theme.name === e.name;

/** Makes the dashboard as a note (and adds the snippet it looks best with). */
export async function installDashboard(e: Entry) {
	if (!ws.cave) return;
	const text = await get(e.file);
	if (e.snippet && !snippets.names.includes(e.snippet.split("/").pop()!)) await installSnippet({ ...e, file: e.snippet });
	const path = await ws.cave.create("", e.name, text);
	await ws.refresh();
	await ws.open(path);
}
