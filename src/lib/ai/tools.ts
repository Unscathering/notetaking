// What the AI can do in Basalt. Looking around (reading notes, searching,
// checking the theme) happens straight away. Anything that changes the cave or
// the app is only *proposed*: it becomes a line in a plan the user approves,
// and every change knows how to undo itself.
import { baseName, joinPath, noteTitle, parentOf } from "../cave";
import { blankCard, isBoardText, parseBoard, serializeBoard, type Board } from "../board";
import { readProps } from "../notes";
import { recall } from "./recall";
import { FONT_CHOICES, GLASS_DEFAULTS, PRESETS, SIDEBAR_STYLES, WALLPAPERS, cloneTheme, type HeadingStyle, type Theme } from "../theme/theme";
import { theme, useTheme } from "../theme/store.svelte";
import { ws } from "../workspace.svelte";
import type { IconName } from "../ui/icons";
import { FOLDER_ICONS } from "../ui/icons";

export interface Change {
	id: number;
	tool: string;
	args: Record<string, unknown>;
	/** What it does, in plain words, for the plan. */
	summary: string;
	icon: IconName;
	checked: boolean;
	/** Set if it couldn't be done. */
	problem?: string;
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const folderPath = (v: unknown) => str(v).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
const notePath = (v: unknown) => {
	const p = folderPath(v);
	return p && !/\.md$/i.test(p) ? `${p}.md` : p;
};
/** Finds a note the AI names loosely ("Garden plan", "Ideas/Garden plan.md"). */
const findNote = (v: unknown) => ws.resolve(str(v).replace(/\.md$/i, "")) ?? (ws.files.includes(notePath(v)) ? notePath(v) : null);
const isFolder = (p: string) => ws.folders.includes(p);
const COLORS: Record<string, string> = { red: "#e05d5d", orange: "#e8794a", yellow: "#e5b84b", green: "#7fc48b", teal: "#4fb8b0", blue: "#5b9bf0", indigo: "#7c8cff", purple: "#b07cf0", pink: "#e46fa8", gray: "#9aa0a6", grey: "#9aa0a6" };
const color = (v: unknown) => {
	const c = str(v).toLowerCase();
	return COLORS[c] ?? (/^#[0-9a-f]{6}$/i.test(c) ? c : "");
};
const iconName = (v: unknown) => {
	const i = str(v);
	return (FOLDER_ICONS as string[]).includes(i) ? i : i && [...i].length <= 2 ? i : "";
};

// ---- The tool list the AI sees ----

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
	type: "function",
	function: { name, description, parameters: { type: "object", properties, required } },
});
const s = (description: string) => ({ type: "string", description });
const n = (description: string) => ({ type: "number", description });

