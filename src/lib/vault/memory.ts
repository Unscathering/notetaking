// A vault kept in the browser, used outside the desktop app (for development and
// previews). Starts with sample notes and remembers edits in localStorage.
import { SAMPLE_NOTES } from "./samples";
import { buildTree, isNote, joinPath, type Vault, type VaultEntry } from "./types";

const KEY = "basalt.memory-vault";

export class MemoryVault implements Vault {
	name = "Sample notes";
	private files = new Map<string, string>();

	constructor() {
		let saved: Record<string, string> | null = null;
		try {
			saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, string> | null;
		} catch {
			saved = null;
		}
		for (const [path, text] of Object.entries(saved ?? SAMPLE_NOTES)) this.files.set(path, text);
	}

	private save() {
		try {
			localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(this.files)));
		} catch {
			// Storage can be full or blocked; the notes still work for this visit.
		}
	}

	async list(): Promise<VaultEntry[]> {
		return buildTree([...this.files.keys()].filter(isNote));
	}

	async read(path: string): Promise<string> {
		return this.files.get(path) ?? "";
	}

	async write(path: string, text: string): Promise<void> {
		this.files.set(path, text);
		this.save();
	}

	async create(folder: string, name: string, text = ""): Promise<string> {
		let path = joinPath(folder, `${name}.md`);
		for (let n = 2; this.files.has(path); n++) path = joinPath(folder, `${name} ${n}.md`);
		await this.write(path, text);
		return path;
	}

	async rename(from: string, to: string): Promise<void> {
		const text = this.files.get(from);
		if (text === undefined) return;
		this.files.delete(from);
		this.files.set(to, text);
		this.save();
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
		this.save();
	}
}
