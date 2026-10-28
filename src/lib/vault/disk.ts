// A vault in a real folder on disk, through Tauri's file system plugin.
import { exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { buildTree, isNote, joinPath, type Vault, type VaultEntry } from "./types";

/** Folders the app never shows: its own settings and hidden folders like .git. */
const hidden = (name: string) => name.startsWith(".");

export class DiskVault implements Vault {
	name: string;

	constructor(private root: string) {
		this.name = root.split(/[\\/]/).filter(Boolean).pop() ?? root;
	}

	private abs(path: string) {
		return `${this.root}/${path}`;
	}

	async list(): Promise<VaultEntry[]> {
		const files: string[] = [], folders: string[] = [];
		const walk = async (dir: string) => {
			for (const entry of await readDir(this.abs(dir))) {
				if (hidden(entry.name)) continue;
				const path = joinPath(dir, entry.name);
				if (entry.isDirectory) {
					folders.push(path);
					await walk(path);
				} else if (isNote(entry.name)) files.push(path);
			}
		};
		await walk("");
		return buildTree(files, folders);
	}

	read(path: string) {
		return readTextFile(this.abs(path));
	}

	async write(path: string, text: string) {
		const cut = path.lastIndexOf("/");
		if (cut > 0) await mkdir(this.abs(path.slice(0, cut)), { recursive: true });
		await writeTextFile(this.abs(path), text);
	}

	async create(folder: string, name: string, text = ""): Promise<string> {
		let path = joinPath(folder, `${name}.md`);
		for (let n = 2; await exists(this.abs(path)); n++) path = joinPath(folder, `${name} ${n}.md`);
		await this.write(path, text);
		return path;
	}

	rename(from: string, to: string) {
		return rename(this.abs(from), this.abs(to));
	}

	remove(path: string) {
		return remove(this.abs(path));
	}
}
