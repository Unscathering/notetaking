// Automatic backups of the open cave: every note's text, the folders, and the
// cave's settings (home page, folder colors and icons, order). Pictures are
// not included.
//
// In the desktop app they're kept outside the cave, in Basalt's own folder on
// this PC (…/AppData/Local/app.basalt.notes/backups/), so they survive even if
// the cave's folder is damaged. In a browser they're kept in the page's storage.
//
// A backup is made when a cave opens, every half hour while something has
// changed, and before the AI makes changes. The newest 20 are kept, plus one a
// day for two weeks.
import { inDesktopApp, joinPath, type CaveMeta } from "./cave";
import { ws } from "./workspace.svelte";

export interface Backup {
	/** "2026-10-28T23-40-05", also its file name. */
	id: string;
	when: number;
	notes: number;
	/** Why it was made, like "Before the AI's changes". */
	reason: string;
}

interface Snapshot extends Backup {
	cave: string;
	files: Record<string, string>;
	folders: string[];
	meta: CaveMeta;
}

const EVERY_MINUTES = 30;
const KEEP_RECENT = 20;
const KEEP_DAYS = 14;

export const backups = $state({ list: [] as Backup[], busy: false, last: 0 });

// ---- Where they're kept ----

/** A short, steady name for the cave's backup folder. */
export function caveKey(id: string, name: string) {
	let h = 0;
	for (const ch of id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
	return `${name.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 40) || "cave"}-${h.toString(36)}`;
}

interface Store {
	list(): Promise<string[]>;
	read(id: string): Promise<string>;
	write(id: string, text: string): Promise<void>;
	remove(id: string): Promise<void>;
}

async function store(): Promise<Store | null> {
	const cave = ws.cave;
	if (!cave) return null;
	const key = caveKey(cave.id, cave.name);
	if (inDesktopApp) {
		const fs = await import("@tauri-apps/plugin-fs");
		const { appLocalDataDir } = await import("@tauri-apps/api/path");
		const dir = joinPath((await appLocalDataDir()).replace(/[\\/]+$/, ""), `backups/${key}`);
		await fs.mkdir(dir, { recursive: true });
		return {
			list: async () => (await fs.readDir(dir)).filter((e) => e.name.endsWith(".json")).map((e) => e.name.slice(0, -5)),
			read: (id) => fs.readTextFile(`${dir}/${id}.json`),
			write: (id, text) => fs.writeTextFile(`${dir}/${id}.json`, text),
			remove: (id) => fs.remove(`${dir}/${id}.json`),
		};
	}
	const prefix = `basalt.backup.${key}.`;
	return {
		list: async () => Object.keys(localStorage).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)),
		read: async (id) => localStorage.getItem(prefix + id) ?? "",
		write: async (id, text) => localStorage.setItem(prefix + id, text),
		remove: async (id) => localStorage.removeItem(prefix + id),
	};
}

// ---- Making them ----

/** Everything worth keeping, read fresh from the cave. */
async function capture(): Promise<Omit<Snapshot, "id" | "when" | "notes" | "reason">> {
	const cave = ws.cave!;
	const files: Record<string, string> = {};
	for (const f of ws.files) files[f] = ws.texts.get(f) ?? (await cave.read(f));
	return { cave: cave.id, files, folders: [...ws.folders], meta: JSON.parse(JSON.stringify(ws.meta)) as CaveMeta };
}

const sameAs = (a: Pick<Snapshot, "files" | "folders" | "meta">, b: Pick<Snapshot, "files" | "folders" | "meta">) => JSON.stringify([a.files, a.folders, a.meta]) === JSON.stringify([b.files, b.folders, b.meta]);

const stamp = (d: Date) => d.toISOString().slice(0, 19).replace(/:/g, "-");

/** Makes a backup now, unless nothing changed since the last one. */
export async function backUp(reason = "Automatic", force = false): Promise<Backup | null> {
	const s = await store().catch(() => null);
	if (!s || !ws.cave) return null;
	const now = await capture();
	const ids = (await s.list()).sort();
	if (!force && ids.length) {
		try {
			const last = JSON.parse(await s.read(ids[ids.length - 1])) as Snapshot;
			if (sameAs(last, now)) return null;
		} catch {
			// A broken backup; make a new one.
		}
	}
	const when = new Date();
	const snap: Snapshot = { ...now, id: stamp(when), when: when.getTime(), notes: Object.keys(now.files).length, reason };
	await s.write(snap.id, JSON.stringify(snap));
	backups.last = snap.when;
	await prune(s);
	await listBackups();
	return snap;
}