export const TOOLS = [
	fn("list_cave", "See every folder and note in the cave as a tree, with folder colors and icons, the home page and which notes are boards."),
	fn("read_note", "Read a note's full text.", { path: s("The note, like 'Ideas/Garden plan'.") }, ["path"]),
	fn("search_notes", "Search every note's text.", { query: s("Words to look for.") }, ["query"]),
	fn("list_tags", "See every tag and which notes use it."),
	fn("get_appearance", "See the current look of the app and every choice available (themes, materials, wallpapers, fonts, heading styles, sidebar styles)."),
	fn("create_folder", "Propose making a folder (parents are made too).", { path: s("Like 'School/Math'."), color: s("Optional: red, orange, yellow, green, teal, blue, indigo, purple, pink, gray, or #hex."), icon: s(`Optional icon: one of ${FOLDER_ICONS.join(", ")}, or one emoji.`) }, ["path"]),
	fn("create_note", "Propose making a note with Markdown content.", { path: s("Like 'School/Math/Homework'."), content: s("The note's Markdown text. Start with a # heading.") }, ["path", "content"]),
	fn("edit_note", "Propose replacing a note's whole text with a new version.", { path: s("The note."), content: s("The complete new text.") }, ["path", "content"]),
	fn("append_to_note", "Propose adding text to the end of a note.", { path: s("The note."), text: s("Markdown to add.") }, ["path", "text"]),
	fn(
		"create_board",
		"Propose making a Trello-style board with lists and cards.",
		{
			path: s("Like 'Projects/Garden board'."),
			lists: {
				type: "array",
				description: "The board's lists, left to right.",
				items: { type: "object", properties: { name: s("List name"), cards: { type: "array", items: { type: "object", properties: { title: s("Card title"), description: s("Optional"), tags: { type: "array", items: { type: "string" } }, color: s("Optional color name"), due: s("Optional YYYY-MM-DD") }, required: ["title"] } } }, required: ["name"] },
			},
		},
		["path", "lists"]
	),
	fn("add_card", "Propose adding a card to a list on a board.", { board: s("The board note."), list: s("The list's name."), title: s("Card title."), description: s("Optional."), color: s("Optional color name."), due: s("Optional YYYY-MM-DD.") }, ["board", "list", "title"]),
	fn("move_item", "Propose moving a note or folder into another folder ('' for the top level).", { path: s("What to move."), to_folder: s("Where to.") }, ["path", "to_folder"]),
	fn("rename_item", "Propose renaming a note or folder.", { path: s("What to rename."), new_name: s("The new name only, not a path.") }, ["path", "new_name"]),
	fn("delete_item", "Propose deleting one note or folder (and everything in it). Only when the user clearly asks. Use clear_cave to delete everything.", { path: s("The exact name of what to delete, from list_cave.") }, ["path"]),
	fn("clear_cave", "Propose deleting every note and folder in the cave, to start fresh. Only when the user clearly asks to wipe, clear or delete everything."),
	fn("set_look", "Propose giving a folder or note a color and/or icon in the sidebar.", { path: s("The folder or note."), color: s("Color name or #hex, or 'none'."), icon: s(`One of ${FOLDER_ICONS.join(", ")}, one emoji, or 'none'.`) }, ["path"]),
	fn("set_home", "Propose making a note the cave's home page.", { path: s("The note.") }, ["path"]),
	fn(
		"change_appearance",
		"Propose changing how the app looks. Give only what should change. Call get_appearance first to see the choices.",
		{ theme: s("A theme name, applied first."), accent: s("Accent color, #hex or a color name."), material: s("solid, transparent, glass, frosted or liquid."), wallpaper: s("A wallpaper name, or 'none'."), heading_style: s("plain, underline, bar, accent, gradient or caps."), note_font: s("A font name."), sidebar_style: s("A sidebar style name."), corners: n("Corner rounding in pixels, 0 to 24."), text_size: n("Note text size in pixels, 12 to 26.") }
	),
	fn("remember", "Save one new, lasting fact about the person (their likes, projects, how they like to work) to your memory note. Not about the cave, its notes or folders, and never something already in your memory. At most once or twice per message.", { fact: s("One short sentence."), about: s('"person" (default) or "project": a fact about the project this chat belongs to, if it has one.') }, ["fact"]),
];

export const WRITES = new Set(["create_folder", "create_note", "edit_note", "append_to_note", "create_board", "add_card", "move_item", "rename_item", "delete_item", "clear_cave", "set_look", "set_home", "change_appearance"]);

const LOOKS_TOOLS = new Set(["get_appearance", "change_appearance"]);
const LOOKS_WORDS = /\b(theme|look|looks|appearance|colou?r|dark|light|font|wallpaper|background|glass|frosted|accent|corner|style|pretty|aesthetic|design)\b/i;

/** The tools for this message: the app's look only comes up when the user asks about it. */
export const toolsFor = (said: string) => TOOLS.filter((t) => !LOOKS_TOOLS.has(t.function.name) || LOOKS_WORDS.test(said));

// ---- Looking around ----

