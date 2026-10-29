// The app's shared state: the open cave, its notes, tabs and panels, and every
// action that changes them. Components read from `ws` and call its methods.
import type { IconName } from "./ui/icons";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import {
	baseName,
	buildTree,
	emptyMeta,
	joinPath,
	noteTitle,
	openStartingCave,
	parentOf,
	type Cave,
	type CaveMeta,
	type EntryLook,
} from "./cave";
import { readProps, type NoteProps } from "./notes";
import { isBoardText, newBoardText } from "./board";
import { writing } from "./writing.svelte";

export type Panel = "files" | "search" | "tags" | "outline";
/** Tabs that aren't notes: the graph and other whole-cave views. */
export const VIEWS: Record<string, { label: string; icon: IconName }> = {
	"basalt:graph": { label: "Graph", icon: "graph" },
	"basalt:calendar": { label: "Calendar", icon: "calendar" },
};
export const isView = (path: string) => path.startsWith("basalt:");
/** A view tab's name and icon ("basalt:db:Projects" is the Projects folder as a database). */
export const viewInfo = (path: string): { label: string; icon: IconName } | null =>
	VIEWS[path] ??
	(path.startsWith("basalt:db:") ? { label: path.slice(10).split("/").pop() || "All notes", icon: "table" } : path.startsWith("basalt:new") ? { label: "New tab", icon: "plus" } : null);
/** An empty tab, waiting for a note (the + on the tab bar). */
export const isNewTab = (path: string | null) => !!path?.startsWith("basalt:new");

export type Modal = "palette" | "switcher" | "templates" | "caves" | "settings" | "backups" | "history" | "clip";

class Workspace {
	cave: Cave | null = $state(null);
	meta: CaveMeta = $state(emptyMeta());
	files: string[] = $state([]);
	folders: string[] = $state([]);
	tree = $derived(buildTree(this.files, this.folders, this.meta));
	tabs: string[] = $state([]);
	/** The tab in front: a note's path, or a view like "basalt:graph". */
	active: string | null = $state(null);
	/** The note in front, or null when a view (graph, calendar) is showing. */
	note = $derived(this.active && !isView(this.active) ? this.active : null);
	/** The last note that was in front, even if a view is showing now. */
	recent: string | null = $state(null);
	/** The line the cursor is on in the note in front (0-based), for the outline. */
	cursorLine = $state(0);
	/** How many words are selected in the note in front. */
	selectedWords = $state(0);
	/** The note open in the right-hand pane, if the view is split. */
	split: string | null = $state(null);

	async openSplit(path: string | null) {
		if (!path || !this.cave || isView(path)) return;
		if (!this.texts.has(path)) this.texts.set(path, await this.cave.read(path));
		this.split = path;
	}

	/** The note whose history is showing. */
	historyOf: string | null = $state(null);

	showHistory(path: string | null) {
		if (!path) return;
		this.historyOf = path;
		this.modal = "history";
	}
	texts = new SvelteMap<string, string>();
	openFolders = new SvelteSet<string>();
	/** Notes shown in view mode (read only, tidy), remembered between visits. */
	viewing = new SvelteSet<string>((() => {
		try {
			return JSON.parse(localStorage.getItem("basalt.viewing") ?? "[]") as string[];
		} catch {
			return [];
		}
	})());

	/** Dashboards open in view mode; these are the ones switched to editing. */
	editingDashboards = new SvelteSet<string>((() => {
		try {
			return JSON.parse(localStorage.getItem("basalt.editing-dashboards") ?? "[]") as string[];
		} catch {
			return [];
		}
	})());

	/** Whether a note shows in view mode: chosen with Ctrl+E, or a dashboard nobody switched to editing. */
	isViewing(path: string): boolean {
		if (this.viewing.has(path)) return true;
		return /(^|\n)cssclass(es)?:[^\n]*\bdashboard\b/.test((this.texts.get(path) ?? "").slice(0, 400)) && !this.editingDashboards.has(path);
	}

