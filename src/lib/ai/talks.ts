// Conversations for the model test: two, three and four messages in a row, the
// way people really talk to the AI ("make me a dashboard" … "make it red" …
// "add my tasks to it"). After each message its plan is carried out in the
// practice cave (as if "Do it" was pressed), so the next message builds on
// what really happened. Scored on how the practice cave ends up, and on every
// change being real: a step that asked for a change has to make one, and
// saying something changed when nothing did costs points.
import { parseSpec, type Spec } from "../query";

// ---- The practice cave, which conversations change ----

const BASE_FOLDERS = ["School", "School/Biology", "Work", "Recipes", "Journal"];
const BASE_NOTES: Record<string, string> = {
	"School/Biology/Cell notes.md": "# Cell notes\n\nMitochondria make energy for the cell. Ribosomes build proteins.\n\nThe biology exam is on 2026-11-14 (a Saturday morning, room 204).\n\n- [ ] Review chapter 3 due:2026-11-10\n- [ ] Make flashcards\n",
	"School/Math homework.md": "# Math homework\n\n- [ ] Problems 1-12 on page 88 due:2026-11-03\n",
	"Work/Meeting with Sam.md": "# Meeting with Sam\n\n**Who:** Sam, me\n\n## Decisions\n- We'll launch the new website on March 3.\n- Sam handles the photos; I write the About page.\n\n## Next steps\n- [ ] Draft the About page\n",
	"Work/Ideas for the shop.md": "# Ideas for the shop\n\n- Gift cards\n- A newsletter\n",
	"Recipes/Pancakes.md": "# Pancakes\n\n#breakfast\n\n2 eggs, 1 cup flour, 1 cup milk. Rest the batter 10 minutes.\n",
	"Recipes/Tomato soup.md": "# Tomato soup\n\n#dinner\n\nRoast the tomatoes first.\n",
	"Journal/2026-10-27.md": "# Monday, 2026-10-27\n\nWent for a long run. Felt great.\n",
	"Ideas.md": "# Ideas\n\n- Start a podcast\n- Learn guitar\n",
	"Groceries.md": "# Groceries\n\n- [ ] Milk\n- [ ] Eggs\n",
	"Old draft.md": "# Old draft\n\nThe beginning of an essay about cities.\n",
};

export interface World {
	notes: Record<string, string>;
	folders: string[];
	looks: Record<string, { color?: string; icon?: string }>;
	home: string;
	snippets: Record<string, string>;
	app: { theme?: string; accent?: string; headings?: string; material?: string };
}

/** The practice cave. Its objects stay the same; resetting puts their contents back. */
export const world: World = { notes: {}, folders: [], looks: {}, home: "", snippets: {}, app: {} };

export function resetWorld() {
	for (const k of Object.keys(world.notes)) delete world.notes[k];
	Object.assign(world.notes, BASE_NOTES);
	world.folders.splice(0, world.folders.length, ...BASE_FOLDERS);
	for (const k of Object.keys(world.looks)) delete world.looks[k];
	for (const k of Object.keys(world.snippets)) delete world.snippets[k];
	world.home = "";
	world.app = {};
}
resetWorld();

// ---- Looking things up ----

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const clean = (v: unknown) => str(v).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
export const titleOf = (p: string) => p.split("/").pop()!.replace(/\.md$/i, "");
const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");

/** A note by its path or its name alone, like Basalt's own lookup. */
export function findNote(name: unknown): string | null {
	const n = clean(name).toLowerCase();
	if (!n) return null;
	const paths = Object.keys(world.notes);
	return paths.find((p) => p.replace(/\.md$/, "").toLowerCase() === n) ?? paths.find((p) => titleOf(p).toLowerCase() === n.split("/").pop()) ?? null;
}
export function findFolder(name: unknown): string | null {
	const n = clean(name).toLowerCase();
	if (!n) return null;
	return world.folders.find((f) => f.toLowerCase() === n) ?? world.folders.find((f) => f.split("/").pop()!.toLowerCase() === n.split("/").pop()) ?? null;
}

function addFolder(f: string) {
	const parts = clean(f).split("/").filter(Boolean);
	for (let i = 1; i <= parts.length; i++) {
		const p = parts.slice(0, i).join("/");
		if (!world.folders.some((x) => x.toLowerCase() === p.toLowerCase())) world.folders.push(p);
	}
}
function writeNote(path: string, text: string) {
	const p = `${clean(path)}.md`;
	if (parentOf(p)) addFolder(parentOf(p));
	world.notes[p] = text;
	return p;
}

/** A note's frontmatter properties. */
export function props(text: string): Record<string, string> {
	const m = /^---\n([\s\S]*?)\n---/.exec(text);
	const out: Record<string, string> = {};
	for (const line of m?.[1].split("\n") ?? []) {
		const kv = /^(\w[\w-]*)\s*:\s*(.*)$/.exec(line);
		if (kv) out[kv[1].toLowerCase()] = kv[2].trim();
	}
	return out;
}
function setProps(text: string, change: Record<string, string | null>): string {
	const now = props(text);
	for (const [k, v] of Object.entries(change)) {
		if (v == null) delete now[k];
		else now[k] = v;
	}
	const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
	const lines = Object.entries(now).map(([k, v]) => `${k}: ${v}`);
	return lines.length ? `---\n${lines.join("\n")}\n---\n${body}` : body;
}

/** The live blocks in a note, read like Basalt reads them (each card of a columns block on its own). */
export function blocks(text: string): Spec[] {
	const out: Spec[] = [];
	for (const m of text.matchAll(/```basalt\n([\s\S]*?)```/g)) for (const card of m[1].split(/^\s*(?:==|--)\s*$/m)) if (/\w+\s*:/.test(card)) out.push(parseSpec(card));
	return out;
}

const COLORWAYS = ["indigo", "crimson", "sakura", "matcha", "ember", "glacier", "mono"];
const HEX: Record<string, string> = { red: "#e05d5d", orange: "#e8794a", yellow: "#e5b84b", green: "#7fc48b", teal: "#4fb8b0", blue: "#5b9bf0", indigo: "#7c8cff", purple: "#b07cf0", pink: "#e46fa8", gray: "#9aa0a6", grey: "#9aa0a6" };

