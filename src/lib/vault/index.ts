import { open } from "@tauri-apps/plugin-dialog";
import { DiskVault } from "./disk";
import { MemoryVault } from "./memory";
import type { Vault } from "./types";

export * from "./types";

/** True inside the desktop app, false in a plain browser. */
export const inDesktopApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const LAST = "basalt.last-vault";

/** Opens the folder used last time, or the sample notes outside the desktop app. */
export function openStartingVault(): Vault | null {
	if (!inDesktopApp) return new MemoryVault();
	const last = localStorage.getItem(LAST);
	return last ? new DiskVault(last) : null;
}

/** Asks which folder to use as the vault. */
export async function pickVault(): Promise<Vault | null> {
	if (!inDesktopApp) return new MemoryVault();
	const folder = await open({ directory: true, title: "Choose your notes folder" });
	if (typeof folder !== "string") return null;
	localStorage.setItem(LAST, folder);
	return new DiskVault(folder);
}
