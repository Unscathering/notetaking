// Note history: earlier versions of each note, to look back through and
// restore. A version is kept whenever a note is saved, at most one every five
// minutes while you type (the newest one keeps updating within those five
// minutes), and always just before something else replaces the text (the AI,
// a restored backup). Kept: everything from the last day, then one an hour for
// a week, then one a day for three months.
//
// Like backups, history is kept outside the cave: in the desktop app in
// Basalt's own folder on this PC (…/app.basalt.notes/history/), in a browser in
// the page's storage.
import { inDesktopApp, joinPath } from "./cave";
import { caveKey } from "./backups.svelte";
import { ws } from "./workspace.svelte";

export interface Version {
	when: number;
	text: string;
	/** Kept on purpose (before a change from outside), so it isn't updated in place. */
	pinned?: boolean;
	/** Why it was kept, when it wasn't an ordinary save. */
	why?: string;
}

interface File {
	path: string;
	versions: Version[];
}

const WINDOW = 5 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A short, steady file name for a note's history. */
function fileName(path: string) {
	let h = 0;
	for (const ch of path) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
	return `${h.toString(36)}-${path.length.toString(36)}`;
}

interface Store {
	read(name: string): Promise<string | null>;
	write(name: string, text: string): Promise<void>;
	remove(name: string): Promise<void>;
}

let cached: { cave: string; store: Store } | null = null;

async function store(): Promise<Store | null> {
	const cave = ws.cave;
	if (!cave) return null;
	if (cached?.cave === cave.id) return cached.store;
	const key = caveKey(cave.id, cave.name);
	let s: Store;
	if (inDesktopApp) {
		const fs = await import("@tauri-apps/plugin-fs");
		const { appLocalDataDir } = await import("@tauri-apps/api/path");
		const dir = joinPath((await appLocalDataDir()).replace(/[\\/]+$/, ""), `history/${key}`);
		await fs.mkdir(dir, { recursive: true });
		s = {
			read: async (n) => ((await fs.exists(`${dir}/${n}.json`)) ? fs.readTextFile(`${dir}/${n}.json`) : null),
			write: (n, t) => fs.writeTextFile(`${dir}/${n}.json`, t),
			remove: (n) => fs.remove(`${dir}/${n}.json`).catch(() => {}),
		};
	} else {
		const prefix = `basalt.history.${key}.`;
		s = {
			read: async (n) => localStorage.getItem(prefix + n),
			write: async (n, t) => localStorage.setItem(prefix + n, t),
			remove: async (n) => localStorage.removeItem(prefix + n),
		};
	}
	cached = { cave: cave.id, store: s };
	return s;
}

/** A note's versions, oldest first. */
export async function versions(path: string): Promise<Version[]> {
	const s = await store();
	if (!s) return [];
	try {
		const raw = await s.read(fileName(path));
		const file = raw ? (JSON.parse(raw) as File) : null;
		return file?.path === path ? file.versions : [];
	} catch {
		return [];
	}
}

/** Keeps every version from the last day, then one an hour for a week, then one a day for three months. */
function thin(list: Version[], now = Date.now()): Version[] {
	const kept: Version[] = [];
	const slots = new Set<string>();
	for (const v of [...list].reverse()) {
		const age = now - v.when;
		if (age > 90 * DAY) continue;
		const slot = age < DAY ? `v${v.when}` : age < 7 * DAY ? `h${Math.floor(v.when / HOUR)}` : `d${Math.floor(v.when / DAY)}`;
		if (slots.has(slot)) continue;
		slots.add(slot);
		kept.push(v);
	}
	return kept.reverse().slice(-400);
}

// One note at a time, so quick saves never trip over each other.
let queue: Promise<unknown> = Promise.resolve();
const inTurn = (job: () => Promise<void>) => (queue = queue.then(job, job).catch(() => {}));

/** Keeps a version of a note. `why` pins it (kept as is, even within five minutes). */
export function record(path: string, text: string, why?: string) {
	return inTurn(async () => {
		const s = await store();
		if (!s) return;
		const list = await versions(path);
		const last = list.at(-1);
		if (last?.text === text) return;
		const now = Date.now();
		// Within five minutes of an ordinary save, the newest version just catches up.
		if (!why && last && !last.pinned && now - last.when < WINDOW && list.length > 1) list[list.length - 1] = { when: now, text };
		else list.push({ when: now, text, ...(why ? { pinned: true, why } : {}) });
		await s.write(fileName(path), JSON.stringify({ path, versions: thin(list, now) } satisfies File));
	});
}

/** Moves history along when a note or folder is renamed or moved. */
function moved(from: string, to: string) {
	void inTurn(async () => {
		const s = await store();
		if (!s) return;
		const paths = [...ws.files, ...ws.tabs].filter((p) => p === to || p.startsWith(`${to}/`));
		for (const now of new Set(paths)) {
			const was = from + now.slice(to.length);
			const raw = await s.read(fileName(was));
			if (!raw) continue;
			const file = JSON.parse(raw) as File;
			if (file.path !== was) continue;
			await s.write(fileName(now), JSON.stringify({ ...file, path: now }));
			await s.remove(fileName(was));
		}
	});
}

let started = false;

/** Starts keeping history. */
export function startHistory() {
	if (started) return;
	started = true;
	ws.hooks.saved.push((path, text) => void record(path, text));
	ws.hooks.replacing.push((path, old) => void record(path, old, "Before changes"));
	ws.hooks.renamed.push(moved);
}

// ---- Comparing ----

export interface Line {
	kind: "same" | "added" | "removed";
	text: string;
}

/** Line by line, what changed from `a` to `b`. Long unchanged stretches fold away. */
export function compareLines(a: string, b: string): Line[] {
	const x = a.split("\n"), y = b.split("\n");
	// Trim what's the same at both ends, then compare the middle.
	let start = 0;
	while (start < x.length && start < y.length && x[start] === y[start]) start++;
	let ex = x.length, ey = y.length;
	while (ex > start && ey > start && x[ex - 1] === y[ey - 1]) ex--, ey--;
	const mx = x.slice(start, ex), my = y.slice(start, ey);
	const out: Line[] = x.slice(0, start).map((text) => ({ kind: "same", text }));
	if (mx.length * my.length > 4_000_000) {
		// Too big to compare closely: show it as replaced.
		out.push(...mx.map((text) => ({ kind: "removed" as const, text })), ...my.map((text) => ({ kind: "added" as const, text })));
	} else {
		const len: number[][] = Array.from({ length: mx.length + 1 }, () => new Array<number>(my.length + 1).fill(0));
		for (let i = mx.length - 1; i >= 0; i--) for (let j = my.length - 1; j >= 0; j--) len[i][j] = mx[i] === my[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
		let i = 0, j = 0;
		while (i < mx.length || j < my.length) {
			if (i < mx.length && j < my.length && mx[i] === my[j]) out.push({ kind: "same", text: mx[i++] }), j++;
			else if (j < my.length && (i === mx.length || len[i][j + 1] >= len[i + 1][j])) out.push({ kind: "added", text: my[j++] });
			else out.push({ kind: "removed", text: mx[i++] });
		}
	}
	out.push(...x.slice(ex).map((text) => ({ kind: "same" as const, text })));
	return out;
}
