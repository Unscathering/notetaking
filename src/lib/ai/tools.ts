// What the AI can do in Basalt. Looking around (reading notes, searching,
// checking the theme) happens straight away. Anything that changes the cave or
// the app is only *proposed*: it becomes a line in a plan the user approves,
// and every change knows how to undo itself.
import { baseName, joinPath, noteTitle, parentOf } from "../cave";
import { blankCard, isBoardText, parseBoard, serializeBoard, type Board } from "../board";
import { readProps, writeProps } from "../notes";
import { recall } from "./recall";
import { lookUp, TOPICS } from "./manual";
import { parseSpec } from "../query";
import { fill, templates } from "../templates";
import { COLORWAYS, KOMOREBI_HOME } from "../komorebi";
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
	/** While the plan is being carried out. */
	state?: "doing" | "done" | "failed";
}

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const folderPath = (v: unknown) => {
	const p = str(v).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	// Small models sometimes start a path with the cave's own name ("My cave/School").
	const cave = ws.cave?.name;
	return cave && p.toLowerCase().startsWith(`${cave.toLowerCase()}/`) && !ws.folders.includes(p.split("/")[0]) ? p.slice(cave.length + 1) : p;
};
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
	fn("basalt_help", `Look something up in Basalt's manual before writing anything Basalt-specific: live blocks (\`\`\`basalt lists for dashboards), CSS snippets and their classes and colors, templates, habits, embeds, themes. Topics: ${TOPICS.join(", ")}.`, { question: s("What you want to know, like 'live block keys' or 'CSS for dashboards'.") }, ["question"]),
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
		"create_space",
		"Propose a whole area of the cave in one go: a folder with a color and icon, and a ready-made dashboard note inside it (live lists of its notes and tasks). Use this, not create_folder plus create_note, when the user wants folders with dashboards or a 'second brain'. Basalt writes the dashboard; you only give the name and a line about it.",
		{ name: s("The folder's name, like 'Writing'."), about: s("One short line: what goes in it."), color: s("red, orange, yellow, green, teal, blue, indigo, purple, pink or gray."), icon: s(`One of ${FOLDER_ICONS.join(", ")}, or one emoji.`) },
		["name", "about"]
	),
	fn(
		"create_home",
		"Propose a home page: a dashboard note that links to every area's dashboard and shows what's due, made the cave's home page. Basalt writes it. Use it once, after create_space for each area. style 'komorebi' makes it a frosted-glass dashboard with a clock header, tiles for the areas, a calendar, a focus timer and quick capture.",
		{ title: s("The page's name; 'Home' if left out."), spaces: { type: "array", items: { type: "string" }, description: "The names of the areas (folders) to link to." }, style: s("Optional: 'plain' (default) or 'komorebi'."), colorway: s("For komorebi: indigo, crimson (red), sakura (pink), matcha (green), ember (orange), glacier (light blue) or mono (gray).") },
		["spaces"]
	),
	fn(
		"create_dashboard",
		"Propose a dashboard: Basalt writes the live lists for you. To turn a note the user has into a dashboard, give that note's own name as path (like 'Cell notes'): the lists are added to the end of it. A path that doesn't exist makes a new dashboard note. Use this instead of writing ```basalt blocks yourself. Keep it small: only the sections asked for, or 2 or 3 if they didn't say. People add more pieces with the + on any block, and pin, hide and drag notes into order themselves.",
		{
			path: s("The note, like 'School/School dashboard'."),
			folder: s("Optional: only show what's in this folder."),
			sections: { type: "array", description: "What to show, in order.", items: { type: "string", enum: ["notes", "recent", "tasks", "due_this_week", "overdue", "tags", "habits", "calendar", "timer", "capture", "actions"] } },
			style: s("Optional: 'plain' (default) or 'komorebi' (frosted-glass tiles with a clock header; only for a new note)."),
			colorway: s("For komorebi: indigo, crimson (red), sakura (pink), matcha (green), ember (orange), glacier (light blue) or mono (gray)."),
		},
		["path", "sections"]
	),
	fn(
		"restyle_dashboard",
		"Propose changing how a dashboard looks: its color (a Komorebi color way, or any color by name or #hex) or its style. Use this for 'make it red', 'make my dashboards blue'. For several dashboards, call it once for each.",
		{
			path: s("The dashboard note."),
			colorway: s("Optional: indigo, crimson (red), sakura (pink), matcha (green), ember (orange), glacier (light blue) or mono (gray)."),
			color: s("Optional: any color as a name or #hex, for its labels and glow."),
			style: s("Optional: 'komorebi' (frosted glass tiles) or 'plain'."),
		},
		["path"]
	),
	fn(
		"add_live_block",
		"Propose adding one live list (a ```basalt block) to the end of a note. Look up the keys with basalt_help first if unsure.",
		{
			path: s("The note."),
			title: s("A heading above it."),
			list: s("notes, picked (only the notes named in notes), tasks, tags, backlinks or habits."),
			show: s("list, cards, table or count."),
			from: s("Optional: only notes in these folders, separated by commas. Use this to list a folder, like 'Recipes'."),
			tag: s("Optional: only notes with this #tag (not for folders)."),
			where: s("Optional: a property test, like 'status = active'."),
			due: s("Optional, for tasks: today, week, overdue or any."),
			sort: s("Optional: name, due, folder or a property; '-' in front reverses."),
			limit: n("Optional: how many."),
			group: s("Optional: folder or tag, to split the list under small headings."),
			notes: { type: "array", items: { type: "string" }, description: "Optional: notes to put in the list by name, in order (for list 'picked', or added to the others)." },
		},
		["path", "list"]
	),
	fn(
		"create_project",
		"Propose a whole project in one go: a folder (inside 'Projects' unless told otherwise) with a project note (its goal, ideas and a log) and a board whose To do list holds the steps.",
		{ name: s("The project's name."), goal: s("One or two sentences: what done looks like."), steps: { type: "array", items: { type: "string" }, description: "The first steps, short." }, parent: s("Optional: the folder to put it in; 'Projects' if left out."), color: s("Optional color name."), icon: s(`Optional: one of ${FOLDER_ICONS.join(", ")}, or one emoji.`) },
		["name", "goal"]
	),
	fn("note_from_template", "Propose a note made from one of the cave's templates (like Meeting, Project, Book notes, Weekly review, Daily note).", { template: s("The template's name."), path: s("The new note, like 'Work/Meeting with Sam'.") }, ["template", "path"]),
	fn(
		"create_snippet",
		"Propose a CSS snippet: a stylesheet that customizes how Basalt looks beyond the appearance settings (for one kind of note with cssclass, or the whole app). Look up the class names and theme colors with basalt_help first. It's turned on straight away.",
		{ name: s("A short file name, like 'purple-headings'."), css: s("The CSS. Use theme variables like var(--accent) rather than fixed colors.") },
		["name", "css"]
	),
	fn(
		"change_appearance",
		"Propose changing how the app looks. Give only what should change. Call get_appearance first to see the choices.",
		{ theme: s("A theme name, applied first."), accent: s("Accent color, #hex or a color name."), material: s("solid, transparent, glass, frosted or liquid."), wallpaper: s("A wallpaper name, or 'none'."), heading_style: s("plain, underline, bar, accent, gradient or caps."), heading_position: s("left, title (the title and top headings centered) or center (every heading centered)."), note_font: s("A font name."), sidebar_style: s("A sidebar style name."), corners: n("Corner rounding in pixels, 0 to 24."), text_size: n("Note text size in pixels, 12 to 26.") }
	),
	fn("remember", "Save one new, lasting fact about the person (their likes, projects, how they like to work) to your memory note. Not about the cave, its notes or folders, and never something already in your memory. At most once or twice per message.", { fact: s("One short sentence."), about: s('"person" (default) or "project": a fact about the project this chat belongs to, if it has one.') }, ["fact"]),
];

