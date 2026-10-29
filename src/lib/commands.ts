// Everything the app can do, in one list: the command bar, the command palette
// and keyboard shortcuts all come from here.
import type { IconName } from "./ui/icons";
import { ws } from "./workspace.svelte";
import { writing } from "./writing.svelte";
import { checkForUpdate, say, updates } from "./updates.svelte";
import { inDesktopApp } from "./cave";
import { aiPanel } from "./ai/panel.svelte";
import { helpHooks } from "./ai/writer";
import { activeEditor } from "./editor/active";
import { startHelp } from "./editor/writingHelp";
import type { Mode } from "./ai/proofread";
import { today } from "./templates";
import { recap } from "./recap.svelte";

/** Runs something on the note in front (or the last one), or says to open one. */
const withNote = (run: (path: string) => unknown) => {
	const p = ws.note ?? ws.recent;
	return p ? run(p) : alert("Open a note first.");
};

/** Exports, saying how it went. */
export async function exportNote(kind: "pdf" | "page" | "site", path: string) {
	const ex = await import("./export");
	try {
		if (kind === "pdf") await ex.printNote(path);
		else if (kind === "page") await ex.exportPage(path);
		else {
			const where = await ex.exportSite(path);
			if (where) alert(`The website is in ${where}. Open index.html to see it, or upload the folder to any web host.`);
		}
	} catch (e) {
		alert(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/** Writing help on the selection, or the whole note if nothing is selected. */
const help = (mode: Mode) => () => {
	const view = activeEditor.view;
	if (!view) return alert("Open a note first.");
	view.focus();
	void startHelp(view, helpHooks, mode);
};

export interface Command {
	id: string;
	label: string;
	icon: IconName;
	/** Shown in the palette; also what the keyboard handler matches. */
	keys?: string;
	run: () => unknown;
}

const showPanel = (panel: typeof ws.panel) => {
	if (ws.panel === panel && ws.sidebarOpen) ws.sidebarOpen = false;
	else {
		ws.panel = panel;
		ws.sidebarOpen = true;
	}
};

export const COMMANDS: Command[] = [
	{ id: "home", label: "Go home", icon: "home", keys: "Ctrl+H", run: () => ws.goHome() },
	{ id: "files", label: "Show files", icon: "files", keys: "Ctrl+Shift+E", run: () => showPanel("files") },
	{ id: "search", label: "Search all notes", icon: "search", keys: "Ctrl+Shift+F", run: () => showPanel("search") },
	{ id: "outline", label: "Outline of this note", icon: "list", run: () => showPanel("outline") },
	{ id: "tags", label: "Browse tags", icon: "tag", keys: "Ctrl+Shift+T", run: () => showPanel("tags") },
	{ id: "switcher", label: "Open a note", icon: "file", keys: "Ctrl+O", run: () => (ws.modal = "switcher") },
	{ id: "view-mode", label: "Switch between viewing and editing", icon: "eye", keys: "Ctrl+E", run: () => ws.note && ws.toggleView(ws.note) },
	{ id: "ai", label: "Ask the AI", icon: "sparkles", keys: "Ctrl+J", run: () => (aiPanel.open = !aiPanel.open) },
	{ id: "grammar", label: "Check grammar (selection or whole note)", icon: "check", keys: "Ctrl+Shift+G", run: help("grammar") },
	{ id: "fix-writing", label: "Fix my writing (selection or whole note)", icon: "sparkles", run: help("fix") },
	{ id: "rewrite", label: "Rewrite the selection", icon: "pencil", run: help("rewrite") },
	{ id: "new-note", label: "New note", icon: "pencil", keys: "Ctrl+N", run: () => ws.newNote() },
	{ id: "new-board", label: "New board", icon: "board", keys: "Ctrl+Shift+B", run: () => ws.newBoard() },
	{ id: "today", label: "Today's note", icon: "sun", keys: "Ctrl+Shift+D", run: () => today() },
	{ id: "yesterday", label: "Yesterday's note", icon: "calendar", run: () => today(-1) },
	{ id: "template", label: "New note from a template", icon: "layers", keys: "Ctrl+Shift+N", run: () => (ws.modal = "templates") },
	{ id: "new-folder", label: "New folder", icon: "folderPlus", run: () => ws.newFolder() },
	{ id: "backups", label: "Backups", icon: "archive", run: () => (ws.modal = ws.modal === "backups" ? null : "backups") },
	{ id: "caves", label: "Switch cave", icon: "cave", keys: "Ctrl+Shift+O", run: () => (ws.modal = "caves") },
	{ id: "appearance", label: "Appearance", icon: "palette", keys: "Ctrl+,", run: () => (ws.modal = ws.modal === "settings" ? null : "settings") },
	{ id: "sidebar", label: "Show or hide the sidebar", icon: "sidebar", keys: "Ctrl+\\", run: () => (ws.sidebarOpen = !ws.sidebarOpen) },
	{ id: "focus", label: "Focus mode", icon: "focus", keys: "Ctrl+Shift+Enter", run: () => (writing.focus = !writing.focus) },
	{ id: "typewriter", label: "Typewriter scrolling", icon: "type", run: () => (writing.typewriter = !writing.typewriter) },
	{ id: "dim", label: "Dim other paragraphs", icon: "eye", run: () => (writing.dimOthers = !writing.dimOthers) },
	{ id: "split", label: "Open this note on the right too", icon: "layout", run: () => (ws.split ? (ws.split = null) : ws.openSplit(ws.note ?? ws.recent)) },
	{ id: "copy-link", label: "Copy link to this note (basalt://)", icon: "pin", run: () => withNote((p) => import("./links").then((l) => l.copyNoteLink(p))) },
	{ id: "clip", label: "Clip a web page", icon: "globe", keys: "Ctrl+Shift+K", run: () => (ws.modal = "clip") },
	{ id: "pdf", label: "Print or save as PDF", icon: "file", keys: "Ctrl+Shift+P", run: () => withNote((p) => exportNote("pdf", p)) },
	{ id: "web-page", label: "Save this note as a web page", icon: "globe", run: () => withNote((p) => exportNote("page", p)) },
	{ id: "website", label: "Export this folder as a website", icon: "globe", run: () => withNote((p) => exportNote("site", p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")) },
	{ id: "new-tab", label: "New tab", icon: "plus", keys: "Ctrl+T", run: () => ws.newTab() },
	{ id: "back", label: "Go back", icon: "chevron", keys: "Ctrl+Alt+ArrowLeft", run: () => ws.go(-1) },
	{ id: "forward", label: "Go forward", icon: "chevron", keys: "Ctrl+Alt+ArrowRight", run: () => ws.go(1) },
	{ id: "close-tab", label: "Close tab", icon: "x", keys: "Ctrl+W", run: () => ws.active && ws.closeTab(ws.active) },
	{ id: "set-home", label: "Make this note the home page", icon: "home", run: () => ws.note && ws.setHome(ws.note) },
	{ id: "history", label: "History of this note", icon: "clock", run: () => (ws.note || ws.recent ? ws.showHistory(ws.note ?? ws.recent) : alert("Open a note first.")) },
	{ id: "graph", label: "Open the graph", icon: "graph", run: () => ws.open("basalt:graph") },
	{ id: "database", label: "This folder as a database", icon: "table", run: () => { const p = ws.note ?? ws.recent; void ws.open(`basalt:db:${p && p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ""}`); } },
	{ id: "calendar", label: "Open the calendar", icon: "calendar", run: () => ws.open("basalt:calendar") },
	{ id: "recap", label: "Recap last week with the AI", icon: "sparkles", run: () => { const d = new Date(); void recap(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) - 7)); } },
	{
		id: "updates",
		label: "Check for updates",
		icon: "download",
		run: async () => {
			if (!inDesktopApp) return say("Updates are for the desktop app.");
			say("Checking for updates…");
			await checkForUpdate(false);
			if (updates.version) say("");
			else say(updates.reached ? `You have the newest Basalt (${updates.current}).` : `Couldn't reach GitHub to check. Try again later.${updates.current ? ` You have Basalt ${updates.current}.` : ""}`);
		},
	},
	{ id: "palette", label: "Command palette", icon: "command", keys: "Ctrl+P", run: () => (ws.modal = ws.modal === "palette" ? null : "palette") },
];

export const command = (id: string) => COMMANDS.find((c) => c.id === id)!;

/** "Ctrl+Shift+F" for a key event, so it can be matched against `keys`. */
export function keyName(e: KeyboardEvent): string {
	const parts: string[] = [];
	if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
	if (e.altKey) parts.push("Alt");
	if (e.shiftKey) parts.push("Shift");
	parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
	return parts.join("+");
}