/** Keeps the newest few, and the last one of each day for two weeks. */
async function prune(s: Store) {
	const ids = (await s.list()).sort().reverse();
	const keep = new Set(ids.slice(0, KEEP_RECENT));
	const days = new Set<string>();
	const oldest = stamp(new Date(Date.now() - KEEP_DAYS * 86_400_000));
	for (const id of ids) {
		const day = id.slice(0, 10);
		if (id >= oldest && !days.has(day)) {
			days.add(day);
			keep.add(id);
		}
	}
	for (const id of ids) if (!keep.has(id)) await s.remove(id).catch(() => {});
}

export async function listBackups() {
	const s = await store().catch(() => null);
	if (!s) return (backups.list = []);
	const out: Backup[] = [];
	for (const id of (await s.list()).sort().reverse()) {
		try {
			const { when, notes, reason } = JSON.parse(await s.read(id)) as Snapshot;
			out.push({ id, when, notes, reason });
		} catch {
			// Skip a broken one.
		}
	}
	return (backups.list = out);
}

// ---- Looking and restoring ----

export interface Difference {
	path: string;
	/** What happened since the backup. */
	kind: "deleted" | "changed" | "new";
}

/** How the cave now differs from a backup. */
export async function compare(id: string): Promise<Difference[]> {
	const s = await store();
	if (!s) return [];
	const snap = JSON.parse(await s.read(id)) as Snapshot;
	const out: Difference[] = [];
	for (const [path, text] of Object.entries(snap.files)) {
		if (!ws.files.includes(path)) out.push({ path, kind: "deleted" });
		else if ((ws.texts.get(path) ?? text) !== text) out.push({ path, kind: "changed" });
	}
	for (const path of ws.files) if (!(path in snap.files)) out.push({ path, kind: "new" });
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Puts one note back the way it was in a backup. */
export async function restoreNote(id: string, path: string) {
	const s = await store();
	if (!s || !ws.cave) return;
	const snap = JSON.parse(await s.read(id)) as Snapshot;
	if (!(path in snap.files)) return;
	await backUp("Before bringing back a note");
	await ws.writeNote(path, snap.files[path]).catch(async () => {
		await ws.cave!.write(path, snap.files[path]);
		await ws.refresh();
	});
	if (!ws.files.includes(path)) await ws.refresh();
}

/**
 * Puts the whole cave back the way it was: notes and folders made since are
 * removed, and the rest restored. A backup of now is made first, so this can
 * be undone too.
 */
export async function restoreAll(id: string) {
	const s = await store();
	const cave = ws.cave;
	if (!s || !cave) return;
	backups.busy = true;
	try {
		const snap = JSON.parse(await s.read(id)) as Snapshot;
		await backUp("Before restoring a backup", true);
		ws.cancelSaves();
		for (const f of ws.files) if (!(f in snap.files)) await cave.remove(f);
		for (const d of [...ws.folders].sort().reverse()) if (!snap.folders.includes(d) && d !== "attachments" && !d.startsWith("attachments/")) await cave.remove(d).catch(() => {});
		for (const d of snap.folders) await cave.mkdir(d);
		for (const [path, text] of Object.entries(snap.files)) await cave.write(path, text);
		ws.meta = snap.meta;
		await ws.saveMeta();
		ws.texts.clear();
		for (const [path, text] of Object.entries(snap.files)) ws.texts.set(path, text);
		await ws.refresh();
		for (const t of [...ws.tabs]) if (!t.startsWith("basalt:") && !ws.files.includes(t)) ws.closeTab(t);
		ws.reloaded++;
	} finally {
		backups.busy = false;
	}
}

// ---- On a timer ----

let timer: ReturnType<typeof setInterval> | undefined;

/** Backs up when a cave opens, then every half hour while things change. */
export function startBackups() {
	clearInterval(timer);
	setTimeout(() => void backUp("When the cave opened").catch(() => {}), 5000);
	timer = setInterval(() => void backUp().catch(() => {}), EVERY_MINUTES * 60_000);
}