function caveTree(): string {
	const lines: string[] = [];
	const walk = (entries: typeof ws.tree, depth: number) => {
		for (const e of entries) {
			const look = ws.meta.looks[e.path] ?? {};
			const bits = [look.color && `color ${look.color}`, look.icon && `icon ${look.icon}`, e.path === ws.meta.home && "home page", e.kind === "file" && isBoardText(ws.texts.get(e.path) ?? "") && "board"].filter(Boolean);
			lines.push(`${"  ".repeat(depth)}${e.kind === "folder" ? "📁 " : "- "}${e.kind === "file" ? noteTitle(e.path) : e.name}${bits.length ? ` (${bits.join(", ")})` : ""}`);
			if (e.children) walk(e.children, depth + 1);
		}
	};
	walk(ws.tree, 0);
	return lines.length ? lines.join("\n") : "(The cave is empty.)";
}

function appearance(): string {
	const t = theme;
	return [
		`Now: material ${t.glass.material === "clear" ? "transparent" : t.glass.material}, accent ${t.colors.accent}, background ${t.background.kind === "wallpaper" ? WALLPAPERS[t.background.wallpaper]?.name : t.background.kind}, headings ${t.headings.style}, corners ${t.shape.radius}px, text ${t.type.size}px.`,
		`Themes: ${PRESETS.map((p) => p.name).join(", ")}.`,
		`Materials: solid, transparent, glass, frosted, liquid.`,
		`Wallpapers: ${Object.values(WALLPAPERS).map((w) => w.name).join(", ")}, none.`,
		`Fonts: ${Object.keys(FONT_CHOICES).join(", ")}.`,
		`Heading styles: plain, underline, bar, accent, gradient, caps.`,
		`Sidebar styles: ${SIDEBAR_STYLES.map((x) => x.name).join(", ")}.`,
	].join("\n");
}

/** Runs a looking-around tool and returns what the AI gets back. */
export function look(tool: string, a: Args): string {
	switch (tool) {
		case "list_cave":
			return caveTree();
		case "read_note": {
			const p = findNote(a.path);
			return p ? `${p}:\n\n${(ws.texts.get(p) ?? "").slice(0, 12000)}` : `There's no note called "${str(a.path)}". Use list_cave to see what exists.`;
		}
		case "search_notes": {
			const hits = recall(ws.texts, str(a.query), noteTitle, 6);
			return hits.length ? hits.map((h) => `${h.path}:\n${h.excerpt.slice(0, 300)}`).join("\n\n") : "Nothing found.";
		}
		case "list_tags":
			return [...ws.tags].map(([tag, paths]) => `#${tag}: ${paths.map(noteTitle).join(", ")}`).join("\n") || "No tags yet.";
		case "get_appearance":
			return appearance();
	}
	return "Unknown tool.";
}

/**
 * Checks a proposed change before it goes into the plan. Returns what's wrong
 * (sent back to the AI so it can fix it), or "" if it's fine. `planned` is the
 * plan so far, so a change may use a folder or note made earlier in the plan.
 */
