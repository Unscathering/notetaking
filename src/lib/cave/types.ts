/** A file or folder in a cave. Paths use "/" and are relative to the cave's folder. */
export interface CaveEntry {
	path: string;
	name: string;
	kind: "file" | "folder";
	children?: CaveEntry[];
}

/** How a folder or note looks in the sidebar. */
export interface EntryLook {
	color?: string;
	icon?: string;
}

/** Per-cave settings, kept in the cave itself at `.basalt/cave.json`. */
export interface CaveMeta {
	/** The note the Home button opens. */
	home?: string;
	/** Hand-picked order of each folder's contents (names), keyed by folder path ("" is the top). */
	order: Record<string, string[]>;
	looks: Record<string, EntryLook>;
	/** CSS snippets that are turned on (file names in .basalt/snippets). */
	snippets?: string[];
}

export const emptyMeta = (): CaveMeta => ({ order: {}, looks: {} });

/**
 * A cave is a folder of notes (what Obsidian calls a vault). The app talks only
 * to this, so it runs the same on disk or in a browser.
 */
export interface Cave {
	/** Stays the same for the same folder: the folder's path, or "memory". */
	id: string;
	name: string;
	list(): Promise<string[]>;
	listFolders(): Promise<string[]>;
	read(path: string): Promise<string>;
	write(path: string, text: string): Promise<void>;
	/** Makes a new note and returns its path (a number is added if the name is taken). */
	create(folder: string, name: string, text?: string): Promise<string>;
	mkdir(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	remove(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	/** The names of the files directly in a folder, hidden ones too (like .basalt/snippets). */
	listDir(path: string): Promise<string[]>;
	/** Images and other files that are not text. */
	writeBytes(path: string, bytes: Uint8Array): Promise<void>;
	/** A URL the page can show, for images in the cave. */
	fileUrl(path: string): Promise<string | null>;
	readMeta(): Promise<CaveMeta>;
	writeMeta(meta: CaveMeta): Promise<void>;
}

export const isNote = (path: string) => path.toLowerCase().endsWith(".md");

/** "Projects/Plan.md" → "Plan". */
export const noteTitle = (path: string) => path.split("/").pop()!.replace(/\.md$/i, "");

export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

export const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

export const baseName = (path: string) => path.split("/").pop()!;

/** Builds the tree: hand-picked order first, then the rest with folders first and names A to Z. */
export function buildTree(files: string[], folders: string[], meta: CaveMeta): CaveEntry[] {
	const root: CaveEntry = { path: "", name: "", kind: "folder", children: [] };
	const byPath = new Map<string, CaveEntry>([["", root]]);
	const folderFor = (path: string): CaveEntry => {
		const found = byPath.get(path);
		if (found) return found;
		const parent = folderFor(parentOf(path));
		const entry: CaveEntry = { path, name: baseName(path), kind: "folder", children: [] };
		parent.children!.push(entry);
		byPath.set(path, entry);
		return entry;
	};
	for (const f of folders) folderFor(f);
	for (const path of files) folderFor(parentOf(path)).children!.push({ path, name: baseName(path), kind: "file" });
	const sort = (folder: CaveEntry) => {
		const picked = meta.order[folder.path] ?? [];
		const rank = (e: CaveEntry) => {
			const i = picked.indexOf(e.name);
			return i < 0 ? Infinity : i;
		};
		folder.children!.sort((a, b) => {
			const ra = rank(a), rb = rank(b);
			if (ra !== rb) return ra - rb;
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			return a.name.localeCompare(b.name, undefined, { numeric: true });
		});
		for (const e of folder.children!) if (e.children) sort(e);
	};
	sort(root);
	return root.children!;
}
