// A cave kept in the browser, used outside the desktop app (for development and
// previews). Starts with sample notes and remembers changes in localStorage.
import { SAMPLE_META, SAMPLE_NOTES } from "./samples";
import { emptyMeta, isNote, joinPath, parentOf, type Cave, type CaveMeta } from "./types";

const KEY = "basalt.memory-cave";

interface Saved {
	files: Record<string, string>;
	folders: string[];
	images: Record<string, string>;
	meta: CaveMeta;
}

export class MemoryCave implements Cave {
	id = "memory";
	name = "Sample cave";
	private files = new Map<string, string>();
	private folders = new Set<string>();
	/** Images as data URLs. */
	private images = new Map<string, string>();
	private meta: CaveMeta = emptyMeta();

	constructor() {
		let saved: Saved | null = null;
		try {
			saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
		} catch {
			saved = null;
		}
		const files = saved?.files ?? SAMPLE_NOTES;
		for (const [path, text] of Object.entries(files)) this.files.set(path, text);
		for (const f of saved?.folders ?? []) this.folders.add(f);
		for (const [path, url] of Object.entries(saved?.images ?? {})) this.images.set(path, url);
		this.meta = saved?.meta ?? structuredClone(SAMPLE_META);
	}

	private save() {
		try {
			const data: Saved = { files: Object.fromEntries(this.files), folders: [...this.folders], images: Object.fromEntries(this.images), meta: this.meta };
			localStorage.setItem(KEY, JSON.stringify(data));
		} catch {
			// Storage can be full or blocked; the notes still work for this visit.
		}
	}

	async list() {
		// Like a real folder, anything inside a dot-folder (such as .basalt) stays hidden.
		return [...this.files.keys()].filter((p) => isNote(p) && !p.split("/").some((part) => part.startsWith(".")));
	}

	async listFolders() {
		const all = new Set(this.folders);
		for (const p of this.files.keys()) for (let f = parentOf(p); f; f = parentOf(f)) all.add(f);
		return [...all].filter((f) => !f.split("/").some((part) => part.startsWith(".")));
	}

	async read(path: string) {
		return this.files.get(path) ?? "";
	}

	async write(path: string, text: string) {
		this.files.set(path, text);
		this.save();
	}

	async create(folder: string, name: string, text = "") {
		let path = joinPath(folder, `${name}.md`);
		for (let n = 2; this.files.has(path); n++) path = joinPath(folder, `${name} ${n}.md`);
		await this.write(path, text);
		return path;
	}

	async mkdir(path: string) {
		this.folders.add(path);
		this.save();
	}

	async rename(from: string, to: string) {
		// A folder moves everything inside it.
		const moveKey = <T>(map: Map<string, T>) => {
			for (const [p, v] of [...map]) {
				if (p === from || p.startsWith(`${from}/`)) {
					map.delete(p);
					map.set(to + p.slice(from.length), v);
				}
			}
		};
		moveKey(this.files);
		moveKey(this.images);
		for (const f of [...this.folders]) {
			if (f === from || f.startsWith(`${from}/`)) {
				this.folders.delete(f);
				this.folders.add(to + f.slice(from.length));
			}
		}
		this.save();
	}

	async remove(path: string) {
		for (const map of [this.files, this.images] as Map<string, unknown>[]) {
			for (const p of [...map.keys()]) if (p === path || p.startsWith(`${path}/`)) map.delete(p);
		}
		for (const f of [...this.folders]) if (f === path || f.startsWith(`${path}/`)) this.folders.delete(f);
		this.save();
	}

	async exists(path: string) {
		return this.files.has(path) || this.images.has(path) || this.folders.has(path);
	}

	async writeBytes(path: string, bytes: Uint8Array) {
		let binary = "";
		for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		const type = path.toLowerCase().endsWith(".png") ? "image/png" : path.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
		this.images.set(path, `data:${type};base64,${btoa(binary)}`);
		this.save();
	}

	async fileUrl(path: string) {
		return this.images.get(path) ?? null;
	}

	async readMeta() {
		return structuredClone(this.meta);
	}

	async writeMeta(meta: CaveMeta) {
		this.meta = structuredClone(meta);
		this.save();
	}
}