export function check(tool: string, a: Args, planned: Change[]): string {
	const made = (p: string) => planned.some((c) => ["create_folder", "create_note", "create_board"].includes(c.tool) && [folderPath(c.args.path), notePath(c.args.path)].some((x) => x.toLowerCase() === p.toLowerCase()));
	// Once the plan clears the cave, only what the plan makes is left.
	const cleared = planned.some((c) => c.tool === "clear_cave");
	const there = (v: unknown) => !cleared && (!!findNote(v) || isFolder(folderPath(v)));
	const exists = (v: unknown) => there(v) || made(folderPath(v)) || made(notePath(v));
	const missing = (v: unknown) => `There's nothing called "${str(v)}". Use list_cave to see the real names, and only use those.`;
	const p = str(a.path);
	if (tool === "clear_cave") return cleared ? "That's already in the plan." : ws.files.length || ws.folders.length ? "" : "The cave is already empty.";
	if (tool === "change_appearance") return Object.keys(a).length ? "" : "Say what to change.";
	if (tool === "add_card") return !str(a.board) ? "Name the board." : exists(a.board) ? (str(a.title) ? "" : "Give the card a title.") : missing(a.board);
	if (!p) return "The path is empty. Give the name of the note or folder.";
	if (/[*?"<>|]/.test(p)) return `"${p}" has characters a file name can't have.`;
	if (planned.some((c) => c.tool === tool && JSON.stringify(c.args) === JSON.stringify(a))) return "That's already in the plan. Don't repeat it.";
	switch (tool) {
		case "create_folder":
			return there(p) && !a.color && !a.icon ? `The folder "${p}" already exists.` : "";
		case "create_note":
		case "create_board":
			return !cleared && ws.files.includes(notePath(p)) ? `"${p}" already exists. Use edit_note to change it.` : made(notePath(p)) ? `"${p}" is already in the plan.` : "";
		case "move_item":
			return exists(p) ? "" : missing(p);
		case "rename_item":
			return !exists(p) ? missing(p) : str(a.new_name) ? "" : "Give the new name.";
		case "set_home":
			return (!cleared && findNote(p)) || made(notePath(p)) ? "" : `There's no note called "${p}". Make it first (create_note), or pick a note from list_cave.`;
		default:
			return exists(p) ? "" : missing(p);
	}
}

/** What a proposed change does, in plain words, and its icon. */
export function describe(tool: string, a: Args): { summary: string; icon: IconName } {
	const p = str(a.path);
	switch (tool) {
		case "create_folder":
			return { summary: `Make the folder “${folderPath(p)}”`, icon: "folderPlus" };
		case "create_note":
			return { summary: `Write a new note “${notePath(p).replace(/\.md$/, "")}”`, icon: "pencil" };
		case "edit_note":
			return { summary: `Rewrite “${noteTitle(notePath(p))}”`, icon: "pencil" };
		case "append_to_note":
			return { summary: `Add to the end of “${noteTitle(notePath(p))}”`, icon: "pencil" };
		case "create_board":
			return { summary: `Make the board “${notePath(p).replace(/\.md$/, "")}” with ${(a.lists as unknown[] | undefined)?.length ?? 0} lists`, icon: "board" };
		case "add_card":
			return { summary: `Add the card “${str(a.title)}” to ${str(a.list)} on ${str(a.board)}`, icon: "board" };
		case "move_item":
			return { summary: `Move “${p}” into ${folderPath(a.to_folder) || "the top level"}`, icon: "folder" };
		case "rename_item":
			return { summary: `Rename “${p}” to “${str(a.new_name)}”`, icon: "pencil" };
		case "delete_item":
			return { summary: `Delete “${p}”`, icon: "trash" };
		case "clear_cave":
			return { summary: "Delete every note and folder in the cave", icon: "trash" };
		case "set_look":
			return { summary: `Give “${p}” ${[str(a.color) && `the color ${str(a.color)}`, str(a.icon) && `the icon ${str(a.icon)}`].filter(Boolean).join(" and ") || "no look"}`, icon: "palette" };
		case "set_home":
			return { summary: `Make “${noteTitle(notePath(p))}” the home page`, icon: "home" };
		case "change_appearance":
			return { summary: `Change the look: ${Object.entries(a).map(([k, v]) => `${k.replace("_", " ")} ${String(v)}`).join(", ")}`, icon: "palette" };
	}
	return { summary: tool, icon: "sparkles" };
}

// ---- Making changes ----

type Undo = () => Promise<unknown>;

/** Does one approved change and returns how to take it back. */
export async function apply(c: Change): Promise<Undo> {
	const a = c.args;
	const cave = ws.cave;
	if (!cave) throw new Error("No cave is open.");
	switch (c.tool) {
		case "create_folder": {
			const path = folderPath(a.path);
			const existed = isFolder(path);
			if (!existed) {
				await cave.mkdir(path);
				await ws.refresh();
			}
			const before = ws.meta.looks[path];
			if (color(a.color) || iconName(a.icon)) await ws.setLook(path, { color: color(a.color) || undefined, icon: iconName(a.icon) || undefined });
			return async () => {
				if (!existed) await ws.remove(path);
				else await ws.setLook(path, { color: before?.color ?? "", icon: before?.icon ?? "" });
			};
		}
		case "create_note": {
			const path = notePath(a.path);
			const made = await cave.create(parentOf(path), baseName(path).replace(/\.md$/i, ""), str(a.content) + "\n");
			await ws.refresh();
			return () => ws.remove(made);
		}
		case "edit_note":
		case "append_to_note":
		case "add_card": {
			const path = findNote(c.tool === "add_card" ? a.board : a.path);
			if (!path) throw new Error(`There's no note called “${str(c.tool === "add_card" ? a.board : a.path)}”.`);
			const old = ws.texts.get(path) ?? "";
			let next: string;
			if (c.tool === "edit_note") next = str(a.content) + "\n";
			else if (c.tool === "append_to_note") next = `${old.replace(/\s+$/, "")}\n\n${str(a.text)}\n`;
			else {
				const board = parseBoard(old);
				let col = board.columns.find((x) => x.name.toLowerCase() === str(a.list).toLowerCase());
				if (!col) board.columns.push((col = { id: `col:${str(a.list)}`, name: str(a.list), cards: [] }));
				col.cards.push({ ...blankCard(str(a.title)), description: str(a.description), color: str(a.color).toLowerCase() || undefined, due: str(a.due) || undefined });
				next = serializeBoard(board);
			}
			await ws.writeNote(path, next);
			return () => ws.writeNote(path, old);
		}
		case "create_board": {
			const path = notePath(a.path);
			const lists = (Array.isArray(a.lists) ? a.lists : []) as Array<{ name?: string; cards?: Array<Record<string, unknown>> }>;
			const board: Board = {
				head: "---\nbasalt: board\n---",
				columns: lists.map((l, i) => ({
					id: `col:${i}`,
					name: str(l.name) || `List ${i + 1}`,
					cards: (l.cards ?? []).map((card) => ({ ...blankCard(str(card.title) || "Card"), description: str(card.description), tags: Array.isArray(card.tags) ? card.tags.map((t) => str(t).replace(/^#/, "").toLowerCase()) : [], color: str(card.color).toLowerCase() || undefined, due: str(card.due) || undefined })),
				})),
			};
			const made = await cave.create(parentOf(path), baseName(path).replace(/\.md$/i, ""), serializeBoard(board));
			await ws.refresh();
			return () => ws.remove(made);
		}
		case "move_item": {
			const from = findNote(a.path) ?? folderPath(a.path);
			const to = folderPath(a.to_folder);
			if (to && !isFolder(to)) {
				await cave.mkdir(to);
				await ws.refresh();
			}
			const back = parentOf(from);
			await ws.move(from, to, null);
			return () => ws.move(joinPath(to, baseName(from)), back, null);
		}
		case "rename_item": {
			const from = findNote(a.path) ?? folderPath(a.path);
			const oldName = baseName(from).replace(/\.md$/i, "");
			await ws.rename(from, str(a.new_name));
			const isFile = from.endsWith(".md");
			const now = joinPath(parentOf(from), isFile ? `${str(a.new_name).replace(/\.md$/i, "")}.md` : str(a.new_name));
			return () => ws.rename(now, oldName);
		}
		case "delete_item": {
			const path = findNote(a.path) ?? folderPath(a.path);
			if (!ws.files.includes(path) && !isFolder(path)) throw new Error(`There's nothing called “${str(a.path)}”.`);
			// Keep a copy of everything, so undo can put it back.
			const inside = (f: string) => f === path || f.startsWith(`${path}/`);
			const back = await snapshot(inside);
			await ws.remove(path);
			return back;
		}
		case "clear_cave": {
			// Pictures (in attachments) stay, since undo can only bring back text.
			const top = ws.tree.filter((e) => e.name !== "attachments").map((e) => e.path);
			const back = await snapshot((f) => top.some((t) => f === t || f.startsWith(`${t}/`)));
			for (const t of top) await ws.remove(t);
			const home = ws.meta.home;
			ws.meta.home = undefined;
			await ws.saveMeta();
			return async () => {
				await back();
				ws.meta.home = home;
				await ws.saveMeta();
			};
		}
		case "set_look": {
			const path = findNote(a.path) ?? folderPath(a.path);
			const before = { ...ws.meta.looks[path] };
			const next: { color?: string; icon?: string } = {};
			if (a.color != null) next.color = str(a.color) === "none" ? "" : color(a.color);
			if (a.icon != null) next.icon = str(a.icon) === "none" ? "" : iconName(a.icon);
			await ws.setLook(path, next);
			return () => ws.setLook(path, { color: before.color ?? "", icon: before.icon ?? "" });
		}
		case "set_home": {
			const path = findNote(a.path);
			if (!path) throw new Error(`There's no note called “${str(a.path)}”.`);
			const before = ws.meta.home;
			await ws.setHome(path);
			return async () => {
				ws.meta.home = before;
				await ws.saveMeta();
			};
		}
		case "change_appearance": {
			const before = cloneTheme(theme);
			changeAppearance(a);
			return async () => useTheme(before);
		}
	}
	throw new Error("Basalt doesn't know how to do that yet.");
}

/** Copies the notes, folders and looks that match, and returns how to put them back. */
async function snapshot(match: (path: string) => boolean): Promise<Undo> {
	const cave = ws.cave!;
	const files: Array<[string, string]> = [];
	for (const f of ws.files.filter(match)) files.push([f, ws.texts.get(f) ?? (await cave.read(f))]);
	const folders = ws.folders.filter(match);
	const looks = Object.entries(ws.meta.looks).filter(([p]) => match(p));
	return async () => {
		for (const f of folders) await cave.mkdir(f);
		for (const [f, text] of files) await cave.write(f, text);
		await ws.refresh();
		for (const [p, l] of looks) await ws.setLook(p, l);
	};
}

function changeAppearance(a: Args) {
	const named = <T extends { name: string }>(list: T[], v: unknown) => list.find((x) => x.name.toLowerCase() === str(v).toLowerCase());
	const preset = named(PRESETS, a.theme);
	if (preset) useTheme(preset);
	const accent = color(a.accent);
	if (accent) Object.assign(theme.colors, { accent, link: accent });
	const material = str(a.material).toLowerCase().replace("transparent", "clear") as keyof typeof GLASS_DEFAULTS;
	if (material in GLASS_DEFAULTS) Object.assign(theme.glass, GLASS_DEFAULTS[material], { seamless: material === "clear", floating: material === "liquid" || theme.glass.floating });
	const wall = str(a.wallpaper).toLowerCase();
	if (wall === "none") theme.background.kind = "none";
	else if (wall) {
		const id = Object.keys(WALLPAPERS).find((k) => WALLPAPERS[k].name.toLowerCase() === wall || k === wall);
		if (id) Object.assign(theme.background, { kind: "wallpaper", wallpaper: id });
	}
	const hs = str(a.heading_style).toLowerCase();
	if (["plain", "underline", "bar", "accent", "gradient", "caps"].includes(hs)) theme.headings.style = hs as HeadingStyle;
	const font = Object.keys(FONT_CHOICES).find((f) => f.toLowerCase() === str(a.note_font).toLowerCase());
	if (font) theme.type.editorFont = FONT_CHOICES[font];
	const side = named(SIDEBAR_STYLES, a.sidebar_style);
	if (side) Object.assign(theme.sidebar, side.looks, { marker: theme.sidebar.marker });
	if (typeof a.corners === "number") theme.shape.radius = Math.max(0, Math.min(24, Math.round(a.corners)));
	if (typeof a.text_size === "number") theme.type.size = Math.max(12, Math.min(26, Math.round(a.text_size)));
}

/** A little context about where the user is, for the AI. */
export function context(): string {
	const open = ws.note;
	const props = open ? readProps(ws.texts.get(open) ?? "") : null;
	return [
		`Cave: ${ws.cave?.name ?? "none"} (${ws.files.length} notes, ${ws.folders.length} folders).`,
		open ? `Open note: ${open}${props?.description ? ` — ${props.description}` : ""}${isBoardText(ws.texts.get(open) ?? "") ? " (a board)" : ""}.` : "No note is open.",
	].join("\n");
}

export type { Theme };
