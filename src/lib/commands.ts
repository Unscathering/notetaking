// Everything the app can do, in one list: the command bar, the command palette
// and keyboard shortcuts all come from here.
import type { IconName } from "./ui/icons";
import { ws } from "./workspace.svelte";

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
	{ id: "tags", label: "Browse tags", icon: "tag", keys: "Ctrl+Shift+T", run: () => showPanel("tags") },
	{ id: "switcher", label: "Open a note", icon: "file", keys: "Ctrl+O", run: () => (ws.modal = "switcher") },
	{ id: "new-note", label: "New note", icon: "pencil", keys: "Ctrl+N", run: () => ws.newNote() },
	{ id: "new-board", label: "New board", icon: "board", keys: "Ctrl+Shift+B", run: () => ws.newBoard() },
	{ id: "new-folder", label: "New folder", icon: "folderPlus", run: () => ws.newFolder() },
	{ id: "caves", label: "Switch cave", icon: "cave", keys: "Ctrl+Shift+O", run: () => (ws.modal = "caves") },
	{ id: "appearance", label: "Appearance", icon: "palette", keys: "Ctrl+,", run: () => (ws.modal = ws.modal === "settings" ? null : "settings") },
	{ id: "sidebar", label: "Show or hide the sidebar", icon: "sidebar", keys: "Ctrl+\\", run: () => (ws.sidebarOpen = !ws.sidebarOpen) },
	{ id: "close-tab", label: "Close tab", icon: "x", keys: "Ctrl+W", run: () => ws.active && ws.closeTab(ws.active) },
	{ id: "set-home", label: "Make this note the home page", icon: "home", run: () => ws.active && ws.setHome(ws.active) },
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
