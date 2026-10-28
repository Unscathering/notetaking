// A cave in a real folder on disk, through Tauri's file system plugin.
import { exists, mkdir, readDir, readFile, readTextFile, remove, rename, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { emptyMeta, isNote, joinPath, parentOf, type Cave, type CaveMeta } from "./types";

/** Never shown: the app's own settings folder and hidden folders like .git. */
const hidden = (name: string) => name.startsWith(".");
const META = ".basalt/cave.json";

const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" };

export class DiskCave implements Cave {
	id: string;
	name: string;
	private urls = new Map<string, string>();

	constructor(private root: string) {
		this.id = root;
		this.name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
	}

	private abs(path: string) {
		return path ? `${this.root}/${path}` : this.root;
	}

	private async walk(): Promise<{ files: string[]; folders: string[] }> {
		const files: string[] = [], folders: string[] = [];
		const visit = async (dir: string) => {
			for (const entry of await readDir(this.abs(dir))) {
				if (hidden(entry.name)) continue;
				const path = joinPath(dir, entry.name);
				if (entry.isDirectory) {
					folders.push(path);
					await visit(path);
				} else if (isNote(entry.name)) files.push(path);
			}
		};
		await visit("");
		return { files, folders };
	}

	async list() {
		return (await this.walk()).files;
	}

	async listFolders() {
		return (await this.walk()).folders;
	}

	read(path: string) {
		return readTextFile(this.abs(path));
	}

	async write(path: string, text: string) {
		const dir = parentOf(path);
		if (dir) await mkdir(this.abs(dir), { recursive: true });
		await writeTextFile(this.abs(path), text);
	}

	async create(folder: string, name: string, text = "") {
		let path = joinPath(folder, `${name}.md`);
		for (let n = 2; await exists(this.abs(path)); n++) path = joinPath(folder, `${name} ${n}.md`);
		await this.write(path, text);
		return path;
	}

	mkdir(path: string) {
		return mkdir(this.abs(path), { recursive: true });
	}

	async rename(from: string, to: string) {
		const dir = parentOf(to);
		if (dir) await mkdir(this.abs(dir), { recursive: true });
		await rename(this.abs(from), this.abs(to));
	}

	remove(path: string) {
		return remove(this.abs(path), { recursive: true });
	}

	exists(path: string) {
		return exists(this.abs(path));
	}

	async writeBytes(path: string, bytes: Uint8Array) {
		const dir = parentOf(path);
		if (dir) await mkdir(this.abs(dir), { recursive: true });
		await writeFile(this.abs(path), bytes);
		this.urls.delete(path);
	}

	async fileUrl(path: string) {
		const cached = this.urls.get(path);
		if (cached) return cached;
		try {
			const bytes = await readFile(this.abs(path));
			const ext = path.split(".").pop()?.toLowerCase() ?? "";
			const url = URL.createObjectURL(new Blob([bytes], { type: IMAGE_TYPES[ext] ?? "application/octet-stream" }));
			this.urls.set(path, url);
			return url;
		} catch {
			return null;
		}
	}

	async readMeta(): Promise<CaveMeta> {
		try {
			return { ...emptyMeta(), ...(JSON.parse(await readTextFile(this.abs(META))) as Partial<CaveMeta>) };
		} catch {
			return emptyMeta();
		}
	}

	async writeMeta(meta: CaveMeta) {
		await mkdir(this.abs(".basalt"), { recursive: true });
		await writeTextFile(this.abs(META), JSON.stringify(meta, null, 2));
	}
}
