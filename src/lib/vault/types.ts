/** A file or folder in the notes folder. Paths use "/" and are relative to the vault. */
export interface VaultEntry {
	path: string;
	name: string;
	kind: "file" | "folder";
	children?: VaultEntry[];
}

/** Where notes live. The app talks only to this, so it runs the same on disk or in a browser. */
export interface Vault {
	name: string;
	list(): Promise<VaultEntry[]>;
	read(path: string): Promise<string>;
	write(path: string, text: string): Promise<void>;
	/** Makes a new note and returns its path (a number is added if the name is taken). */
	create(folder: string, name: string, text?: string): Promise<string>;
	rename(from: string, to: string): Promise<void>;
	remove(path: string): Promise<void>;
}

export const isNote = (path: string) => path.toLowerCase().endsWith(".md");

/** "Projects/Plan.md" → "Plan". */
export const noteTitle = (path: string) => path.split("/").pop()!.replace(/\.md$/i, "");

export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/** Builds a sorted tree (folders first, then names) from a flat list of paths. */
export function buildTree(files: string[], folders: string[] = []): VaultEntry[] {
	const root: VaultEntry = { path: "", name: "", kind: "folder", children: [] };
	const byPath = new Map<string, VaultEntry>([["", root]]);
	const folderFor = (path: string): VaultEntry => {
		const found = byPath.get(path);
		if (found) return found;
		const cut = path.lastIndexOf("/");
		const parent = folderFor(cut < 0 ? "" : path.slice(0, cut));
		const entry: VaultEntry = { path, name: path.slice(cut + 1), kind: "folder", children: [] };
		parent.children!.push(entry);
		byPath.set(path, entry);
		return entry;
	};
	for (const f of folders) folderFor(f);
	for (const path of files) {
		const cut = path.lastIndexOf("/");
		folderFor(cut < 0 ? "" : path.slice(0, cut)).children!.push({ path, name: path.slice(cut + 1), kind: "file" });
	}
	const sort = (list: VaultEntry[]) => {
		list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.kind === "folder" ? -1 : 1));
		for (const e of list) if (e.children) sort(e.children);
	};
	sort(root.children!);
	return root.children!;
}