export const WRITES = new Set(["create_folder", "create_note", "edit_note", "append_to_note", "create_board", "add_card", "move_item", "rename_item", "delete_item", "clear_cave", "set_look", "set_home", "create_space", "create_home", "create_dashboard", "restyle_dashboard", "add_live_block", "create_project", "note_from_template", "create_snippet", "change_appearance"]);

// ---- Only the tools a request needs ----
// Every tool's instructions take room and attention; a small model picks the
// right one much more often from 8 than from 25. The looking-around tools are
// always there; the rest come in groups.

export type Group = "organize" | "write" | "boards" | "dashboards" | "style";
export const GROUPS: Record<Group, { about: string; tools: string[]; words: RegExp }> = {
	organize: {
		about: "making, moving, renaming or deleting folders and notes; setting up the cave, areas, projects or a home page",
		tools: ["create_folder", "create_space", "create_home", "create_project", "move_item", "rename_item", "delete_item", "clear_cave", "set_look", "set_home"],
		words: /\b(folders?|organi[sz]e|move|rename|delete|remove|wipe|clear|sort|tidy|clean|set ?up|second brain|cave|areas?|projects?|home ?page|icons?)\b/i,
	},
	write: {
		about: "writing, editing or adding to notes; notes from templates",
		tools: ["create_note", "edit_note", "append_to_note", "note_from_template"],
		words: /\b(write|notes?|draft|summari[sz]e|add|edit|rewrite|templates?|meeting|journal|daily|list|outline|essay|plan)\b/i,
	},
	boards: {
		about: "Trello-style boards and their cards",
		tools: ["create_board", "add_card"],
		words: /\b(boards?|kanban|trello|cards?)\b/i,
	},
	dashboards: {
		about: "dashboards, live lists of notes or tasks, trackers, home pages",
		tools: ["create_dashboard", "restyle_dashboard", "add_live_block", "create_space", "create_home"],
		words: /\b(dashboards?|overview|live|trackers?|tracking|home ?page|tasks?|habits?)\b/i,
	},
	style: {
		about: "how the app looks: themes, colors, fonts, wallpaper, CSS snippets, customizing",
		tools: ["get_appearance", "change_appearance", "create_snippet", "restyle_dashboard"],
		words: /\b(theme|looks?|appearance|colou?rs?|dark|light|fonts?|wallpaper|background|glass|frosted|accent|corners?|style|styling|pretty|aesthetic|design|css|snippets?|customi[sz]e|red|blue|green|pink|purple|orange|yellow|teal|black|white|gr[ae]y|crimson)\b/i,
	},
};
const ALWAYS = new Set(["list_cave", "read_note", "search_notes", "list_tags", "basalt_help", "remember"]);