/** What a color name can look like on a dashboard, in a folder's look or as the app's accent. */
const SHADES: Record<string, RegExp> = {
	red: /\b(red|crimson|scarlet|ruby)\b|#(e0|e5|d[0-9a-f]|c[0-9a-f]|f[0-9a-f]|b[0-9a-f])[0-5][0-9a-f][0-5][0-9a-f]\b/i,
	pink: /\b(pink|sakura|rose)\b|#(e4|f[0-9a-f]|e[0-9a-f])[4-9a-f][0-9a-f][8-9a-f][0-9a-f]\b/i,
	green: /\b(green|matcha|emerald|lime|sage|forest)\b|#[0-7][0-9a-f][8-9a-f][0-9a-f][0-8][0-9a-f]\b/i,
	blue: /\b(blue|glacier|navy|sky|azure)\b|#[0-6][0-9a-f][6-9a-f][0-9a-f][c-f][0-9a-f]\b/i,
	purple: /\b(purple|violet|lavender|indigo)\b|#[8-b][0-9a-f][4-8][0-9a-f][d-f][0-9a-f]\b/i,
	orange: /\b(orange|ember|amber)\b|#[e-f][0-9a-f][6-9][0-9a-f][2-5][0-9a-f]\b/i,
	gray: /\b(gr[ae]y|mono|silver)\b|#9aa0a6/i,
	yellow: /\b(yellow|gold)\b|#e5b84b/i,
	teal: /\b(teal|cyan|turquoise)\b|#4fb8b0/i,
};
export const isShade = (value: string, color: string) => !!value && SHADES[color].test(value);
/** A dashboard looks like a color: its color way, or its own accent. */
export const dashIs = (text: string, color: string) => isShade(`${props(text).cssclass ?? ""} ${props(text).accent ?? ""}`, color);
export const isKomorebi = (text: string) => /\bkomorebi\b/.test(props(text).cssclass ?? "");

/** The dashboards in the practice cave (none to start with). */
export const dashboards = () => Object.keys(world.notes).filter((p) => /\bdashboard\b/.test(props(world.notes[p]).cssclass ?? ""));

// ---- Carrying out a plan ----

const SECTION: Record<string, (f: string) => string[]> = {
	notes: (f) => ["title: Notes", ...(f ? [`from: ${f}`] : []), "show: cards"],
	recent: (f) => ["title: Recent notes", ...(f ? [`from: ${f}`] : []), "sort: -name", "limit: 8"],
	tasks: (f) => ["title: Open tasks", "list: tasks", ...(f ? [`from: ${f}`] : [])],
	due_this_week: (f) => ["title: Due this week", "list: tasks", ...(f ? [`from: ${f}`] : []), "due: week"],
	overdue: (f) => ["title: Overdue", "list: tasks", ...(f ? [`from: ${f}`] : []), "due: overdue"],
	tags: (f) => ["title: Tags", "list: tags", ...(f ? [`from: ${f}`] : [])],
	habits: () => ["title: Habits", "list: habits"],
	calendar: () => ["title: Calendar", "list: calendar"],
	timer: () => ["title: Focus", "list: timer", "text: 25"],
	capture: (f) => ["title: Quick capture", "list: capture", `to: ${f ? `${f}/Inbox` : "Inbox"}`],
	actions: () => ["title: Actions", "list: actions"],
};
const block = (lines: string[]) => `\`\`\`basalt\n${lines.join("\n")}\n\`\`\``;
const sections = (list: unknown, folder: string) => (Array.isArray(list) ? list : []).map(str).filter((x) => x in SECTION).map((x) => block(SECTION[x](folder)));
const look = (style: unknown, way: unknown) => (str(style).toLowerCase() === "komorebi" ? `dashboard komorebi ${COLORWAYS.includes(str(way).toLowerCase()) ? str(way).toLowerCase() : "indigo"}` : "dashboard");
const tasks = (v: unknown) => (Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? str((x as Record<string, unknown>).title) : str(x))).filter(Boolean) : []);

function boardText(lists: Array<{ name: string; cards: string[] }>) {
	return `---\nbasalt: board\n---\n${lists.map((l) => `\n## ${l.name}\n\n${l.cards.map((c) => `- [ ] ${c}`).join("\n")}\n`).join("")}`;
}

function moveItem(from: string, to: string) {
	const note = findNote(from);
	if (note) {
		const dest = `${to ? `${to}/` : ""}${note.split("/").pop()}`;
		world.notes[dest] = world.notes[note];
		if (dest !== note) delete world.notes[note];
		if (world.home === note) world.home = dest;
		return;
	}
	const folder = findFolder(from);
	if (!folder) return;
	const dest = `${to ? `${to}/` : ""}${folder.split("/").pop()}`;
	renamePrefix(folder, dest);
}
function renamePrefix(from: string, to: string) {
	for (const p of Object.keys(world.notes))
		if (p.startsWith(`${from}/`)) {
			world.notes[to + p.slice(from.length)] = world.notes[p];
			delete world.notes[p];
		}
	for (let i = 0; i < world.folders.length; i++) if (world.folders[i] === from || world.folders[i].startsWith(`${from}/`)) world.folders[i] = to + world.folders[i].slice(from.length);
	if (world.looks[from]) {
		world.looks[to] = world.looks[from];
		delete world.looks[from];
	}
	addFolder(to);
}

