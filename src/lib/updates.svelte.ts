// Tells you when a newer Basalt is out. The desktop app asks GitHub for the
// latest release now and then; one click downloads the new installer inside
// the app, runs it and restarts (src-tauri/src/update.rs). Your notes,
// settings and the AI's engine and models stay as they are.
import { inDesktopApp } from "./cave";

export const REPO = "Unscathering/notetaking";
/** Always the newest installer, whatever its version. */
export const DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/Basalt-Setup.exe`;
const SKIP_KEY = "basalt.skip-update";
const HOURS = 6;

export const updates = $state<{ version: string | null; current: string; checking: boolean; reached: boolean; installing: { done: number; total: number } | null; error: string }>({ version: null, current: "", checking: false, reached: false, installing: null, error: "" });

/** "0.10.1" is newer than "0.9.3". */
function newer(a: string, b: string) {
	const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
	return false;
}

/** Looks for a newer version. `quiet` skips one you said "Later" to. */
export async function checkForUpdate(quiet = true) {
	if (!inDesktopApp || updates.checking) return;
	updates.checking = true;
	updates.reached = false;
	try {
		const { getVersion } = await import("@tauri-apps/api/app");
		updates.current = await getVersion();
		const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
		if (!res.ok) return;
		updates.reached = true;
		const latest = String(((await res.json()) as { tag_name?: string }).tag_name ?? "").replace(/^v/, "");
		const skipped = quiet ? localStorage.getItem(SKIP_KEY) : null;
		updates.version = latest && newer(latest, updates.current) && latest !== skipped ? latest : null;
	} catch {
		// Offline or GitHub can't be reached; try again later.
	} finally {
		updates.checking = false;
	}
}

/** Downloads the new installer, runs it and closes Basalt so it can be replaced. */
export async function installUpdate() {
	if (updates.installing) return;
	updates.installing = { done: 0, total: 0 };
	updates.error = "";
	const { invoke } = await import("@tauri-apps/api/core");
	const { listen } = await import("@tauri-apps/api/event");
	const stop = await listen<{ what: string; done: number; total: number }>("ai-progress", (e) => {
		if (e.payload.what === "update") updates.installing = { done: e.payload.done, total: e.payload.total };
	});
	try {
		await invoke("update_install");
	} catch (e) {
		updates.error = String(e);
		updates.installing = null;
	} finally {
		stop();
	}
}

/** The old way, if the update can't be done inside the app: open the download in the browser. */
export async function downloadUpdate() {
	const { openUrl } = await import("@tauri-apps/plugin-opener");
	await openUrl(DOWNLOAD_URL);
	updates.version = null;
}

export function laterUpdate() {
	if (updates.version) localStorage.setItem(SKIP_KEY, updates.version);
	updates.version = null;
}

/** Checks shortly after start-up, then every few hours. */
export function startUpdateChecks() {
	if (!inDesktopApp) return;
	setTimeout(() => void checkForUpdate(), 4000);
	setInterval(() => void checkForUpdate(), HOURS * 3600 * 1000);
}