/** The groups a message's words point to. */
export const groupsByWords = (said: string) => (Object.keys(GROUPS) as Group[]).filter((g) => GROUPS[g].words.test(said));

/** The tools for these groups, in the usual order (so the start of the request stays the same and the engine can reuse it). */
export function toolsFor(groups: Iterable<Group>) {
	const names = new Set(ALWAYS);
	for (const g of groups) for (const t of GROUPS[g].tools) names.add(t);
	return TOOLS.filter((t) => names.has(t.function.name));
}

/** The group a tool belongs to, to say what wasn't offered. */
export const groupOf = (tool: string) => (Object.keys(GROUPS) as Group[]).find((g) => GROUPS[g].tools.includes(tool));

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
		case "basalt_help":
			return lookUp(str(a.question));
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
	if (tool === "create_snippet") {
		const css = str(a.css);
		if (!snippetName(a.name)) return "Give the snippet a short name, like 'purple-headings'.";
		if (!css || !css.includes("{")) return "Give the CSS, with selectors and { } blocks.";
		if (css.split("{").length !== css.split("}").length) return "The CSS's { and } don't match up. Check it and try again.";
		return /@import|url\(\s*['"]?(https?:|\/\/)/i.test(css) ? "Snippets can't load files from the internet." : selectorProblem(css);
	}
	if (tool === "create_project") {
		const name = folderPath(a.name);
		if (!name || name.includes("/")) return "Give the project a simple name.";
		const folder = joinPath(folderPath(a.parent) || "Projects", name);
		return there(folder) || made(folder) || planned.some((c) => c.tool === "create_project" && folderPath(c.args.name).toLowerCase() === name.toLowerCase()) ? `"${folder}" already exists. Pick another name.` : "";
	}
	if (tool === "note_from_template") {
		if (!templates().some((t) => t.name.toLowerCase() === str(a.template).toLowerCase())) return `There's no template called "${str(a.template)}". Templates: ${templates().map((t) => t.name).join(", ")}.`;
		return !p ? "Give the new note's name." : !cleared && ws.files.includes(notePath(p)) ? `"${p}" already exists.` : "";
	}
	if (tool === "create_dashboard") {
		const sections = Array.isArray(a.sections) ? a.sections : [];
		if (!sections.length) return "Say what the dashboard shows (sections).";
		const f = folderPath(a.folder);
		return f && !exists(f) ? missing(f) : !p ? "Give the dashboard note's name." : "";
	}
	if (tool === "restyle_dashboard") {
		if (!p) return "Name the dashboard note.";
		if (!findNote(p)) return missing(p);
		const way = str(a.colorway).toLowerCase();
		if (way && !COLORWAYS.some((c) => c.id === way)) return `There's no color way called "${way}". Use ${COLORWAYS.map((c) => c.id).join(", ")}, or give color instead.`;
		if (str(a.color) && !color(a.color)) return `"${str(a.color)}" isn't a color Basalt knows. Use a color name or #hex.`;
		return way || str(a.color) || str(a.style) ? "" : "Say what to change: colorway, color or style.";
	}
	if (tool === "add_live_block") {
		if (!p) return "Name the note to add it to.";
		if (!exists(p)) return missing(p);
		const spec = parseSpec(liveBlock(a));
		if (spec.unknown.length) return `These parts aren't right: ${spec.unknown.join("; ")}. Look up the keys with basalt_help.`;
		return tagProblem(spec.tag, ws.tags.has(spec.tag), ws.folders);
	}
	if (tool === "add_card") return !str(a.board) ? "Name the board." : exists(a.board) ? (str(a.title) ? "" : "Give the card a title.") : missing(a.board);
	if (tool === "create_space") {
		const name = folderPath(a.name);
		if (!name || name.includes("/")) return "Give the area a simple name, like 'Writing'.";
		if (planned.some((c) => c.tool === "create_space" && folderPath(c.args.name).toLowerCase() === name.toLowerCase())) return `"${name}" is already in the plan.`;
		// An existing folder just gets the dashboard (and the look) added.
		return there(name) && ws.files.includes(`${name}/${name} dashboard.md`) ? `"${name}" already has a dashboard.` : "";
	}
	if (tool === "create_home") {
		if (planned.some((c) => c.tool === "create_home")) return "The home page is already in the plan.";
		const title = str(a.title) || "Home";
		return !cleared && ws.files.includes(notePath(title)) ? `"${title}" already exists. Pick another title.` : "";
	}
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
		case "create_space":
			return { summary: `${isFolder(folderPath(a.name)) ? "Give" : "Make"} the area “${folderPath(a.name)}” ${isFolder(folderPath(a.name)) ? "a" : "with its own"} dashboard${str(a.about) ? `: ${str(a.about)}` : ""}`, icon: "folderPlus" };
		case "create_home":
			return { summary: `Make a home page “${str(a.title) || "Home"}” linking to ${(Array.isArray(a.spaces) ? a.spaces : []).length || "every"} areas`, icon: "home" };
		case "create_dashboard":
			return { summary: `${findNote(p) ? "Turn" : "Make"} “${noteTitle(notePath(p))}” ${findNote(p) ? "into" : "as"} a dashboard: ${(Array.isArray(a.sections) ? a.sections : []).map((x) => SECTIONS[str(x)]?.title.toLowerCase() ?? str(x)).join(", ")}`, icon: "layers" };
		case "restyle_dashboard":
			return { summary: `Give “${noteTitle(notePath(p))}” ${[str(a.style) && `the ${str(a.style)} style`, str(a.colorway) && `the ${str(a.colorway)} color way`, str(a.color) && `the color ${str(a.color)}`].filter(Boolean).join(" and ") || "a new look"}`, icon: "palette" };
		case "add_live_block":
			return { summary: `Add a live list${str(a.title) ? ` “${str(a.title)}”` : ""} to “${noteTitle(notePath(p))}”`, icon: "layers" };
		case "create_project":
			return { summary: `Start the project “${folderPath(a.name)}”: a folder, a project note and a board${Array.isArray(a.steps) && a.steps.length ? ` with ${a.steps.length} steps` : ""}`, icon: "folderPlus" };
		case "note_from_template":
			return { summary: `Write “${notePath(p).replace(/\.md$/, "")}” from the ${str(a.template)} template`, icon: "pencil" };
		case "create_snippet":
			return { summary: `Add the CSS snippet “${snippetName(a.name)}” and turn it on`, icon: "palette" };
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
		case "create_space": {
			const name = folderPath(a.name);
			const existed = isFolder(name);
			const look = { ...ws.meta.looks[name] };
			if (!existed) await cave.mkdir(name);
			const dashboard = await cave.create(name, `${name} dashboard`, spaceDashboard(name, str(a.about)));
			await ws.refresh();
			await ws.setLook(name, { color: color(a.color) || look.color, icon: iconName(a.icon) || look.icon });
			await useDashboardSnippet();
			return async () => {
				await ws.remove(dashboard);
				if (!existed) await ws.remove(name);
				else await ws.setLook(name, { color: look.color ?? "", icon: look.icon ?? "" });
			};
		}
		case "create_home": {
			const title = str(a.title) || "Home";
			const spaces = (Array.isArray(a.spaces) ? a.spaces : []).map((x) => folderPath(x)).filter(Boolean);
			const areas = spaces.length ? spaces : ws.folders.filter((f) => !f.includes("/"));
			const komorebi = str(a.style).toLowerCase() === "komorebi";
			const made = await cave.create("", title, komorebi ? komorebiHome(title, areas, str(a.colorway)) : homeDashboard(title, areas));
			await ws.refresh();
			const before = ws.meta.home;
			await ws.setHome(made);
			await (komorebi ? useLook("komorebi") : useDashboardSnippet());
			return async () => {
				ws.meta.home = before;
				await ws.saveMeta();
				await ws.remove(made);
			};
		}
		case "create_dashboard": {
			const sections = (Array.isArray(a.sections) ? a.sections : []).map(str);
			const existing = findNote(a.path);
			if (existing) {
				const old = ws.texts.get(existing) ?? "";
				const props = readProps(old);
				const classes = new Set([...(props.other.cssclass ?? "").split(/[\s,]+/).filter(Boolean), "dashboard"]);
				props.other.cssclass = [...classes].join(" ");
				await ws.writeNote(existing, `${writeProps(old, props).replace(/\s+$/, "")}\n\n${dashboardBlocks(sections, folderPath(a.folder))}\n`);
				await useDashboardSnippet();
				return () => ws.writeNote(existing, old);
			}
			const path = notePath(a.path);
			const title = baseName(path).replace(/\.md$/i, "");
			const komorebi = str(a.style).toLowerCase() === "komorebi";
			const body = komorebi ? komorebiDashboard(title, sections, folderPath(a.folder), str(a.colorway)) : `---\ncssclass: dashboard\n---\n# ${title}\n\n${dashboardBlocks(sections, folderPath(a.folder))}\n`;
			const made = await cave.create(parentOf(path), title, body);
			await ws.refresh();
			await (komorebi ? useLook("komorebi") : useDashboardSnippet());
			return () => ws.remove(made);
		}
		case "restyle_dashboard": {
			const path = findNote(a.path);
			if (!path) throw new Error(`There's no note called “${str(a.path)}”.`);
			const old = ws.texts.get(path) ?? "";
			const props = readProps(old);
			const ways = COLORWAYS.map((c) => c.id);
			let classes = (props.other.cssclass ?? props.other.cssclasses ?? "").replace(/[[\]"']/g, " ").split(/[\s,]+/).filter(Boolean);
			const style = str(a.style).toLowerCase();
			const komorebi = style === "komorebi" || (style !== "plain" && (classes.includes("komorebi") || !!str(a.colorway) || !!str(a.color)));
			classes = classes.filter((c) => c !== "komorebi" && (!str(a.colorway) || !ways.includes(c)));
			if (!classes.includes("dashboard")) classes.unshift("dashboard");
			if (komorebi) classes.push("komorebi");
			if (str(a.colorway)) classes.push(str(a.colorway).toLowerCase());
			delete props.other.cssclasses;
			props.other.cssclass = classes.join(" ");
			if (str(a.color)) props.other.accent = color(a.color);
			else if (str(a.colorway)) delete props.other.accent;
			await ws.writeNote(path, writeProps(old, props));
			if (komorebi) await useLook("komorebi");
			return () => ws.writeNote(path, old);
		}
		case "add_live_block": {
			const path = findNote(a.path);
			if (!path) throw new Error(`There's no note called “${str(a.path)}”.`);
			const old = ws.texts.get(path) ?? "";
			await ws.writeNote(path, `${old.replace(/\s+$/, "")}\n\n\`\`\`basalt\n${liveBlock(a)}\n\`\`\`\n`);
			return () => ws.writeNote(path, old);
		}
		case "create_project": {
			const name = folderPath(a.name);
			const folder = joinPath(folderPath(a.parent) || "Projects", name);
			const steps = (Array.isArray(a.steps) ? a.steps : []).map(str).filter(Boolean);
			const parentExisted = isFolder(parentOf(folder));
			await cave.mkdir(folder);
			const note = await cave.create(folder, name, `# ${name}\n\n> [!note] Goal\n> ${str(a.goal).replace(/\n+/g, " ")}\n\n## Steps\nOn the [[${name} board]]: move each card along as it gets done.\n\n## Ideas and links\n\n\n## Log\n- ${new Date().toISOString().slice(0, 10)}: Started.\n`);
			const board: Board = { head: "---\nbasalt: board\n---", columns: ["To do", "Doing", "Done"].map((col, i) => ({ id: `col:${i}`, name: col, cards: i === 0 ? steps.map((x) => blankCard(x)) : [] })) };
			const boardPath = await cave.create(folder, `${name} board`, serializeBoard(board));
			await ws.refresh();
			if (color(a.color) || iconName(a.icon)) await ws.setLook(folder, { color: color(a.color) || undefined, icon: iconName(a.icon) || undefined });
			return async () => {
				await ws.remove(boardPath);
				await ws.remove(note);
				await ws.remove(folder);
				if (!parentExisted && !ws.files.some((f) => f.startsWith(`${parentOf(folder)}/`))) await ws.remove(parentOf(folder));
			};
		}
		case "note_from_template": {
			const t = templates().find((x) => x.name.toLowerCase() === str(a.template).toLowerCase());
			if (!t) throw new Error(`There's no template called “${str(a.template)}”.`);
			const path = notePath(a.path);
			const title = baseName(path).replace(/\.md$/i, "");
			const made = await cave.create(parentOf(path), title, fill(t.path ? await cave.read(t.path) : t.text(), title));
			await ws.refresh();
			return () => ws.remove(made);
		}
		case "create_snippet": {
			const { loadSnippets, saveSnippet, toggleSnippet, deleteSnippet, snippets } = await import("../snippets.svelte");
			await loadSnippets();
			const name = `${snippetName(a.name)}.css`;
			const before = snippets.texts[name];
			const wasOn = (ws.meta.snippets ?? []).includes(name);
			await saveSnippet(name, `${str(a.css)}\n`);
			await toggleSnippet(name, true);
			return async () => {
				if (before == null) await deleteSnippet(name);
				else {
					await saveSnippet(name, before);
					await toggleSnippet(name, wasOn);
				}
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

// ---- Ready-made dashboards (so the AI doesn't have to write them) ----

const blocks = (...parts: string[]) => parts.map((p) => `\`\`\`basalt\n${p}\n\`\`\``).join("\n\n");

/** An area's dashboard: what it's for, its notes as cards, its open tasks, and notes tagged with it. */
function spaceDashboard(name: string, about: string): string {
	const tag = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-");
	return `---
cssclass: dashboard
description: ${about || `Everything about ${name.toLowerCase()}.`}
---
# ${name}

${blocks(`title: Notes
from: ${name}
show: cards
sort: name`, `title: Open tasks
list: tasks
from: ${name}`, `title: Due this week
list: tasks
from: ${name}
due: week
show: count`)}

## Ideas and next steps
- [ ] 

Tag notes elsewhere with #${tag} to keep them connected to ${name}.
`;
}

/** The home page: every area's dashboard, what's due, and habits. */
function homeDashboard(title: string, spaces: string[]): string {
	return `---
cssclass: dashboard
description: Where every day starts.
---
# ${title}

## Areas
${spaces.map((s) => `- [[${s} dashboard|${s}]]`).join("\n")}

${blocks(`title: Due this week
list: tasks
due: week`, `title: Overdue
list: tasks
due: overdue
show: count`, `title: Habits
list: habits
days: 14`)}
`;
}

/** What a dashboard can show, and the block for each. */
const SECTIONS: Record<string, { title: string; block: (from: string) => string }> = {
	notes: { title: "Notes", block: (f) => `title: Notes${f ? `\nfrom: ${f}` : ""}\nshow: cards\nsort: name\nlimit: 8` },
	recent: { title: "Recent notes", block: (f) => `title: Recent notes${f ? `\nfrom: ${f}` : ""}\nsort: -name\nlimit: 8` },
	tasks: { title: "Open tasks", block: (f) => `title: Open tasks\nlist: tasks${f ? `\nfrom: ${f}` : ""}` },
	due_this_week: { title: "Due this week", block: (f) => `title: Due this week\nlist: tasks${f ? `\nfrom: ${f}` : ""}\ndue: week` },
	overdue: { title: "Overdue", block: (f) => `title: Overdue\nlist: tasks${f ? `\nfrom: ${f}` : ""}\ndue: overdue\nshow: count` },
	tags: { title: "Tags", block: (f) => `title: Tags${f ? `\nfrom: ${f}` : ""}\nlist: tags\nlimit: 12` },
	habits: { title: "Habits", block: () => "title: Habits\nlist: habits\ndays: 21" },
	calendar: { title: "Calendar", block: () => "title: Calendar\nlist: calendar" },
	timer: { title: "Focus timer", block: () => "title: Focus timer\nlist: timer\ntext: 25" },
	capture: { title: "Quick capture", block: (f) => `title: Quick capture\nlist: capture\nto: ${f ? `${f}/Inbox` : "Inbox"}` },
	actions: { title: "Quick actions", block: () => "title: Quick actions\nlist: actions" },
};
const dashboardBlocks = (sections: string[], from: string) => blocks(...sections.filter((x) => x in SECTIONS).map((x) => SECTIONS[x].block(from)));

/** A live block's lines from the AI's answers, keeping only what was given. */
function liveBlock(a: Args): string {
	return [
		...["title", "list", "show", "from", "tag", "where", "due", "sort", "limit", "group"]
			.map((k) => [k, str(a[k])])
			.filter(([, v]) => v)
			.map(([k, v]) => `${k}: ${v}`),
		...(Array.isArray(a.notes) ? a.notes.map((x) => `note: ${str(x)}`) : []),
	].join("\n");
}

/**
 * A live list by a tag no note has, where a folder has that name ("tag:
 * recipe" with a Recipes folder), is meant to list the folder, and so is a
 * list that names nothing to list by but is titled like a folder: they're put
 * right before they're checked. Shared with the model test.
 */
export function fixLiveBlock(a: Args, tagUsed: (tag: string) => boolean, folders: string[], asked = "", files: string[] = []): Args {
	const stem = folderStem;
	const folderNamed = (name: string) => folders.find((f) => stem(f.split("/").pop()!) === stem(name));
	// Every note of one folder, picked one by one ("all my recipes"), is that folder: new ones show up too.
	const picked = Array.isArray(a.notes) ? a.notes.map((n) => str(n).replace(/\.md$/i, "")) : [];
	if (picked.length > 1) {
		const folder = picked[0].includes("/") ? picked[0].split("/").slice(0, -1).join("/") : "";
		const inside = files.filter((f) => f.startsWith(`${folder}/`) && !f.slice(folder.length + 1).includes("/")).map((f) => f.replace(/\.md$/i, ""));
		if (folder && inside.length && inside.every((f) => picked.includes(f)) && picked.every((p) => inside.includes(p))) {
			const { notes: _, ...rest } = a;
			return { ...rest, list: "notes", from: folder };
		}
	}
	// A list of notes that names nothing to list by, where the request names a folder ("all my recipes"), lists that folder.
	if (!str(a.from) && !str(a.tag) && !str(a.where) && !str(a.search) && !picked.length && ["", "notes"].includes(str(a.list)) && !str(a.title)) {
		const named = folders.filter((f) => new RegExp(`\\b${stem(f.split("/").pop()!)}(e?s)?\\b`, "i").test(asked));
		if (named.length === 1) return { ...a, from: named[0] };
	}
	// A list of notes that names nothing to list by, titled like a folder ("Recipes"), lists that folder.
	if (!str(a.from) && !str(a.tag) && !str(a.where) && !str(a.search) && ["", "notes"].includes(str(a.list)) && str(a.title) && folderNamed(str(a.title))) return { ...a, from: folderNamed(str(a.title)) };
	const tag = str(a.tag).replace(/^#/, "").toLowerCase();
	if (!tag || tagUsed(tag) || str(a.from)) return a;
	const folder = folderNamed(tag);
	if (!folder) return a;
	const { tag: _, ...rest } = a;
	return { ...rest, from: folder, list: str(a.list) === "tags" ? "notes" : a.list };
}

/** Changes whose `path` is a note the user may have named ("my ideas note"). */
export const NAMES_A_NOTE = new Set(["add_live_block", "append_to_note", "edit_note", "restyle_dashboard", "create_dashboard"]);

/** A folder or tag name without its plural ending, to match "Recipes" with "recipe" and "Stories" with "story". */
export const folderStem = (w: string) =>
	w
		.toLowerCase()
		.replace(/ies$/, "y")
		.replace(/(ch|sh|x|ss)es$/, "$1")
		.replace(/(?<!s)s$/, "");

/**
 * "My ideas note" means the note called Ideas, even when a note like "Ideas for
 * the shop" exists too: if the request names a note that exists by that exact
 * name and the AI picked another one, the named one is used.
 */
export function fixNotePath(a: Args, asked: string, notes: string[]): Args {
	const path = str(a.path);
	if (!path) return a;
	const titleOf = (p: string) => p.replace(/\.md$/i, "").split("/").pop()!.toLowerCase();
	const words = asked.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
	for (let i = 0; i < words.length; i++) {
		if (words[i] !== "note") continue;
		for (let n = Math.min(4, i); n >= 1; n--) {
			const name = words.slice(i - n, i).join(" ");
			const exact = notes.find((p) => titleOf(p) === name);
			if (exact) return titleOf(path) === name ? a : { ...a, path: exact.replace(/\.md$/i, "") };
		}
	}
	return a;
}

/**
 * A live list by a tag no note has would show nothing; usually the AI meant a
 * folder ("tag: recipe" for the Recipes folder). Shared with the model test.
 */
export function tagProblem(tag: string, used: boolean, folders: string[]): string {
	if (!tag || used) return "";
	const stem = folderStem;
	const folder = folders.find((f) => stem(f.split("/").pop()!) === stem(tag));
	return `No note has the tag #${tag}, so the list would be empty.${folder ? ` To list the notes in the ${folder} folder, use from: ${folder} instead of tag.` : ""}`;
}

/**
 * Selectors in a snippet that can't match anything in Basalt (small models make
 * up things like note[data-type='dashboard']). Shared with the model test.
 */
export function strangeSelectors(css: string): string[] {
	const known = /\.(cm-|basalt-|note-|(dashboard|sidebar|ribbon|tabbar|status|ai|plan)(?![\w-]))|^(html|body|:root|\*)|(^|[\s>+~])(h[1-6]|p|a|img|table|thead|tbody|tr|th|td|li|ul|ol|code|pre|blockquote|hr|strong|em|b|i|input|button|span|div|mark|kbd)\b/;
	const selectors = css
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/@[a-z-]+[^{]*\{/gi, "")
		.split("}")
		.map((block) => block.split("{")[0])
		.flatMap((head) => head.split(","))
		.map((x) => x.trim())
		.filter((x) => x && !/^(from|to|\d+%)$/.test(x));
	// Names that look like Basalt's but aren't (a dashboard note is .note-dashboard).
	const madeUp = /\.basalt-(dashboard|note|page|container|wrapper|app|content|editor)(?![\w-])/;
	return selectors.filter((x) => !known.test(x) || madeUp.test(x));
}
const SNIPPET_HINT = `Basalt's own names: a note with "cssclass: dashboard" is .note-dashboard, live-list cards are .basalt-card, headings are .cm-h1 to .cm-h6, the note's text is .cm-content. basalt_help has the full list.`;
export const selectorProblem = (css: string) => {
	const odd = strangeSelectors(css);
	return odd.length ? `Nothing in Basalt matches ${odd.map((x) => `"${x}"`).join(", ")}. ${SNIPPET_HINT}` : "";
};

/** A snippet's file name, without .css: lowercase words and dashes. */
const snippetName = (v: unknown) => str(v).replace(/\.css$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** A color way Komorebi knows, or the original. */
const colorway = (v: string) => (COLORWAYS.some((c) => c.id === v.toLowerCase()) ? v.toLowerCase() : "indigo");

/** A tile for a folder: its emoji icon if it has one. */
const tileFor = (folder: string) => {
	const icon = ws.meta.looks[folder]?.icon ?? "";
	return `tile: ${folder.split("/").pop()}${icon && icon !== "folder" ? ` | ${icon}` : ""}${folder.includes("/") ? `${icon && icon !== "folder" ? "" : " |"} | ${folder}` : ""}`;
};

/** A Komorebi home page: the template, with the areas as its tiles. */
function komorebiHome(title: string, areas: string[], way: string): string {
	return KOMOREBI_HOME(colorway(way))
		.replace("title: My Vault", `title: ${title}`)
		.replace(/(tile: .*\n)+/, areas.length ? `${areas.map(tileFor).join("\n")}\n` : "tile: Notes\n");
}

/** A Komorebi dashboard: a header, the folder's subfolders as tiles, and the sections as glass cards in two columns. */
function komorebiDashboard(title: string, sections: string[], from: string, way: string): string {
	const WIDGET: Record<string, string> = {
		calendar: "title: calendar\nlist: calendar",
		timer: "title: pomodoro\nlist: timer\ntext: 25",
		capture: `title: quick capture\nlist: capture\nto: ${from ? `${from}/Inbox` : "Inbox"}`,
		actions: "title: system\nlist: actions",
	};
	const cards = sections.map((x) => WIDGET[x] ?? (x in SECTIONS ? SECTIONS[x].block(from).replace(/^title: (.*)$/m, (_, t: string) => `title: ${t.toLowerCase()}`) : "")).filter(Boolean);
	const subfolders = ws.folders.filter((f) => from && f.startsWith(`${from}/`) && !f.slice(from.length + 1).includes("/"));
	const tiles = subfolders.length ? `\n\n\`\`\`basalt\ntitle: collection\nlist: tiles\n${subfolders.map(tileFor).join("\n")}\n\`\`\`` : "";
	const half = Math.ceil(cards.length / 2);
	const columns = cards.length > 1 ? `\`\`\`basalt\ncolumns: 1fr 1fr\n==\n${cards.slice(0, half).join("\n--\n")}\n==\n${cards.slice(half).join("\n--\n")}\n\`\`\`` : blocks(...cards);
	return `---\ncssclass: dashboard komorebi ${colorway(way)}\n---\n\`\`\`basalt\nlist: header\ntitle: ${title}\ntext: ${from ? `everything in ${from.toLowerCase()}` : "notes, thoughts & things that matter"}\n\`\`\`${tiles}\n\n${columns}\n`;
}

/** Turns on one of the example snippets (a dashboard look), once. */
async function useLook(name: string) {
	const { useExample } = await import("../snippets.svelte");
	await useExample(name);
}

/** Dashboards look best with the dashboard snippet; turn it on once. */
async function useDashboardSnippet() {
	const { EXAMPLES, newSnippet, loadSnippets, snippets } = await import("../snippets.svelte");
	await loadSnippets();
	if (snippets.names.some((n) => n.startsWith("dashboard"))) return;
	const ex = EXAMPLES.find((e) => e.name === "dashboard");
	if (ex) await newSnippet("dashboard", ex.css);
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
	const pos = str(a.heading_position).toLowerCase();
	if (pos) theme.headings.align = pos === "title" ? "title" : /cent|middle|all/.test(pos) ? "all" : "left";
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