/** Carries out one planned change in the practice cave, the way Basalt would. */
export function applyPractice(tool: string, a: Record<string, unknown>) {
	const path = clean(a.path);
	switch (tool) {
		case "create_folder":
			addFolder(path);
			if (str(a.color) || str(a.icon)) world.looks[clean(a.path)] = { color: str(a.color) || undefined, icon: str(a.icon) || undefined };
			return;
		case "create_note":
			writeNote(path, str(a.content) || `# ${titleOf(path)}\n`);
			return;
		case "edit_note": {
			const p = findNote(path);
			if (p) world.notes[p] = str(a.content);
			return;
		}
		case "append_to_note": {
			const p = findNote(path);
			if (p) world.notes[p] = `${world.notes[p].replace(/\s+$/, "")}\n\n${str(a.text)}\n`;
			return;
		}
		case "create_board": {
			const lists = (Array.isArray(a.lists) ? a.lists : []).map((l) => ({ name: str((l as Record<string, unknown>).name), cards: tasks((l as Record<string, unknown>).cards) }));
			writeNote(path, boardText(lists.length ? lists : [{ name: "To do", cards: [] }]));
			return;
		}
		case "add_card": {
			const p = findNote(a.board);
			if (!p) return;
			const text = world.notes[p];
			const list = str(a.list);
			const at = text.search(new RegExp(`^##\\s+${list.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im"));
			if (at < 0) world.notes[p] = `${text.replace(/\s+$/, "")}\n\n## ${list}\n\n- [ ] ${str(a.title)}\n`;
			else {
				const lineEnd = text.indexOf("\n", at);
				world.notes[p] = `${text.slice(0, lineEnd + 1)}\n- [ ] ${str(a.title)}${text.slice(lineEnd + 1).replace(/^\n/, "\n")}`;
			}
			return;
		}
		case "move_item":
			moveItem(path, clean(a.to_folder));
			return;
		case "rename_item": {
			const name = clean(a.new_name).split("/").pop()!;
			const note = findNote(path);
			if (note) {
				const dest = `${parentOf(note) ? `${parentOf(note)}/` : ""}${name}.md`;
				world.notes[dest] = world.notes[note].replace(new RegExp(`^# ${titleOf(note)}$`, "m"), `# ${name}`);
				if (dest !== note) delete world.notes[note];
				if (world.home === note) world.home = dest;
				return;
			}
			const folder = findFolder(path);
			if (folder) renamePrefix(folder, `${parentOf(folder) ? `${parentOf(folder)}/` : ""}${name}`);
			return;
		}
		case "delete_item": {
			const note = findNote(path);
			if (note) {
				delete world.notes[note];
				return;
			}
			const folder = findFolder(path);
			if (!folder) return;
			for (const p of Object.keys(world.notes)) if (p.startsWith(`${folder}/`)) delete world.notes[p];
			world.folders.splice(0, world.folders.length, ...world.folders.filter((f) => f !== folder && !f.startsWith(`${folder}/`)));
			return;
		}
		case "clear_cave":
			for (const k of Object.keys(world.notes)) delete world.notes[k];
			world.folders.splice(0, world.folders.length);
			return;
		case "set_look": {
			const target = findFolder(path) ?? findNote(path)?.replace(/\.md$/, "") ?? path;
			world.looks[target] = { ...world.looks[target], ...(str(a.color) ? { color: str(a.color) } : {}), ...(str(a.icon) ? { icon: str(a.icon) } : {}) };
			return;
		}
		case "set_home": {
			const p = findNote(path);
			if (p) world.home = p;
			return;
		}
		case "create_space": {
			const name = clean(a.name);
			addFolder(name);
			if (str(a.color) || str(a.icon)) world.looks[name] = { color: str(a.color) || undefined, icon: str(a.icon) || undefined };
			writeNote(`${name}/${titleOf(name)} dashboard`, `---\ncssclass: dashboard\n---\n# ${titleOf(name)}\n\n${str(a.about)}\n\n${block(SECTION.notes(name))}\n\n${block(SECTION.tasks(name))}\n`);
			return;
		}
		case "create_home": {
			const title = str(a.title) || "Home";
			const spaces = Array.isArray(a.spaces) ? a.spaces.map(clean) : [];
			const links = spaces.map((s) => {
				const dash = Object.keys(world.notes).find((p) => p.startsWith(`${s}/`) && /dashboard/i.test(p));
				return `- [[${dash ? titleOf(dash) : s}]]`;
			});
			world.home = writeNote(title, `---\ncssclass: ${look(a.style, a.colorway)}\n---\n# ${title}\n\n${links.join("\n")}\n\n${block(SECTION.due_this_week(""))}\n`);
			return;
		}
		case "create_dashboard": {
			const folder = clean(a.folder);
			const existing = findNote(path);
			if (existing) world.notes[existing] = setProps(`${world.notes[existing].replace(/\s+$/, "")}\n\n${sections(a.sections, folder).join("\n\n")}\n`, { cssclass: look(a.style, a.colorway) });
			else writeNote(path, `---\ncssclass: ${look(a.style, a.colorway)}\n---\n# ${titleOf(path)}\n\n${sections(a.sections, folder).join("\n\n")}\n`);
			return;
		}
		case "restyle_dashboard": {
			const p = findNote(path);
			if (!p) return;
			let cls = (props(world.notes[p]).cssclass ?? "dashboard").split(/\s+/).filter(Boolean);
			const way = str(a.colorway).toLowerCase();
			const style = str(a.style).toLowerCase();
			if (style === "komorebi" || way) {
				if (!cls.includes("komorebi")) cls.push("komorebi");
				if (way) cls = [...cls.filter((c) => !COLORWAYS.includes(c)), way];
				else if (!cls.some((c) => COLORWAYS.includes(c))) cls.push("indigo");
			}
			if (style === "plain") cls = cls.filter((c) => c !== "komorebi" && !COLORWAYS.includes(c));
			const color = str(a.color).toLowerCase();
			world.notes[p] = setProps(world.notes[p], { cssclass: cls.join(" "), ...(color ? { accent: HEX[color] ?? color } : {}) });
			return;
		}
		case "add_live_block": {
			const p = findNote(path);
			if (!p) return;
			const lines = ["title", "list", "show", "from", "tag", "where", "due", "sort", "limit", "group"].map((k) => [k, str(a[k])]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
			for (const n of Array.isArray(a.notes) ? a.notes : []) lines.push(`note: ${str(n)}`);
			world.notes[p] = `${world.notes[p].replace(/\s+$/, "")}\n\n${block(lines)}\n`;
			return;
		}
		case "create_project": {
			const name = clean(a.name);
			const folder = `${clean(a.parent) || "Projects"}/${name}`;
			addFolder(folder);
			if (str(a.color) || str(a.icon)) world.looks[folder] = { color: str(a.color) || undefined, icon: str(a.icon) || undefined };
			writeNote(`${folder}/${name}`, `---\nstatus: active\n---\n# ${name}\n\n## Goal\n${str(a.goal)}\n\n## Log\n`);
			writeNote(`${folder}/${name} board`, boardText([{ name: "To do", cards: tasks(a.steps) }, { name: "Doing", cards: [] }, { name: "Done", cards: [] }]));
			return;
		}
		case "note_from_template":
			writeNote(path, `# ${titleOf(path)}\n\n(From the ${str(a.template)} template.)\n\n## Notes\n\n## Action items\n- [ ] \n`);
			return;
		case "create_snippet":
			world.snippets[str(a.name) || "snippet"] = str(a.css);
			return;
		case "change_appearance":
			if (str(a.theme)) world.app.theme = str(a.theme);
			if (str(a.accent)) world.app.accent = str(a.accent);
			if (str(a.heading_style)) world.app.headings = str(a.heading_style);
			if (str(a.material)) world.app.material = str(a.material);
			return;
	}
}

// ---- The conversations ----

/** What happened in one message of a conversation. */
export interface Turn {
	plan: Array<{ name: string; args: Record<string, unknown> }>;
	text: string;
}

export interface Talk {
	id: string;
	/** The messages, in order. One starting with "?" only asks something (the "?" isn't sent). */
	steps: string[];
	/** Checks on the practice cave at the end (and on the replies). */
	check: (w: World, turns: Turn[]) => Array<[boolean, string]>;
}

const text = (name: string) => world.notes[findNote(name) ?? ""] ?? "";
const has = (name: string) => !!findNote(name);
const says = (t: Turn | undefined, re: RegExp) => !!t && re.test(t.text);
const hasBlock = (note: string, test: (s: Spec) => boolean) => blocks(text(note)).some(test);
const latestDash = () => dashboards().at(-1) ?? "";
const folderLook = (folder: string) => world.looks[findFolder(folder) ?? folder] ?? {};
const looksLike = (folder: string, color: string) => isShade(str(folderLook(folder).color), color);
/** The cards under one list of a board. */
function listCards(board: string, list: string): string[] {
	const t = text(board);
	const m = new RegExp(`^##\\s+${list}\\s*$([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "im").exec(t);
	return (m?.[1].match(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?(.+)$/gm) ?? []).map((l) => l.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s+)?/, "").trim().toLowerCase());
}
const boardWith = (word: RegExp) => Object.keys(world.notes).find((p) => /basalt:\s*board/.test(world.notes[p]) && word.test(p)) ?? "";
const mentions = (note: string, ...words: string[]) => words.every((w) => text(note).toLowerCase().includes(w.toLowerCase()));
const fromFolder = (s: Spec, folder: string) => s.from.some((f) => f.toLowerCase() === folder.toLowerCase() || f.toLowerCase().startsWith(`${folder.toLowerCase()}/`));
const dashFor = (folder: RegExp) => dashboards().find((p) => folder.test(p) || blocks(world.notes[p]).some((b) => b.from.some((f) => folder.test(f)))) ?? "";
const linksTo = (note: string, ...names: string[]) => names.every((n) => new RegExp(`\\[\\[[^\\]]*${n}`, "i").test(text(note)));

export const TALKS: Talk[] = [
	// ---- Two messages ----
	{
		id: "c2-dash-red",
		steps: ["make me a dashboard for my School folder", "make it red"],
		check: () => {
			const d = dashFor(/school/i);
			return [
				[!!d, "There's no dashboard for School"],
				[!!d && dashIs(world.notes[d], "red"), "The dashboard isn't red"],
			];
		},
	},
	{
		id: "c2-komorebi-sakura",
		steps: ["make a komorebi style dashboard for my work stuff", "change it to the sakura color way"],
		check: () => {
			const d = dashFor(/work/i);
			return [
				[!!d && isKomorebi(world.notes[d]), "No Komorebi dashboard for Work"],
				[!!d && dashIs(world.notes[d], "pink"), "It isn't sakura (pink)"],
			];
		},
	},
	{
		id: "c2-folder-look",
		steps: ["create a folder called Fitness", "now give it a green color and a heart icon"],
		check: () => [
			[!!findFolder("Fitness"), "There's no Fitness folder"],
			[looksLike("Fitness", "green"), "Fitness isn't green"],
			[!!folderLook("Fitness").icon, "Fitness has no icon"],
		],
	},
	{
		id: "c2-note-add",
		steps: ["make a note called Packing list with socks, a charger and my passport", "add sunscreen to it too"],
		check: () => [
			[has("Packing list"), "There's no Packing list note"],
			[mentions("Packing list", "socks", "charger", "passport"), "The first three things aren't all in it"],
			[mentions("Packing list", "sunscreen"), "Sunscreen wasn't added"],
		],
	},
	{
		id: "c2-board-card",
		steps: ["make a board for my trip with To do, Booked and Done lists", "put 'Book flights' in To do"],
		check: () => {
			const b = boardWith(/trip/i);
			return [
				[!!b, "There's no trip board"],
				[!!b && listCards(b, "To do").some((c) => c.includes("book flights")), "'Book flights' isn't in To do"],
				[!!b && /##\s+booked/i.test(text(b)) && /##\s+done/i.test(text(b)), "The Booked and Done lists are missing"],
			];
		},
	},
	{
		id: "c2-move-rename",
		steps: ["move my Old draft note into the Journal folder", "actually rename it to City essay"],
		check: () => [
			[!!world.notes["Journal/City essay.md"], "Journal/City essay doesn't exist"],
			[!has("Old draft"), "Old draft is still there"],
			[mentions("City essay", "cities"), "The essay's text got lost"],
		],
	},
	{
		id: "c2-ask-add",
		steps: ["?what's on my groceries list", "add bread and butter to it"],
		check: (_w, t) => [
			[says(t[0], /milk/i) && says(t[0], /eggs/i), "It didn't say what's on the list"],
			[mentions("Groceries", "bread", "butter"), "Bread and butter weren't added"],
			[mentions("Groceries", "milk", "eggs"), "Milk or eggs got lost"],
		],
	},
	{
		id: "c2-folder-move",
		steps: ["make a new folder called Projects", "put my Ideas note in it"],
		check: () => [
			[!!world.notes["Projects/Ideas.md"], "Ideas isn't in Projects"],
			[!world.notes["Ideas.md"], "Ideas is still at the top level"],
		],
	},
	{
		id: "c2-block-table",
		steps: ["add a live list of my open tasks to my Ideas note", "make it show as a table instead"],
		check: () => {
			const b = blocks(text("Ideas")).filter((s) => s.list === "tasks");
			return [
				[b.length > 0, "No task list in Ideas"],
				[b.length > 0 && b.at(-1)!.show === "table", "It isn't a table"],
				[b.length <= 1, "It added a second list instead of changing the first"],
			];
		},
	},
	{
		id: "c2-dash-calendar",
		steps: ["make a dashboard for my Recipes", "add a calendar to it"],
		check: () => {
			const d = dashFor(/recipe/i);
			return [
				[!!d, "No dashboard for Recipes"],
				[!!d && blocks(world.notes[d]).some((s) => s.list === "calendar"), "There's no calendar on it"],
			];
		},
	},
	{
		id: "c2-project-color",
		steps: ["create a project called Garden with the steps dig beds, buy seeds and plant", "make the project folder green"],
		check: () => {
			const f = world.folders.find((x) => /garden$/i.test(x)) ?? "";
			return [
				[!!f, "There's no Garden project folder"],
				[looksLike(f, "green"), "The Garden folder isn't green"],
				[Object.values(world.notes).some((t) => /buy seeds/i.test(t)), "The steps are missing"],
			];
		},
	},
	{
		id: "c2-note-ask",
		steps: ["make a note for my book club meeting on friday", "?when is it again?"],
		check: (_w, t) => [
			[Object.keys(world.notes).some((p) => /book club/i.test(p)), "There's no book club note"],
			[says(t[1], /friday/i), "It didn't say Friday"],
		],
	},
	{
		id: "c2-two-colors",
		steps: ["give my Recipes folder an orange color", "and the School folder blue"],
		check: () => [
			[looksLike("Recipes", "orange"), "Recipes isn't orange"],
			[looksLike("School", "blue"), "School isn't blue"],
		],
	},
	{
		id: "c2-accent-change",
		steps: ["switch basalt to a dark theme with a purple accent", "actually make the accent pink"],
		check: (w) => [
			[!!w.app.theme, "It didn't change the theme"],
			[isShade(w.app.accent ?? "", "pink"), "The accent isn't pink"],
		],
	},
	{
		id: "c2-delete-two",
		steps: ["delete my Old draft note", "and the Groceries note too"],
		check: () => [
			[!has("Old draft") && !has("Groceries"), "Both notes aren't deleted"],
			[has("Ideas") && has("Pancakes"), "It deleted something else too"],
		],
	},
	{
		id: "c2-home-komorebi",
		steps: ["make a home page that links to my School, Work and Recipes folders", "make it komorebi style"],
		check: (w) => [
			[!!w.home && has(w.home), "There's no home page"],
			[!!w.home && isKomorebi(text(w.home)), "The home page isn't Komorebi"],
		],
	},
	{
		id: "c2-ask-task",
		steps: ["?who is taking the photos for the website", "add a task to my Meeting with Sam note to send Sam the logo"],
		check: (_w, t) => [
			[says(t[0], /\bsam\b/i), "It didn't say Sam"],
			[/- \[ \].*logo/i.test(text("Meeting with Sam")), "The logo task isn't in the note"],
			[mentions("Meeting with Sam", "march 3"), "The note's old text got lost"],
		],
	},
	{
		id: "c2-dash-due",
		steps: ["make a dashboard for my Work folder showing tasks", "also show what's due this week"],
		check: () => {
			const d = dashFor(/work/i);
			const b = d ? blocks(world.notes[d]) : [];
			return [
				[!!d, "No dashboard for Work"],
				[b.some((s) => s.list === "tasks"), "No task list"],
				[b.some((s) => s.list === "tasks" && s.due === "week"), "Nothing for what's due this week"],
			];
		},
	},
	{
		id: "c2-note-schedule",
		steps: ["create a note called Workout plan in a new Fitness folder", "add a weekly schedule to it: runs on mon, wed and fri"],
		check: () => [
			[!!world.notes["Fitness/Workout plan.md"], "Fitness/Workout plan doesn't exist"],
			[/mon/i.test(text("Workout plan")) && /wed/i.test(text("Workout plan")) && /fri/i.test(text("Workout plan")), "The schedule isn't in it"],
		],
	},
	{
		id: "c2-snippet-grow",
		steps: ["make a css snippet that makes headings use the accent color", "make the headings bigger too"],
		check: (w) => {
			const css = Object.values(w.snippets).join("\n");
			return [
				[/var\(--accent\)/.test(css), "No snippet uses the accent color"],
				[/font-size/.test(css), "The headings aren't bigger"],
			];
		},
	},

	// ---- Three messages ----
	{
		id: "c3-area-style",
		steps: ["set up a Fitness area with a dashboard", "make the dashboard komorebi style", "make it green"],
		check: () => {
			const d = dashFor(/fitness/i);
			return [
				[!!findFolder("Fitness"), "There's no Fitness folder"],
				[!!d && isKomorebi(world.notes[d]), "The dashboard isn't Komorebi"],
				[!!d && dashIs(world.notes[d], "green"), "It isn't green"],
			];
		},
	},
	{
		id: "c3-chores",
		steps: ["make a board called Chores with To do and Done lists", "add 'take out trash' and 'vacuum' to To do", "move vacuum to Done"],
		check: () => [
			[has("Chores"), "There's no Chores board"],
			[listCards("Chores", "Done").some((c) => c.includes("vacuum")), "Vacuum isn't in Done"],
			[!listCards("Chores", "To do").some((c) => c.includes("vacuum")), "Vacuum is still in To do"],
			[listCards("Chores", "To do").some((c) => c.includes("trash")), "Take out trash isn't in To do"],
		],
	},
	{
		id: "c3-archive",
		steps: ["create a folder called Archive", "move Old draft and Groceries into it", "give Archive a gray color"],
		check: () => [
			[!!world.notes["Archive/Old draft.md"] && !!world.notes["Archive/Groceries.md"], "Both notes aren't in Archive"],
			[looksLike("Archive", "gray"), "Archive isn't gray"],
		],
	},
	{
		id: "c3-school-dash",
		steps: ["make a dashboard for my school stuff", "add my biology tasks to it", "make it blue"],
		check: () => {
			const d = dashFor(/school/i);
			return [
				[!!d, "No dashboard for School"],
				[!!d && blocks(world.notes[d]).some((s) => s.list === "tasks" && (fromFolder(s, "School") || !s.from.length)), "No task list for School or Biology"],
				[!!d && dashIs(world.notes[d], "blue"), "It isn't blue"],
			];
		},
	},
	{
		id: "c3-podcast",
		steps: ["make a note called Podcast plan", "write 3 episode ideas in it", "link it from my Ideas note"],
		check: () => [
			[has("Podcast plan"), "There's no Podcast plan"],
			[(text("Podcast plan").match(/^\s*(?:[-*]|\d+[.)])\s+\S/gm) ?? []).length >= 3, "There aren't 3 episode ideas"],
			[linksTo("Ideas", "Podcast plan"), "Ideas doesn't link to it"],
			[mentions("Ideas", "guitar"), "Ideas lost its old text"],
		],
	},
	{
		id: "c3-recipes-home",
		steps: ["?what recipes do I have", "make a dashboard showing them as cards", "make it the home page"],
		check: (w, t) => {
			const d = dashFor(/recipe/i);
			return [
				[says(t[0], /pancake/i) && says(t[0], /tomato soup/i), "It didn't name the recipes"],
				[!!d && blocks(world.notes[d]).some((s) => fromFolder(s, "Recipes") && s.show === "cards"), "No cards of the Recipes folder"],
				[!!d && w.home === d, "It isn't the home page"],
			];
		},
	},
	{
		id: "c3-project-step",
		steps: ["make a project called Website launch", "add a step to email Sam the photos", "?what's on its to do list now"],
		check: (_w, t) => [
			[world.folders.some((f) => /website launch$/i.test(f)), "There's no Website launch project"],
			[Object.entries(world.notes).some(([p, x]) => /website launch/i.test(p) && /email sam/i.test(x)), "The Sam step isn't in the project"],
			[says(t[2], /email sam|sam/i), "It didn't list the step"],
		],
	},
	{
		id: "c3-areas-home",
		steps: ["create School, Work and Life areas", "give each one its own color", "make a home page linking them"],
		check: (w) => {
			const colors = ["School", "Work", "Life"].map((f) => str(folderLook(f).color).toLowerCase());
			return [
				[!!findFolder("Life"), "There's no Life folder"],
				[colors.every(Boolean) && new Set(colors).size === 3, "They don't each have a different color"],
				[!!w.home && linksTo(w.home, "school", "work", "life"), "The home page doesn't link all three"],
			];
		},
	},
	{
		id: "c3-block-edit",
		steps: ["add a live list of my notes tagged breakfast to my Ideas note", "change it to cards", "give it the title Breakfast ideas"],
		check: () => {
			const b = blocks(text("Ideas"));
			return [
				[b.some((s) => s.tag === "breakfast" || fromFolder(s, "Recipes")), "No breakfast list in Ideas"],
				[b.some((s) => s.show === "cards"), "It isn't cards"],
				[b.some((s) => /breakfast ideas/i.test(s.title)), "It isn't titled Breakfast ideas"],
				[b.length <= 1, "It added more lists instead of changing the one"],
			];
		},
	},
	{
		id: "c3-hub",
		steps: ["make a komorebi dashboard called Hub", "change the color to ember", "add a focus timer to it"],
		check: () => [
			[has("Hub") && isKomorebi(text("Hub")), "No Komorebi dashboard called Hub"],
			[dashIs(text("Hub"), "orange"), "It isn't ember"],
			[hasBlock("Hub", (s) => s.list === "timer"), "There's no timer on it"],
		],
	},
	{
		id: "c3-someday",
		steps: ["rename my Ideas note to Someday", "move it into a new folder called Lists", "add 'learn to cook' to it"],
		check: () => [
			[!!world.notes["Lists/Someday.md"], "Lists/Someday doesn't exist"],
			[mentions("Someday", "learn to cook", "podcast"), "It's missing 'learn to cook' or its old ideas"],
			[!world.notes["Ideas.md"], "Ideas is still there"],
		],
	},
	{
		id: "c3-reading",
		steps: ["make a note called Reading list with three books", "add a fourth book", "?how many books are on it now"],
		check: (_w, t) => [
			[has("Reading list"), "There's no Reading list"],
			[(text("Reading list").match(/^\s*(?:[-*]|\d+[.)])\s+\S/gm) ?? []).length >= 4, "There aren't 4 books"],
			[says(t[2], /\b(4|four)\b/i), "It didn't say four"],
		],
	},
	{
		id: "c3-math-dash",
		steps: ["make my math homework note into a dashboard of overdue tasks", "also show my tags", "make it red"],
		check: () => {
			const b = blocks(text("Math homework"));
			return [
				[b.some((s) => s.list === "tasks" && s.due === "overdue"), "No overdue list in Math homework"],
				[b.some((s) => s.list === "tags"), "No tags list"],
				[dashIs(text("Math homework"), "red"), "It isn't red"],
				[mentions("Math homework", "page 88"), "The homework got lost"],
			];
		},
	},
	{
		id: "c3-shop-board",
		steps: ["make a board for the shop ideas with Ideas, Doing and Done lists", "add gift cards and newsletter to Ideas", "I'm starting the newsletter, move it to Doing"],
		check: () => {
			const b = boardWith(/shop/i);
			return [
				[!!b, "There's no shop board"],
				[!!b && listCards(b, "Doing").some((c) => c.includes("newsletter")), "Newsletter isn't in Doing"],
				[!!b && listCards(b, "Ideas").some((c) => c.includes("gift")), "Gift cards isn't in Ideas"],
			];
		},
	},
	{
		id: "c3-look",
		steps: ["switch to the paper theme", "make the accent green", "make the headings underlined"],
		check: (w) => [
			[/paper/i.test(w.app.theme ?? ""), "It isn't the Paper theme"],
			[isShade(w.app.accent ?? "", "green"), "The accent isn't green"],
			[/underline/i.test(w.app.headings ?? ""), "Headings aren't underlined"],
		],
	},
	{
		id: "c3-travel",
		steps: ["make a folder called Travel", "add a note called Japan trip in it", "add a packing checklist to Japan trip"],
		check: () => [
			[!!world.notes["Travel/Japan trip.md"], "Travel/Japan trip doesn't exist"],
			[(text("Japan trip").match(/- \[ \]/g) ?? []).length >= 2, "There's no packing checklist"],
		],
	},
	{
		id: "c3-journal-dash",
		steps: ["make a dashboard for my Journal", "add a calendar", "and the habit tracker"],
		check: () => {
			const d = dashFor(/journal/i);
			const b = d ? blocks(world.notes[d]) : [];
			return [
				[!!d, "No dashboard for Journal"],
				[b.some((s) => s.list === "calendar"), "No calendar"],
				[b.some((s) => s.list === "habits"), "No habit tracker"],
			];
		},
	},
	{
		id: "c3-meeting",
		steps: ["make a Meeting note from the template for tomorrow's call with Alex", "add Alex's email alex@shop.com to it", "?what was alex's email again"],
		check: (_w, t) => {
			const n = Object.keys(world.notes).find((p) => /alex/i.test(p)) ?? "";
			return [
				[!!n, "There's no meeting note for Alex"],
				[!!n && /alex@shop\.com/i.test(world.notes[n]), "The email isn't in it"],
				[says(t[2], /alex@shop\.com/i), "It didn't give the email"],
			];
		},
	},
	{
		id: "c3-new-groceries",
		steps: ["delete the Groceries note", "make a new Groceries list with apples and rice", "add a check box for oat milk"],
		check: () => [
			[has("Groceries"), "There's no Groceries note"],
			[mentions("Groceries", "apples", "rice", "oat milk"), "It's missing apples, rice or oat milk"],
			[!/\beggs\b/i.test(text("Groceries")), "The old list is still there"],
			[/- \[ \].*oat milk/i.test(text("Groceries")), "Oat milk isn't a check box"],
		],
	},
	{
		id: "c3-work-mono",
		steps: ["create a dashboard for Work", "make it komorebi", "make the color mono"],
		check: () => {
			const d = dashFor(/work/i);
			return [
				[!!d, "No dashboard for Work"],
				[!!d && isKomorebi(world.notes[d]), "It isn't Komorebi"],
				[!!d && dashIs(world.notes[d], "gray"), "It isn't mono"],
			];
		},
	},

	// ---- Four messages ----
	{
		id: "c4-dash-full",
		steps: ["make me a dashboard", "make it red", "add my tasks to it", "make it the home page"],
		check: (w) => {
			const d = latestDash();
			return [
				[!!d, "There's no dashboard"],
				[!!d && dashIs(world.notes[d], "red"), "It isn't red"],
				[!!d && blocks(world.notes[d]).some((s) => s.list === "tasks"), "No task list on it"],
				[!!d && w.home === d, "It isn't the home page"],
				[dashboards().length === 1, "It made more than one dashboard"],
			];
		},
	},
	{
		id: "c4-music",
		steps: ["set up a Music area", "add a note called Songs to learn with 2 songs", "add a board for practice with To do and Done", "make the music folder purple"],
		check: () => [
			[!!findFolder("Music"), "There's no Music folder"],
			[Object.keys(world.notes).some((p) => /^music\/songs to learn/i.test(p)), "Songs to learn isn't in Music"],
			[!!boardWith(/music\//i), "There's no practice board in Music"],
			[looksLike("Music", "purple"), "Music isn't purple"],
		],
	},
	{
		id: "c4-novel",
		steps: ["make a project called Novel", "add the step 'outline chapter 1'", "rename the project to Book", "?what are its steps"],
		check: (_w, t) => [
			[world.folders.some((f) => /\bbook$/i.test(f)), "The project wasn't renamed to Book"],
			[!world.folders.some((f) => /novel$/i.test(f)), "There's still a Novel folder"],
			[Object.values(world.notes).some((x) => /outline chapter 1/i.test(x)), "The outline step is missing"],
			[says(t[3], /outline/i), "It didn't list the steps"],
		],
	},
	{
		id: "c4-run-log",
		steps: ["create a Fitness folder", "make a note called Workout log in it", "add today's run to it: 5k in 28 minutes", "?how long did my run take"],
		check: (_w, t) => [
			[!!world.notes["Fitness/Workout log.md"], "Fitness/Workout log doesn't exist"],
			[mentions("Workout log", "5k", "28"), "The run isn't in the log"],
			[says(t[3], /\b28\b/), "It didn't say 28 minutes"],
		],
	},
	{
		id: "c4-home-glacier",
		steps: ["make a komorebi home page for School and Work", "change it to glacier", "add a quick capture box", "add a calendar too"],
		check: (w) => {
			const h = w.home && has(w.home) ? text(w.home) : text("Home");
			return [
				[!!h && isKomorebi(h), "No Komorebi home page"],
				[dashIs(h, "blue"), "It isn't glacier"],
				[blocks(h).some((s) => s.list === "capture"), "No quick capture"],
				[blocks(h).some((s) => s.list === "calendar"), "No calendar"],
			];
		},
	},
	{
		id: "c4-errands",
		steps: ["make a board called Errands with To do and Done", "add buy stamps, return books and get a haircut", "move return books to Done", "delete the haircut card"],
		check: () => [
			[listCards("Errands", "Done").some((c) => c.includes("return books")), "Return books isn't in Done"],
			[listCards("Errands", "To do").some((c) => c.includes("stamps")), "Buy stamps isn't in To do"],
			[!/haircut/i.test(text("Errands")), "The haircut card is still there"],
		],
	},
	{
		id: "c4-essay",
		steps: ["move my Old draft to Journal", "rename it City essay", "add a second paragraph about parks", "give it a blue color in the sidebar"],
		check: () => [
			[!!world.notes["Journal/City essay.md"], "Journal/City essay doesn't exist"],
			[mentions("City essay", "cities", "park"), "The paragraph about parks (or the old text) is missing"],
			[isShade(str(world.looks["Journal/City essay"]?.color ?? world.looks["City essay"]?.color), "blue"), "It isn't blue"],
		],
	},
	{
		id: "c4-recipes-pink",
		steps: ["make a dashboard for Recipes", "make it komorebi", "make it pink", "add a timer"],
		check: () => {
			const d = dashFor(/recipe/i);
			return [
				[!!d && isKomorebi(world.notes[d]), "No Komorebi dashboard for Recipes"],
				[!!d && dashIs(world.notes[d], "pink"), "It isn't pink"],
				[!!d && blocks(world.notes[d]).some((s) => s.list === "timer"), "No timer"],
			];
		},
	},
	{
		id: "c4-inbox",
		steps: ["create folders called Inbox and Archive", "move Groceries into Inbox", "move Old draft into Archive", "make Inbox yellow"],
		check: () => [
			[!!world.notes["Inbox/Groceries.md"], "Groceries isn't in Inbox"],
			[!!world.notes["Archive/Old draft.md"], "Old draft isn't in Archive"],
			[looksLike("Inbox", "yellow"), "Inbox isn't yellow"],
		],
	},
	{
		id: "c4-goals",
		steps: ["make a note called Weekly goals", "add three goals to it", "add a fourth goal: call mom", "make it my home page"],
		check: (w) => [
			[has("Weekly goals"), "There's no Weekly goals"],
			[(text("Weekly goals").match(/^\s*(?:[-*]|\d+[.)])\s+\S/gm) ?? []).length >= 4, "There aren't 4 goals"],
			[mentions("Weekly goals", "call mom"), "'call mom' is missing"],
			[w.home === findNote("Weekly goals"), "It isn't the home page"],
		],
	},
	{
		id: "c4-light-teal",
		steps: ["switch to a light theme", "make the accent blue", "add a snippet that gives dashboard cards rounded corners", "actually make the accent teal"],
		check: (w) => {
			const css = Object.values(w.snippets).join("\n");
			return [
				[!!w.app.theme, "The theme didn't change"],
				[isShade(w.app.accent ?? "", "teal"), "The accent isn't teal"],
				[/border-radius/.test(css) && /note-dashboard|basalt-card/.test(css), "No snippet rounding dashboard cards"],
			];
		},
	},
	{
		id: "c4-work-full",
		steps: ["make a Work dashboard showing tasks", "add what's due this week", "add my tags", "make it komorebi with the indigo color way"],
		check: () => {
			const d = dashFor(/work/i);
			const b = d ? blocks(world.notes[d]) : [];
			return [
				[b.some((s) => s.list === "tasks" && s.due !== "week"), "No task list"],
				[b.some((s) => s.due === "week"), "Nothing due this week"],
				[b.some((s) => s.list === "tags"), "No tags"],
				[!!d && isKomorebi(world.notes[d]) && /indigo/.test(props(world.notes[d]).cssclass ?? ""), "It isn't Komorebi indigo"],
			];
		},
	},
	{
		id: "c4-groceries-qa",
		steps: ["?what's on my grocery list", "add bread", "take eggs off it", "?what's on it now"],
		check: (_w, t) => [
			[mentions("Groceries", "bread", "milk"), "Bread isn't added (or milk got lost)"],
			[!/\beggs\b/i.test(text("Groceries")), "Eggs are still on it"],
			[says(t[3], /bread/i) && says(t[3], /milk/i) && !says(t[3], /\beggs\b(?! (are|were|is) (gone|removed|off))/i), "It didn't say the list right"],
		],
	},
	{
		id: "c4-garden",
		steps: ["create a project called Garden", "add the steps dig beds and buy seeds", "make the project folder green with a leaf icon", "make a dashboard for the Garden project"],
		check: () => {
			const f = world.folders.find((x) => /garden$/i.test(x)) ?? "";
			return [
				[!!f, "There's no Garden project"],
				[Object.values(world.notes).some((x) => /dig beds/i.test(x) && /buy seeds/i.test(x)), "The steps are missing"],
				[looksLike(f, "green") && !!folderLook(f).icon, "The folder isn't green with an icon"],
				[!!dashFor(/garden/i), "There's no Garden dashboard"],
			];
		},
	},
	{
		id: "c4-school-crimson",
		steps: ["make a School area with a dashboard", "add my biology tasks to the dashboard", "make it komorebi", "make it crimson"],
		check: () => {
			const d = dashFor(/school/i);
			return [
				[!!d, "No School dashboard"],
				[!!d && blocks(world.notes[d]).some((s) => s.list === "tasks"), "No task list"],
				[!!d && isKomorebi(world.notes[d]), "It isn't Komorebi"],
				[!!d && dashIs(world.notes[d], "red"), "It isn't crimson"],
			];
		},
	},
	{
		id: "c4-party",
		steps: ["make a note called Party plan", "add a guest list: Ana, Ben and Cy", "add Dee to the guests", "?how many guests are there now"],
		check: (_w, t) => [
			[mentions("Party plan", "ana", "ben", "cy", "dee"), "Not all four guests are on it"],
			[says(t[3], /\b(4|four)\b/i), "It didn't say four"],
		],
	},
	{
		id: "c4-reading-board",
		steps: ["make a board called Reading with Want, Reading and Read lists", "add Dune to Want", "move Dune to Reading", "add Neuromancer to Read"],
		check: () => [
			[listCards("Reading", "Reading").some((c) => c.includes("dune")), "Dune isn't in Reading"],
			[!listCards("Reading", "Want").some((c) => c.includes("dune")), "Dune is still in Want"],
			[listCards("Reading", "Read").some((c) => c.includes("neuromancer")), "Neuromancer isn't in Read"],
		],
	},
	{
		id: "c4-drafts",
		steps: ["delete Old draft", "create a folder called Drafts", "make a note in Drafts called Essay ideas", "add 'cities at night' to it"],
		check: () => [
			[!has("Old draft"), "Old draft is still there"],
			[!!world.notes["Drafts/Essay ideas.md"], "Drafts/Essay ideas doesn't exist"],
			[mentions("Essay ideas", "cities at night"), "'cities at night' isn't in it"],
		],
	},
	{
		id: "c4-journal-home",
		steps: ["make a dashboard of my Journal", "add a habit tracker", "make it komorebi matcha", "make it my home page"],
		check: (w) => {
			const d = dashFor(/journal/i);
			return [
				[!!d && blocks(world.notes[d]).some((s) => s.list === "habits"), "No habit tracker"],
				[!!d && isKomorebi(world.notes[d]) && dashIs(world.notes[d], "green"), "It isn't Komorebi matcha"],
				[!!d && w.home === d, "It isn't the home page"],
			];
		},
	},
	{
		id: "c4-hobbies",
		steps: ["create a Hobbies area", "add notes called Guitar and Painting in it", "give Hobbies an orange color", "make a home page linking School, Work and Hobbies"],
		check: (w) => [
			[!!world.notes["Hobbies/Guitar.md"] && !!world.notes["Hobbies/Painting.md"], "Guitar and Painting aren't in Hobbies"],
			[looksLike("Hobbies", "orange"), "Hobbies isn't orange"],
			[!!w.home && linksTo(w.home, "school", "work", "hobbies"), "The home page doesn't link all three"],
		],
	},
];
