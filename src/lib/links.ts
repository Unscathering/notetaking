// basalt:// links, to open Basalt from other apps:
//
//   basalt://open?cave=Notes&note=Projects/Garden plan     opens a note
//   basalt://new?title=Idea&text=Something&folder=Inbox    makes a note
//
// `cave` is a cave's name (or its folder's path); without it, the open cave.
// "Copy link to this note" makes the first kind.
import { inDesktopApp, openCaveAt, recentCaves } from "./cave";
import { ws } from "./workspace.svelte";

export function noteLink(path: string): string {
	const q = new URLSearchParams({ cave: ws.cave?.name ?? "", note: path.replace(/\.md$/i, "") });
	return `basalt://open?${q.toString().replace(/\+/g, "%20")}`;
}

export async function copyNoteLink(path: string) {
	await navigator.clipboard.writeText(noteLink(path));
}

/** Switches to the cave a link names, if it's another one Basalt knows. */
async function goToCave(name: string | null) {
	if (!name || !ws.cave || name === ws.cave.name || name === ws.cave.id) return true;
	const found = recentCaves().find((c) => c.name === name || c.path === name);
	if (!found) {
		alert(`The link is for the cave “${name}”, which Basalt hasn't opened on this computer. Open that folder as a cave first.`);
		return false;
	}
	await ws.load(openCaveAt(found.path));
	return true;
}

export async function handleLink(raw: string) {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return;
	}
	if (url.protocol !== "basalt:") return;
	// At start-up, the cave may still be opening.
	for (let i = 0; i < 50 && !ws.cave; i++) await new Promise((r) => setTimeout(r, 200));
	if (!ws.cave) return;
	const action = (url.hostname || url.pathname.replace(/^\/+/, "").split("/")[0]).toLowerCase();
	const q = url.searchParams;
	if (!(await goToCave(q.get("cave")))) return;
	if (action === "open") {
		const note = q.get("note");
		if (note) await ws.follow(note);
	} else if (action === "new") {
		const title = (q.get("title") || "New note").replace(/[\\/:*?"<>|]/g, "-");
		const text = q.get("text") ?? "";
		await ws.newNote(q.get("folder") ?? "", title, `# ${title}\n\n${text}\n`);
	}
}

/** Listens for links: the one Basalt was started with, and any clicked while it runs. */
export async function startLinks() {
	if (!inDesktopApp) return;
	const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
	for (const u of (await getCurrent().catch(() => null)) ?? []) await handleLink(u);
	await onOpenUrl((urls) => void (async () => {
		for (const u of urls) await handleLink(u);
	})());
}