	/** Switches a note between view mode and editing. */
	toggleView(path: string) {
		const dashboard = /(^|\n)cssclass(es)?:[^\n]*\bdashboard\b/.test((this.texts.get(path) ?? "").slice(0, 400));
		if (this.isViewing(path)) {
			this.viewing.delete(path);
			if (dashboard) this.editingDashboards.add(path);
		} else {
			this.editingDashboards.delete(path);
			if (!dashboard) this.viewing.add(path);
		}
		try {
			localStorage.setItem("basalt.viewing", JSON.stringify([...this.viewing].slice(-500)));
			localStorage.setItem("basalt.editing-dashboards", JSON.stringify([...this.editingDashboards].slice(-500)));
		} catch {
			// Fine; it's remembered until Basalt closes.
		}
	}
	panel: Panel = $state("files");
	sidebarOpen = $state(true);
	modal: Modal | null = $state(null);
	saving = $state(false);
	/** A line to scroll to once a note is open (from search results). */
	reveal: { path: string; line: number } | null = $state(null);
	/** The latest change made to a note from outside the editor (for example by the AI). */
	outside: { path: string; text: string; n: number } | null = $state(null);
	/** Goes up when many notes changed at once (like a restored backup): the editor reloads them all. */
	reloaded = $state(0);
	/** Every note's details, kept up to date as notes change. */
	props = $derived.by(() => {
		const out = new Map<string, NoteProps>();
		// Only notes whose text changed are read again (typing changes one note at a time).
		for (const [p, t] of this.texts) {
			const known = this.propsCache.get(p);
			if (known?.text === t) out.set(p, known.props);
			else {
				const props = readProps(t);
				this.propsCache.set(p, { text: t, props });
				out.set(p, props);
			}
		}
		return out;
	});
	private propsCache = new Map<string, { text: string; props: NoteProps }>();
	/** tag → notes with it, most used first. */
	tags = $derived.by(() => {
		const out = new Map<string, string[]>();
		for (const [p, pr] of this.props) for (const t of pr.tags) out.set(t, [...(out.get(t) ?? []), p]);
		return new Map([...out].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])));
	});
	/** Boards being edited as plain Markdown instead of as a board. */
	rawBoards = new SvelteSet<string>();
	/** The sidebar item being renamed in place. */
	renaming: string | null = $state(null);
	private timers = new Map<string, number>();
	/** Others listening in, like note history: saved text, text about to be replaced, renames. */
	hooks = {
		saved: [] as Array<(path: string, text: string) => void>,
		replacing: [] as Array<(path: string, old: string) => void>,
		renamed: [] as Array<(from: string, to: string) => void>,
	};

	/** Notes in sidebar order. */
	notes = $derived.by(() => {
		const out: string[] = [];
		const walk = (list: typeof this.tree) => list.forEach((e) => (e.kind === "file" ? out.push(e.path) : walk(e.children ?? [])));
		walk(this.tree);
		return out;
	});

	async load(cave: Cave | null) {
		this.cave = cave;
		this.tabs = [];
		this.active = null;
		this.texts.clear();
		this.openFolders.clear();
		if (!cave) return;
		this.meta = await cave.readMeta();
		await this.refresh();
		for (const f of this.folders) if (!f.includes("/")) this.openFolders.add(f);
		const start = this.meta.home && this.files.includes(this.meta.home) ? this.meta.home : this.notes[0];
		if (start) await this.open(start);
		void this.readAll(cave);
	}

	/** Reads every note in the background, for search and tags. */
	async readAll(cave: Cave) {
		for (const p of this.files) {
			if (this.cave !== cave) return;
			if (!this.texts.has(p)) this.texts.set(p, await cave.read(p));
		}
	}

	async refresh() {
		if (!this.cave) return;
		[this.files, this.folders] = await Promise.all([this.cave.list(), this.cave.listFolders()]);
		for (const p of [...this.texts.keys()]) if (!this.files.includes(p)) this.texts.delete(p);
		void this.readAll(this.cave);
	}

	showRaw(path: string) {
		this.rawBoards.add(path);
	}

	showBoard(path: string) {
		this.rawBoards.delete(path);
	}

	async newBoard(folder = "", name = "Untitled board") {
		return this.newNote(folder, name, newBoardText());
	}

	/** Saves an image into the cave's attachments folder and returns its path. */
	async saveImage(bytes: Uint8Array, ext: string) {
		if (!this.cave) return null;
		const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
		let path = `attachments/Image ${stamp}.${ext}`;
		for (let n = 2; await this.cave.exists(path); n++) path = `attachments/Image ${stamp} ${n}.${ext}`;
		await this.cave.writeBytes(path, bytes);
		return path;
	}

	/** Asks for an image file and copies it into the cave. */
	pickImage(): Promise<string | null> {
		return new Promise((resolve) => {
			const input = document.createElement("input");
			input.type = "file";
			input.accept = "image/*";
			input.onchange = async () => {
				const f = input.files?.[0];
				if (!f) return resolve(null);
				const ext = f.name.split(".").pop()?.toLowerCase() || "png";
				resolve(await this.saveImage(new Uint8Array(await f.arrayBuffer()), ext));
			};
			input.click();
		});
	}

	/** Opens a note and scrolls to a line in it. */
	async openAt(path: string, line: number) {
		await this.open(path);
		this.reveal = { path, line };
	}

	async saveMeta() {
		await this.cave?.writeMeta($state.snapshot(this.meta) as CaveMeta);
	}

	/** Where you've been, for back and forward. */
	nav: string[] = $state([]);
	navAt = $state(-1);

	/**
	 * Opens a note or view. A note takes the place of the note in the current
	 * tab, like Obsidian; views (graph, calendar, a folder's table) and boards
	 * get a tab of their own, and so does anything opened with `newTab`.
	 */
	async open(path: string, { newTab = false, fromHistory = false } = {}) {
		if (!this.cave) return;
		if (!isView(path) && !this.texts.has(path)) this.texts.set(path, await this.cave.read(path));
		if (!this.tabs.includes(path)) {
			const cur = this.active;
			const ownTab = (p: string) => (isView(p) && !isNewTab(p)) || isBoardText(this.texts.get(p) ?? "");
			if (cur && !newTab && !ownTab(path) && !ownTab(cur)) this.tabs = this.tabs.map((t) => (t === cur ? path : t));
			else {
				const at = cur ? this.tabs.indexOf(cur) + 1 : this.tabs.length;
				this.tabs = [...this.tabs.slice(0, at), path, ...this.tabs.slice(at)];
			}
		}
		this.active = path;
		if (!fromHistory && !isNewTab(path) && this.nav[this.navAt] !== path) {
			this.nav = [...this.nav.slice(0, this.navAt + 1), path].slice(-100);
			this.navAt = this.nav.length - 1;
		}
		if (isView(path)) return;
		this.recent = path;
		// Show where the note lives in the sidebar.
		for (let f = parentOf(path); f; f = parentOf(f)) this.openFolders.add(f);
	}

	/** Back to where you were before (or forward again). */
	async go(step: -1 | 1) {
		let at = this.navAt + step;
		// Skip places that are gone (a deleted note).
		while (at >= 0 && at < this.nav.length && !isView(this.nav[at]) && !this.files.includes(this.nav[at])) at += step;
		if (at < 0 || at >= this.nav.length) return;
		this.navAt = at;
		await this.open(this.nav[at], { fromHistory: true });
	}

	/** An empty new tab, like Obsidian's: open a note into it, or make one. */
	newTab() {
		const path = `basalt:new:${Date.now()}`;
		const at = this.active ? this.tabs.indexOf(this.active) + 1 : this.tabs.length;
		this.tabs = [...this.tabs.slice(0, at), path, ...this.tabs.slice(at)];
		this.active = path;
	}

	closeTab(path: string) {
		const i = this.tabs.indexOf(path);
		this.tabs = this.tabs.filter((p) => p !== path);
		if (this.active === path) this.active = this.tabs[Math.min(i, this.tabs.length - 1)] ?? null;
	}

	nextTab(step: number) {
		if (!this.active || this.tabs.length < 2) return;
		const i = this.tabs.indexOf(this.active);
		void this.open(this.tabs[(i + step + this.tabs.length) % this.tabs.length]);
	}

	/** Drops saves still waiting to happen (before a backup is restored over them). */
	cancelSaves() {
		for (const t of this.timers.values()) window.clearTimeout(t);
		this.timers.clear();
		this.saving = false;
	}

	/** Notes edited since the cave opened. */
	private touched = new Set<string>();

	edited(path: string, text: string) {
		// The first edit keeps a copy of how the note was before (for note history).
		const before = this.texts.get(path);
		if (!this.touched.has(path) && before != null && before !== text) {
			this.touched.add(path);
			for (const h of this.hooks.replacing) h(path, before);
		}
		this.texts.set(path, text);
		this.saving = true;
		window.clearTimeout(this.timers.get(path));
		this.timers.set(
			path,
			window.setTimeout(async () => {
				await this.cave?.write(path, text);
				for (const h of this.hooks.saved) h(path, text);
				this.timers.delete(path);
				this.saving = this.timers.size > 0;
			}, 400)
		);
	}

	/** Replaces a note's whole text from outside the editor, and saves it. */
	/** Writes a note from outside the editor. `track: false` leaves it out of note history (for text still being written). */
	async writeNote(path: string, text: string, track = true) {
		if (!this.cave) return;
		const old = this.texts.get(path);
		if (track && old != null && old !== text) for (const h of this.hooks.replacing) h(path, old);
		await this.cave.write(path, text);
		if (track) for (const h of this.hooks.saved) h(path, text);
		this.texts.set(path, text);
		this.outside = { path, text, n: (this.outside?.n ?? 0) + 1 };
		if (!this.files.includes(path)) await this.refresh();
	}

	/** Finds a note by a link's name ("Plan", "Projects/Plan" or "Plan.md"). */
	resolve(target: string): string | null {
		const want = target.trim().toLowerCase().replace(/\.md$/, "");
		return (
			this.files.find((p) => p.toLowerCase().replace(/\.md$/, "") === want) ??
			this.files.find((p) => noteTitle(p).toLowerCase() === want.split("/").pop()) ??
			null
		);
	}

	/** Follows a [[link]]: opens the note, or makes it first. */
	async follow(target: string, newTab = false) {
		if (!this.cave) return;
		const found = this.resolve(target);
		if (found) return this.open(found, { newTab });
		const name = baseName(target);
		const path = await this.cave.create(parentOf(target), name, writing.inlineTitle ? "" : `# ${name}\n\n`);
		await this.refresh();
		await this.open(path, { newTab });
	}

	/** A note that was just made, so its title opens selected, ready to be named. */
	private fresh: string | null = null;
	takeFresh(path: string) {
		const yes = this.fresh === path;
		if (yes) this.fresh = null;
		return yes;
	}

	async newNote(folder = "", name = "Untitled", text?: string) {
		if (!this.cave) return null;
		// The inline title shows the name, so a new note starts empty (with it off, a heading does).
		const path = await this.cave.create(folder, name, text ?? (writing.inlineTitle ? "" : `# ${name}\n\n`));
		if (text == null) this.fresh = path;
		await this.refresh();
		await this.open(path);
		return path;
	}

	async newFolder(parent = "", name = "New folder") {
		if (!this.cave) return null;
		let path = joinPath(parent, name);
		for (let n = 2; await this.cave.exists(path); n++) path = joinPath(parent, `${name} ${n}`);
		await this.cave.mkdir(path);
		if (parent) this.openFolders.add(parent);
		await this.refresh();
		return path;
	}

	/** Opens the cave's home note, making one the first time. */
	async goHome() {
		if (!this.cave) return;
		if (this.meta.home && this.files.includes(this.meta.home)) return this.open(this.meta.home);
		const path = this.files.includes("Home.md") ? "Home.md" : await this.cave.create("", "Home", "# Home\n\nThis is your home page. Link the notes you use most: [[Welcome]]\n");
		await this.setHome(path);
		await this.refresh();
		await this.open(path);
	}

	async setHome(path: string) {
		this.meta.home = path;
		await this.saveMeta();
	}

	async setLook(path: string, look: EntryLook) {
		const next = { ...this.meta.looks[path], ...look };
		if (!next.color) delete next.color;
		if (!next.icon) delete next.icon;
		this.meta.looks = { ...this.meta.looks, [path]: next };
		await this.saveMeta();
	}

	/**
	 * Moves a note or folder into `folder`, placed before `before` (a name in that
	 * folder) or at the end. Moving within the same folder just reorders it.
	 */
	async move(path: string, folder: string, before: string | null) {
		if (!this.cave) return;
		if (folder === path || folder.startsWith(`${path}/`)) return;
		const from = parentOf(path), name = baseName(path);
		let to = joinPath(folder, name);
		if (from !== folder) {
			if (await this.cave.exists(to)) return;
			await this.cave.rename(path, to);
			this.renamed(path, to);
			this.meta.order[from] = (this.meta.order[from] ?? []).filter((n) => n !== name);
		} else to = path;
		// The folder's current order, with the moved item placed where it was dropped.
		const siblings = this.childrenOf(folder).filter((n) => n !== name);
		const at = before ? siblings.indexOf(before) : -1;
		siblings.splice(at < 0 ? siblings.length : at, 0, name);
		this.meta.order = { ...this.meta.order, [folder]: siblings };
		await this.saveMeta();
		await this.refresh();
	}

	async rename(path: string, newName: string) {
		if (!this.cave || !newName.trim()) return;
		const isFile = this.files.includes(path);
		const clean = newName.trim().replace(/[\\/:*?"<>|]/g, "-");
		const to = joinPath(parentOf(path), isFile ? `${clean.replace(/\.md$/i, "")}.md` : clean);
		if (to === path || (await this.cave.exists(to))) return;
		await this.cave.rename(path, to);
		const order = this.meta.order[parentOf(path)];
		if (order) this.meta.order[parentOf(path)] = order.map((n) => (n === baseName(path) ? baseName(to) : n));
		this.renamed(path, to);
		await this.saveMeta();
		await this.refresh();
	}

	async remove(path: string) {
		if (!this.cave) return;
		await this.cave.remove(path);
		for (const t of this.tabs) if (t === path || t.startsWith(`${path}/`)) this.closeTab(t);
		if (this.split && (this.split === path || this.split.startsWith(`${path}/`))) this.split = null;
		await this.refresh();
	}

	/** Keeps tabs, texts, looks and the home note pointing at a moved path. */
	private renamed(from: string, to: string) {
		for (const h of this.hooks.renamed) h(from, to);
		const swap = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p);
		this.tabs = this.tabs.map(swap);
		this.nav = this.nav.map(swap);
		if (this.split) this.split = swap(this.split);
		if (this.active) this.active = swap(this.active);
		for (const [p, t] of [...this.texts]) {
			if (swap(p) !== p) {
				this.texts.delete(p);
				this.texts.set(swap(p), t);
			}
		}
		const looks: CaveMeta["looks"] = {};
		for (const [p, l] of Object.entries(this.meta.looks)) looks[swap(p)] = l;
		this.meta.looks = looks;
		if (this.meta.home) this.meta.home = swap(this.meta.home);
		const order: CaveMeta["order"] = {};
		for (const [f, names] of Object.entries(this.meta.order)) order[swap(f)] = names;
		this.meta.order = order;
		for (const f of [...this.openFolders]) {
			if (swap(f) !== f) {
				this.openFolders.delete(f);
				this.openFolders.add(swap(f));
			}
		}
	}

	/** Names inside a folder, in the order the sidebar shows them. */
	childrenOf(folder: string): string[] {
		let list = this.tree;
		for (const part of folder ? folder.split("/") : []) list = list.find((e) => e.name === part)?.children ?? [];
		return list.map((e) => e.name);
	}
}

export const ws = new Workspace();

/** The cave to open when the app starts. */
export function startWorkspace() {
	void ws.load(openStartingCave());
}
