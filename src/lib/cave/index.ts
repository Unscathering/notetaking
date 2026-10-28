import { open } from "@tauri-apps/plugin-dialog";
import { DiskCave } from "./disk";
import { MemoryCave } from "./memory";
import type { Cave } from "./types";

export * from "./types";

/** True inside the desktop app, false in a plain browser. */
export const inDesktopApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export interface RecentCave {
	path: string;
	name: string;
}

const RECENT = "basalt.recent-caves";

export function recentCaves(): RecentCave[] {
	try {
		return (JSON.parse(localStorage.getItem(RECENT) ?? "[]") as RecentCave[]).filter((c) => c.path);
	} catch {
		return [];
	}
}

function remember(cave: Cave) {
	if (!inDesktopApp) return;
	const list = [{ path: cave.id, name: cave.name }, ...recentCaves().filter((c) => c.path !== cave.id)].slice(0, 12);
	localStorage.setItem(RECENT, JSON.stringify(list));
}

export function forgetCave(path: string) {
	localStorage.setItem(RECENT, JSON.stringify(recentCaves().filter((c) => c.path !== path)));
}

/** Opens the cave used last time, or the sample cave outside the desktop app. */
export function openStartingCave(): Cave | null {
	if (!inDesktopApp) return new MemoryCave();
	const last = recentCaves()[0];
	return last ? new DiskCave(last.path) : null;
}

export function openCaveAt(path: string): Cave {
	const cave = inDesktopApp ? new DiskCave(path) : new MemoryCave();
	remember(cave);
	return cave;
}

/** Asks which folder to use as a cave. */
export async function pickCave(): Promise<Cave | null> {
	if (!inDesktopApp) return new MemoryCave();
	const folder = await open({ directory: true, title: "Choose a folder for your cave" });
	if (typeof folder !== "string") return null;
	return openCaveAt(folder);
}
