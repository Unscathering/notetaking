// The model test: about 20 real Basalt jobs, run on a model and scored, so
// models can be compared on what Basalt needs (planning the right changes,
// fixing grammar without changing words, answering from notes) and on how
// fast they are on this PC.
//
// It never touches the user's cave. The jobs happen in a small practice cave
// that only exists here: looking around reads from it, and planned changes
// are only scored, never carried out. The real instructions, tools and
// request sorting are used, so the score reflects real use.
import { TOOLS, WRITES, groupOf, look, tagProblem, toolsFor, type Group } from "./tools";
import { foundNotes, instructions, sortRequest } from "./agent.svelte";
import { ai, loadedModel, stop, stopAnswer, stream, useModel, wake } from "./engine.svelte";
import { recall } from "./recall";
import { clean, request } from "./proofread";
import { parseSpec } from "../query";
import { inDesktopApp } from "../cave";

// ---- The practice cave ----

const FOLDERS = ["School", "School/Biology", "Work", "Recipes", "Journal"];
const NOTES: Record<string, string> = {
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
const title = (p: string) => p.split("/").pop()!.replace(/\.md$/, "");
/** Like Basalt's own lookup (ws.resolve): the full path, or else the note's name alone. */
const findNote = (name: unknown) => {
	const n = String(name ?? "").trim().replace(/\.md$/i, "").toLowerCase();
	return Object.keys(NOTES).find((p) => p.replace(/\.md$/, "").toLowerCase() === n) ?? Object.keys(NOTES).find((p) => title(p).toLowerCase() === n.split("/").pop()) ?? null;
};
const isFolder = (name: unknown) => FOLDERS.some((f) => f.toLowerCase() === String(name ?? "").trim().replace(/^\/|\/$/g, "").toLowerCase());

function tree(): string {
	const lines: string[] = [];
	const walk = (folder: string, depth: number) => {
		for (const f of FOLDERS.filter((x) => x.split("/").slice(0, -1).join("/") === folder)) {
			lines.push(`${"  ".repeat(depth)}📁 ${f.split("/").pop()}`);
			walk(f, depth + 1);
		}
		for (const p of Object.keys(NOTES).filter((x) => x.split("/").slice(0, -1).join("/") === folder)) lines.push(`${"  ".repeat(depth)}- ${title(p)}`);
	};
	walk("", 0);
	return lines.join("\n");
}

/** What a looking-around tool says in the practice cave. */
function practiceLook(tool: string, a: Record<string, unknown>): string {
	switch (tool) {
		case "list_cave":
			return tree();
		case "read_note": {
			const p = findNote(a.path);
			return p ? `${p}:\n\n${NOTES[p]}` : `There's no note called "${String(a.path ?? "")}". Use list_cave to see what exists.`;
		}
		case "search_notes": {
			const words = String(a.query ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
			const hits = Object.entries(NOTES).filter(([p, t]) => words.some((w) => `${p} ${t}`.toLowerCase().includes(w)));
			return hits.length ? hits.slice(0, 5).map(([p, t]) => `${p}:\n${t.slice(0, 300)}`).join("\n\n") : "Nothing found.";
		}
		case "list_tags":
			return "#breakfast: Pancakes\n#dinner: Tomato soup";
	}
	// The manual and the app's look are the same everywhere.
	return look(tool, a);
}

/** A simpler version of Basalt's check, against the practice cave. */
function practiceCheck(tool: string, a: Record<string, unknown>): string {
	const needs = (v: unknown) => (findNote(v) || isFolder(v) ? "" : `There's nothing called "${String(v ?? "")}". Use list_cave to see the real names, and only use those.`);
	switch (tool) {
		case "move_item":
		case "rename_item":
		case "delete_item":
			return needs(a.path);
		case "edit_note":
		case "append_to_note":
		case "set_home":
			return findNote(a.path) ? "" : needs(a.path);
		case "add_live_block": {
			if (!findNote(a.path)) return needs(a.path);
			const tag = String(a.tag ?? "").replace(/^#/, "").toLowerCase();
			return tagProblem(tag, ["breakfast", "dinner"].includes(tag), FOLDERS);
		}
	}
	return "";
}

// ---- The jobs ----

interface Call {
	name: string;
	args: Record<string, unknown>;
}
interface Outcome {
	/** The changes it planned, in order. */
	plan: Call[];
	/** Everything it called, looking around included. */
	calls: Call[];
	text: string;
}

/** Whether the answer names a note as its source: linked in the text, or opened (Basalt lists opened notes as sources). */
const cites = (o: Outcome, note: string) => new RegExp(`\\[\\[${note}`, "i").test(o.text) || o.calls.some((c) => c.name === "read_note" && named(c.args.path, note));
/** 0 to 1, and why points were lost. */
type Score = { score: number; notes: string[] };

export type Area = "organize" | "dashboards" | "style" | "writing" | "answers" | "care";
export const AREAS: Record<Area, string> = { organize: "Organizing", dashboards: "Dashboards and boards", style: "Customizing", writing: "Grammar fixes", answers: "Answers from notes", care: "Care (no surprises)" };

interface Job {
	id: string;
	area: Area;
	/** What's asked, as the user would. */
	ask: string;
	/** For grammar jobs: the text and the right answers (any of them counts). */
	grammar?: { text: string; right: string[] };
	score?: (o: Outcome) => Score;
}

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const named = (v: unknown, want: string) => lc(v).replace(/\.md$/, "").split("/").pop() === want.toLowerCase();
const calls = (o: Outcome, tool: string) => o.plan.filter((c) => c.name === tool);

/** Adds up checks: each is [passed, what was wrong]. */
function tally(checks: Array<[boolean, string]>): Score {
	const notes = checks.filter(([ok]) => !ok).map(([, why]) => why);
	return { score: checks.filter(([ok]) => ok).length / checks.length, notes };
}

/** Points off for changes nobody asked for. */
const noSurprises = (o: Outcome, allowed: string[]): Array<[boolean, string]> => [
	[!o.plan.some((c) => c.name === "clear_cave" || (c.name === "delete_item" && !allowed.includes("delete_item"))), "It planned to delete something nobody asked it to"],
	[!o.plan.some((c) => c.name === "change_appearance" && !allowed.includes("change_appearance")), "It changed the app's look without being asked"],
];

const JOBS: Job[] = [
	{
		id: "areas",
		area: "organize",
		ask: "Set up my cave with three areas: School, Work and Fitness. Each needs its own dashboard, and I want a home page that links to them.",
		score: (o) => {
			const spaces = calls(o, "create_space").map((c) => lc(c.args.name));
			const home = calls(o, "create_home");
			return tally([
				...["school", "work", "fitness"].map((n): [boolean, string] => [spaces.includes(n), `No area with a dashboard for ${n}`]),
				[home.length === 1, home.length ? "More than one home page" : "No home page"],
				[!o.plan.some((c) => c.name === "create_note" && /dashboard|home/i.test(String(c.args.path))), "It wrote a dashboard by hand instead of letting Basalt make it"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "move",
		area: "organize",
		ask: "Move my Ideas note into a new folder called Inbox.",
		score: (o) => {
			const move = calls(o, "move_item").find((c) => named(c.args.path, "ideas"));
			return tally([
				[!!move, "It didn't move the Ideas note"],
				[!!move && lc(move.args.to_folder) === "inbox", "It moved it somewhere other than Inbox"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "rename",
		area: "organize",
		ask: "Rename 'Old draft' to 'Essay draft'.",
		score: (o) => {
			const r = calls(o, "rename_item").find((c) => named(c.args.path, "old draft"));
			return tally([
				[!!r, "It didn't rename Old draft"],
				[!!r && lc(r.args.new_name).replace(/\.md$/, "") === "essay draft", "The new name isn't 'Essay draft'"],
				[o.plan.length === 1, "It planned more than the rename"],
			]);
		},
	},
	{
		id: "folder",
		area: "organize",
		ask: "Make a folder called Travel, blue, with a plane icon.",
		score: (o) => {
			const f = calls(o, "create_folder").find((c) => named(c.args.path, "travel")) ?? calls(o, "create_space").find((c) => named(c.args.name, "travel"));
			return tally([
				[!!f, "No Travel folder"],
				[!!f && lc(f.args.color).includes("blue"), "It isn't blue"],
				[!!f && /plane|✈/.test(lc(f.args.icon)), "No plane icon"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "project",
		area: "organize",
		ask: "Start a project called Website redesign. The steps are: wireframes, pick colors, build the pages.",
		score: (o) => {
			const p = calls(o, "create_project")[0];
			const steps = Array.isArray(p?.args.steps) ? (p.args.steps as unknown[]).length : 0;
			return tally([
				[!!p, "It didn't use create_project"],
				[!!p && lc(p.args.name).includes("website"), "The project isn't called Website redesign"],
				[steps >= 3, "Not all three steps are in it"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "board",
		area: "dashboards",
		ask: "Make a board in my Work folder for my tasks, with To do, Doing and Done lists. Put 'Email Sam' in To do.",
		score: (o) => {
			const b = calls(o, "create_board")[0];
			const lists = (Array.isArray(b?.args.lists) ? b.args.lists : []) as Array<{ name?: string; cards?: Array<{ title?: string }> }>;
			const todo = lists.find((l) => lc(l.name) === "to do");
			const card = !!todo?.cards?.some((c) => /email sam/i.test(String(c.title))) || calls(o, "add_card").some((c) => /email sam/i.test(String(c.args.title)));
			return tally([
				[!!b, "No board"],
				[!!b && lc(b.args.path).startsWith("work/"), "The board isn't in Work"],
				[["to do", "doing", "done"].every((n) => lists.some((l) => lc(l.name) === n)), "The lists aren't To do, Doing and Done"],
				[card, "'Email Sam' isn't in To do"],
			]);
		},
	},
	{
		id: "dashboard",
		area: "dashboards",
		ask: "Turn my Cell notes into a dashboard that shows my open tasks and what's due this week.",
		score: (o) => {
			const d = calls(o, "create_dashboard").find((c) => named(c.args.path, "cell notes"));
			// A new dashboard note still earns the points for what it shows.
			const any = d ?? calls(o, "create_dashboard")[0];
			const sections = (Array.isArray(any?.args.sections) ? any.args.sections : []).map(lc);
			const blocks = calls(o, "add_live_block").filter((c) => named(c.args.path, "cell notes"));
			const tasks = sections.includes("tasks") || blocks.some((c) => lc(c.args.list) === "tasks" && !c.args.due);
			const week = sections.includes("due_this_week") || blocks.some((c) => lc(c.args.due) === "week");
			return tally([
				[!!d || blocks.length > 0, any ? "It made a new dashboard note instead of turning Cell notes into one" : "It didn't make Cell notes a dashboard"],
				[tasks, "No open tasks list"],
				[week, "No due-this-week list"],
				[!o.plan.some((c) => c.name === "edit_note" && named(c.args.path, "cell notes")), "It rewrote the note instead of adding to it"],
			]);
		},
	},
	{
		id: "live",
		area: "dashboards",
		ask: "Add a live list of all my recipes, shown as cards, to my Ideas note.",
		score: (o) => {
			const b = calls(o, "add_live_block").find((c) => named(c.args.path, "ideas"));
			const lines = b ? ["title", "list", "show", "from", "tag", "where", "due", "sort", "limit"].map((k) => (b.args[k] ? `${k}: ${String(b.args[k])}` : "")).filter(Boolean).join("\n") : "";
			return tally([
				[!!b, "No live list added to Ideas"],
				[!!b && /recipes/i.test(String(b.args.from)), "It doesn't list the Recipes folder"],
				[!!b && lc(b.args.show) === "cards", "It isn't shown as cards"],
				[!!b && !parseSpec(lines).unknown.length, "The live list has mistakes in it"],
			]);
		},
	},
	{
		id: "template",
		area: "dashboards",
		ask: "Make a meeting note in Work called 'Planning with Ana' from the meeting template.",
		score: (o) => {
			const t = calls(o, "note_from_template")[0];
			return tally([
				[!!t, "It didn't use the template"],
				[!!t && lc(t.args.template) === "meeting", "It used a different template"],
				[!!t && /^work\/planning with ana(\.md)?$/.test(lc(t.args.path)), "The note isn't Work/Planning with Ana"],
			]);
		},
	},
	{
		id: "theme",
		area: "style",
		ask: "Switch the app to the Midnight theme with a purple accent.",
		score: (o) => {
			const c = calls(o, "change_appearance")[0];
			return tally([
				[!!c, "It didn't change the look"],
				[!!c && lc(c.args.theme) === "midnight", "It isn't the Midnight theme"],
				[!!c && /purple|#[0-9a-f]{6}/.test(lc(c.args.accent)), "No purple accent"],
			]);
		},
	},
	{
		id: "snippet",
		area: "style",
		ask: "Write a CSS snippet that makes the headings in my notes use the accent color.",
		score: (o) => {
			const sn = calls(o, "create_snippet")[0];
			const css = String(sn?.args.css ?? "");
			return tally([
				[!!sn, "No snippet"],
				[/h[1-6]|\.cm-h/.test(css), "The CSS doesn't target headings"],
				[/var\(--accent\)/.test(css), "It doesn't use the accent color variable"],
				[css.split("{").length === css.split("}").length && css.includes("{"), "The CSS is broken"],
			]);
		},
	},
	{
		id: "grammar1",
		area: "writing",
		ask: "Grammar: “yesterday me and my freind goes…”",
		grammar: { text: "yesterday me and my freind goes to the libary to study for are test.", right: ["Yesterday my friend and I went to the library to study for our test.", "Yesterday, my friend and I went to the library to study for our test."] },
	},
	{
		id: "grammar2",
		area: "writing",
		ask: "Grammar: “The meeting went fine, i think…”",
		grammar: { text: "The meeting went fine, i think we should of started earlier though. Its hard to focus after lunch.", right: ["The meeting went fine, I think we should have started earlier though. It's hard to focus after lunch.", "The meeting went fine; I think we should have started earlier, though. It's hard to focus after lunch.", "The meeting went fine. I think we should have started earlier, though. It's hard to focus after lunch.", "The meeting went fine, I think we should have started earlier, though. It's hard to focus after lunch."] },
	},
	{
		id: "grammar3",
		area: "writing",
		ask: "Grammar: a sentence with nothing wrong (should stay as it is)",
		grammar: { text: "The garden looks lovely this spring, and the tomatoes are finally growing.", right: ["The garden looks lovely this spring, and the tomatoes are finally growing."] },
	},
	{
		id: "exam",
		area: "answers",
		ask: "When is my biology exam?",
		score: (o) => tally([
			[/14|fourteenth/.test(o.text) && /nov|11-14|11\/14/i.test(o.text), "It didn't give the right date (November 14)"],
			[cites(o, "cell notes"), "It didn't say which note it came from"],
			[!o.plan.length, "It planned changes for a question"],
		]),
	},
	{
		id: "decided",
		area: "answers",
		ask: "What did Sam and I decide in our meeting?",
		score: (o) => tally([
			[/march 3|3 march|march 3rd/i.test(o.text), "It missed the launch date (March 3)"],
			[/photo/i.test(o.text) && /about/i.test(o.text), "It missed who does what"],
			[cites(o, "meeting with sam"), "It didn't say which note it came from"],
			[!o.plan.length, "It planned changes for a question"],
		]),
	},
	{
		id: "delete",
		area: "care",
		ask: "Delete the Groceries note.",
		score: (o) => tally([
			[calls(o, "delete_item").some((c) => named(c.args.path, "groceries")), "It didn't delete Groceries"],
			[o.plan.length === 1, "It planned more than deleting Groceries"],
			[!/are you sure|should i|do you want me to/i.test(o.text), "It asked for confirmation in the chat (the plan already asks)"],
		]),
	},
	{
		id: "vague",
		area: "care",
		ask: "Can you help me tidy things up a bit?",
		score: (o) => tally([
			...noSurprises(o, []),
			[!o.plan.some((c) => c.name === "edit_note"), "It rewrote notes nobody asked about"],
			[o.text.trim().length > 20, "It didn't say anything back"],
		]),
	},

	// ---- A second set: the same kinds of jobs, worded differently and about other notes ----
	// (so instructions tuned on the first set can't just fit those exact questions)
	{
		id: "areas2",
		area: "organize",
		ask: "I want my notes split into Music, Cooking and Travel, each with a dashboard, plus a start page linking all three.",
		score: (o) => {
			const spaces = calls(o, "create_space").map((c) => lc(c.args.name));
			const home = calls(o, "create_home");
			return tally([
				...["music", "cooking", "travel"].map((n): [boolean, string] => [spaces.includes(n), `No area with a dashboard for ${n}`]),
				[home.length === 1, home.length ? "More than one start page" : "No start page"],
				[!o.plan.some((c) => c.name === "create_note" && /dashboard|home|start/i.test(String(c.args.path))), "It wrote a dashboard by hand instead of letting Basalt make it"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "move2",
		area: "organize",
		ask: "Put my Groceries list in a new folder named Shopping.",
		score: (o) => {
			const move = calls(o, "move_item").find((c) => named(c.args.path, "groceries"));
			return tally([
				[!!move, "It didn't move Groceries"],
				[!!move && lc(move.args.to_folder) === "shopping", "It moved it somewhere other than Shopping"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "rename2",
		area: "organize",
		ask: "Change the name of 'Ideas for the shop' to 'Shop ideas'.",
		score: (o) => {
			const r = calls(o, "rename_item").find((c) => named(c.args.path, "ideas for the shop"));
			return tally([
				[!!r, "It didn't rename Ideas for the shop"],
				[!!r && lc(r.args.new_name).replace(/\.md$/, "") === "shop ideas", "The new name isn't 'Shop ideas'"],
				[o.plan.length === 1, "It planned more than the rename"],
			]);
		},
	},
	{
		id: "folder2",
		area: "organize",
		ask: "Create a green folder called Garden with a leaf icon.",
		score: (o) => {
			const f = calls(o, "create_folder").find((c) => named(c.args.path, "garden")) ?? calls(o, "create_space").find((c) => named(c.args.name, "garden"));
			return tally([
				[!!f, "No Garden folder"],
				[!!f && lc(f.args.color).includes("green"), "It isn't green"],
				[!!f && /leaf|🌿|🍃/.test(lc(f.args.icon)), "No leaf icon"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "project2",
		area: "organize",
		ask: "New project: Kitchen remodel. First steps are measure the room, pick tiles and hire a plumber.",
		score: (o) => {
			const p = calls(o, "create_project")[0];
			const steps = Array.isArray(p?.args.steps) ? (p.args.steps as unknown[]).length : 0;
			return tally([
				[!!p, "It didn't use create_project"],
				[!!p && lc(p.args.name).includes("kitchen"), "The project isn't called Kitchen remodel"],
				[steps >= 3, "Not all three steps are in it"],
				...noSurprises(o, []),
			]);
		},
	},
	{
		id: "board2",
		area: "dashboards",
		ask: "Set up a homework board in School with the lists Backlog, This week and Done, and a card 'Read chapter 3' in Backlog.",
		score: (o) => {
			const b = calls(o, "create_board")[0];
			const lists = (Array.isArray(b?.args.lists) ? b.args.lists : []) as Array<{ name?: string; cards?: Array<{ title?: string }> }>;
			const backlog = lists.find((l) => lc(l.name) === "backlog");
			const card = !!backlog?.cards?.some((c) => /read chapter 3/i.test(String(c.title))) || calls(o, "add_card").some((c) => /read chapter 3/i.test(String(c.args.title)));
			return tally([
				[!!b, "No board"],
				[!!b && lc(b.args.path).startsWith("school/"), "The board isn't in School"],
				[["backlog", "this week", "done"].every((n) => lists.some((l) => lc(l.name) === n)), "The lists aren't Backlog, This week and Done"],
				[card, "'Read chapter 3' isn't in Backlog"],
			]);
		},
	},
	{
		id: "dashboard2",
		area: "dashboards",
		ask: "Make my Math homework note into a dashboard showing overdue tasks and my tags.",
		score: (o) => {
			const d = calls(o, "create_dashboard").find((c) => named(c.args.path, "math homework"));
			const any = d ?? calls(o, "create_dashboard")[0];
			const sections = (Array.isArray(any?.args.sections) ? any.args.sections : []).map(lc);
			const blocks = calls(o, "add_live_block").filter((c) => named(c.args.path, "math homework"));
			return tally([
				[!!d || blocks.length > 0, any ? "It made a new dashboard note instead of turning Math homework into one" : "It didn't make Math homework a dashboard"],
				[sections.includes("overdue") || blocks.some((c) => lc(c.args.due) === "overdue"), "No overdue list"],
				[sections.includes("tags") || blocks.some((c) => lc(c.args.list) === "tags"), "No tags list"],
				[!o.plan.some((c) => c.name === "edit_note" && named(c.args.path, "math homework")), "It rewrote the note instead of adding to it"],
			]);
		},
	},
	{
		id: "live2",
		area: "dashboards",
		ask: "In my Ideas note, add a live table of the notes in my Work folder.",
		score: (o) => {
			const b = calls(o, "add_live_block").find((c) => named(c.args.path, "ideas"));
			const lines = b ? ["title", "list", "show", "from", "tag", "where", "due", "sort", "limit"].map((k) => (b.args[k] ? `${k}: ${String(b.args[k])}` : "")).filter(Boolean).join("\n") : "";
			return tally([
				[!!b, "No live list added to Ideas"],
				[!!b && /work/i.test(String(b.args.from)), "It doesn't list the Work folder"],
				[!!b && lc(b.args.show) === "table", "It isn't shown as a table"],
				[!!b && !parseSpec(lines).unknown.length, "The live list has mistakes in it"],
			]);
		},
	},
	{
		id: "template2",
		area: "dashboards",
		ask: "Use the Book notes template to start a note called 'Dune' in School.",
		score: (o) => {
			const t = calls(o, "note_from_template")[0];
			return tally([
				[!!t, "It didn't use the template"],
				[!!t && lc(t.args.template) === "book notes", "It used a different template"],
				[!!t && /^school\/dune(\.md)?$/.test(lc(t.args.path)), "The note isn't School/Dune"],
			]);
		},
	},
	{
		id: "theme2",
		area: "style",
		ask: "Give Basalt the Paper theme, but with a green accent color.",
		score: (o) => {
			const c = calls(o, "change_appearance")[0];
			return tally([
				[!!c, "It didn't change the look"],
				[!!c && lc(c.args.theme) === "paper", "It isn't the Paper theme"],
				[!!c && /green|#[0-9a-f]{6}/.test(lc(c.args.accent)), "No green accent"],
			]);
		},
	},
	{
		id: "snippet2",
		area: "style",
		ask: "Make a CSS snippet so notes marked as dashboards get a soft accent-colored border around their cards.",
		score: (o) => {
			const sn = calls(o, "create_snippet")[0];
			const css = String(sn?.args.css ?? "");
			return tally([
				[!!sn, "No snippet"],
				[/note-dashboard|\.dashboard/.test(css), "The CSS doesn't target dashboard notes"],
				[/basalt-card|card/.test(css) && /border/.test(css), "No border on the cards"],
				[/var\(--accent/.test(css), "It doesn't use the accent color variable"],
				[css.split("{").length === css.split("}").length && css.includes("{"), "The CSS is broken"],
			]);
		},
	},
	{
		id: "grammar4",
		area: "writing",
		ask: "Grammar: “their going to the park tomorrow, and there dog…”",
		grammar: { text: "their going to the park tomorrow, and there dog is coming to.", right: ["They're going to the park tomorrow, and their dog is coming too."] },
	},
	{
		id: "grammar5",
		area: "writing",
		ask: "Grammar: “she dont like when people is late…”",
		grammar: { text: "she dont like when people is late to her partys.", right: ["She doesn't like when people are late to her parties.", "She doesn't like it when people are late to her parties."] },
	},
	{
		id: "grammar6",
		area: "writing",
		ask: "Grammar: another sentence with nothing wrong",
		grammar: { text: "We finished the report on Friday and sent it to the whole team.", right: ["We finished the report on Friday and sent it to the whole team."] },
	},
	{
		id: "exam2",
		area: "answers",
		ask: "Which room is my biology exam in?",
		score: (o) => tally([
			[/\b204\b/.test(o.text), "It didn't give the right room (204)"],
			[cites(o, "cell notes"), "It didn't say which note it came from"],
			[!o.plan.length, "It planned changes for a question"],
		]),
	},
	{
		id: "decided2",
		area: "answers",
		ask: "Who is taking the photos for the new website?",
		score: (o) => tally([
			[/\bsam\b/i.test(o.text), "It didn't say Sam"],
			[cites(o, "meeting with sam"), "It didn't say which note it came from"],
			[!o.plan.length, "It planned changes for a question"],
		]),
	},
	{
		id: "delete2",
		area: "care",
		ask: "Remove the note called Old draft.",
		score: (o) => tally([
			[calls(o, "delete_item").some((c) => named(c.args.path, "old draft")), "It didn't delete Old draft"],
			[o.plan.length === 1, "It planned more than deleting Old draft"],
			[!/are you sure|should i|do you want me to/i.test(o.text), "It asked for confirmation in the chat (the plan already asks)"],
		]),
	},
	{
		id: "vague2",
		area: "care",
		ask: "My notes feel kind of messy lately.",
		score: (o) => tally([
			...noSurprises(o, []),
			[!o.plan.some((c) => c.name === "edit_note"), "It rewrote notes nobody asked about"],
			[o.text.trim().length > 20, "It didn't say anything back"],
		]),
	},
];

export const JOB_COUNT = JOBS.length;

// ---- Running ----

export interface JobResult {
	id: string;
	area: Area;
	ask: string;
	score: number;
	notes: string[];
	seconds: number;
	/** What the model did, for jobs that lost points: its actions and the start of its reply. */
	did?: string;
}

export interface TestRun {
	model: string;
	when: string;
	/** 0 to 100. */
	score: number;
	byArea: Partial<Record<Area, number>>;
	/** Average seconds for a job. */
	seconds: number;
	/** Words written per second, as the engine reported it. */
	wordsPerSecond: number;
	jobs: JobResult[];
	/** The model file the engine really had loaded, if it could tell. */
	servedBy?: string;
}

// "-3": 36 tests (two sets), notes up front and sources counted, as in a real chat.
const KEY = "basalt.ai-tests-3";
/** Each job gets this long before it counts as failed. */
const JOB_LIMIT_S = 240;

function load(): TestRun[] {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? "[]") as TestRun[];
	} catch {
		return [];
	}
}

export const bench = $state({
	/** The latest run for each model, best first. */
	runs: load(),
	running: false,
	/** What it's doing, for the progress line. */
	model: "",
	job: 0,
	of: 0,
	modelIndex: 0,
	models: 0,
	cancelled: false,
	error: "",
	/** The job being run, as asked. */
	current: "",
	/** This model's results so far, for the live numbers. */
	done: [] as JobResult[],
	/** When the whole run started, and when this model's started (ms). */
	started: 0,
	modelStarted: 0,
	/** Seconds each finished model took, to guess how long the rest will take. */
	modelSeconds: [] as number[],
});

export const AREA_COUNT = Object.keys(AREAS).length;

function keep(run: TestRun) {
	bench.runs = [run, ...bench.runs.filter((r) => r.model !== run.model)].sort((a, b) => b.score - a.score);
	try {
		localStorage.setItem(KEY, JSON.stringify(bench.runs));
	} catch {
		// Fine; the results still show until Basalt closes.
	}
}

let perSecond: number[] = [];
const timing = (d: Record<string, unknown>) => {
	const t = d.timings as { predicted_per_second?: number; predicted_n?: number } | undefined;
	if (t?.predicted_per_second && (t.predicted_n ?? 0) > 8) perSecond.push(t.predicted_per_second * 0.75);
};

/** Runs one conversation job in the practice cave and returns what it planned and said. */
async function converse(job: Job): Promise<Outcome> {
	const groups: Group[] = await sortRequest(job.ask, "", []).catch(() => []);
	const tools = toolsFor(groups);
	// As in a real chat, the notes that best match the message come with it.
	const found = recall(new Map(Object.entries(NOTES)), job.ask, title, 3);
	const cave = `Cave: Practice (${Object.keys(NOTES).length} notes, ${FOLDERS.length} folders).\nNo note is open.${foundNotes(found)}`;
	type Msg = { role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string };
	const messages: Msg[] = [
		{ role: "system", content: instructions("") },
		{ role: "user", content: `${job.ask}\n\n(${cave})` },
	];
	const out: Outcome = { plan: [], calls: [], text: "" };
	const done = new Set<string>();
	for (let round = 0; round < 8; round++) {
		let content = "";
		const got: Array<{ id: string; name: string; args: string }> = [];
		const stopped = await stream({ messages, tools, temperature: 0.5, dry_multiplier: 0.8, cache_prompt: true, id_slot: 0, effort: "medium" }, (d) => {
			timing(d);
			const delta = (d.choices as Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> | undefined)?.[0]?.delta;
			if (!delta) return;
			if (delta.content) content += delta.content;
			for (const t of delta.tool_calls ?? []) {
				const i = t.index ?? got.length;
				got[i] ??= { id: t.id ?? `call_${round}_${i}`, name: "", args: "" };
				if (t.id) got[i].id = t.id;
				if (t.function?.name) got[i].name += t.function.name;
				if (t.function?.arguments) got[i].args += t.function.arguments;
			}
		}, "main");
		out.text += content;
		const real = got.filter(Boolean);
		if (stopped) throw new Error("Took too long");
		if (!real.length) break;
		messages.push({ role: "assistant", content, tool_calls: real.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
		let fresh = 0;
		for (const c of real) {
			let args: Record<string, unknown> = {};
			let result: string;
			try {
				args = JSON.parse(c.args || "{}") as Record<string, unknown>;
			} catch {
				messages.push({ role: "tool", tool_call_id: c.id, content: "Those arguments weren't valid JSON. Try again." });
				continue;
			}
			const key = `${c.name} ${JSON.stringify(args)}`;
			out.calls.push({ name: c.name, args });
			if (done.has(key)) result = "You already did exactly that. Don't repeat it: answer the user now.";
			else if (c.name === "remember") result = "Saved.";
			else if (!TOOLS.some((t) => t.function.name === c.name)) result = `There's no tool called ${c.name}.`;
			// As in a real chat: the look stays as it is unless the request was about it.
			else if (groupOf(c.name) === "style" && !tools.some((t) => t.function.name === c.name)) result = "The user didn't ask about the app's look, so leave it as it is.";
			else if (WRITES.has(c.name)) {
				const problem = practiceCheck(c.name, args);
				if (problem) result = `Not added to the plan: ${problem}`;
				else {
					out.plan.push({ name: c.name, args });
					result = "Added to the plan. The user approves the whole plan with one click after your reply; don't ask them to confirm and don't say it's done.";
				}
			} else result = practiceLook(c.name, args);
			if (!done.has(key)) fresh++;
			done.add(key);
			messages.push({ role: "tool", tool_call_id: c.id, content: result });
		}
		if (!fresh) break;
	}
	return out;
}

/** Words that differ between two texts (a word-level edit distance). */
function wordEdits(a: string, b: string): number {
	const x = a.split(/\s+/).filter(Boolean), y = b.split(/\s+/).filter(Boolean);
	let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
	for (let i = 1; i <= x.length; i++) {
		const row = [i];
		for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
		prev = row;
	}
	return prev[y.length];
}

async function grammar(job: Job): Promise<Score & { got: string }> {
	const { text, right } = job.grammar!;
	let answer = "";
	await stream(request("grammar", [text]), (d) => {
		timing(d);
		answer += (d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "";
	}, "main");
	const got = clean(answer, text).split("\n").join(" ").trim();
	const needed = wordEdits(text, right[0]);
	const off = Math.min(...right.map((r) => wordEdits(got, r)));
	if (!needed) return off ? { score: 0, notes: ["It changed a sentence that had nothing wrong"], got } : { score: 1, notes: [], got };
	return { score: Math.max(0, 1 - off / needed), notes: off ? [`${off} ${off === 1 ? "word differs" : "words differ"} from a right answer`] : [], got };
}

/** What a conversation job did, in short, to show under a miss. */
function did(o: Outcome): string {
	const acts = o.calls.map((c) => `${c.name}(${JSON.stringify(c.args).slice(1, -1).slice(0, 140)})`);
	const reply = o.text.trim().replace(/\s+/g, " ").slice(0, 220);
	return [acts.length ? `Did: ${acts.join(" → ")}` : "Did: nothing", reply ? `Said: “${reply}${o.text.trim().length > 220 ? "…" : ""}”` : ""].filter(Boolean).join("\n");
}

/** Live numbers for the run going on: how far, how well so far, and how long is left. */
export function progress(now = Date.now()) {
	const finished = bench.done.length;
	const passed = bench.done.filter((j) => j.score >= 1).length;
	const failed = bench.done.filter((j) => j.score === 0).length;
	const total = bench.of * bench.models;
	const doneOverall = (bench.modelIndex - 1) * bench.of + finished;
	const elapsed = (now - bench.started) / 1000;
	// Jobs so far on this model set the pace; a model just started borrows the last one's.
	const perJob = finished ? (now - bench.modelStarted) / 1000 / finished : bench.modelSeconds.length ? bench.modelSeconds.at(-1)! / bench.of : 0;
	const left = perJob ? perJob * (total - doneOverall) : 0;
	return {
		finished,
		passed,
		partly: finished - passed - failed,
		failed,
		/** This model's score so far, 0 to 100. */
		score: finished ? Math.round((bench.done.reduce((n, j) => n + j.score, 0) / finished) * 100) : 0,
		total,
		doneOverall,
		percent: total ? Math.round((doneOverall / total) * 100) : 0,
		elapsed,
		left,
	};
}

/** Runs every job on the model in use. */
async function testModel(): Promise<TestRun> {
	perSecond = [];
	const results: JobResult[] = [];
	bench.of = JOBS.length;
	bench.done = [];
	bench.modelStarted = Date.now();
	// Make sure the engine really has this model loaded (and restart it once if not).
	await wake();
	let servedBy = await loadedModel().catch(() => "");
	if (servedBy && servedBy !== ai.model) {
		await stop();
		await wake();
		servedBy = await loadedModel().catch(() => "");
	}
	// A new order every run, so no test always gets a freshly woken engine (or a warm one).
	const order = [...JOBS];
	for (let i = order.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[order[i], order[j]] = [order[j], order[i]];
	}
	for (const [i, job] of order.entries()) {
		if (bench.cancelled) break;
		bench.job = i + 1;
		bench.current = job.ask;
		const t0 = performance.now();
		const limit = setTimeout(stopAnswer, JOB_LIMIT_S * 1000);
		let s: Score;
		let what = "";
		try {
			if (job.grammar) {
				const g = await grammar(job);
				s = g;
				what = `Got: “${g.got}”`;
			} else {
				const o = await converse(job);
				s = job.score!(o);
				what = did(o);
			}
		} catch (e) {
			s = { score: 0, notes: [e instanceof Error ? e.message : String(e)] };
		} finally {
			clearTimeout(limit);
		}
		results.push({ id: job.id, area: job.area, ask: job.ask, score: s.score, notes: s.notes, seconds: (performance.now() - t0) / 1000, ...(s.score < 1 && what ? { did: what } : {}) });
		bench.done = [...results];
	}
	bench.modelSeconds = [...bench.modelSeconds, (Date.now() - bench.modelStarted) / 1000];
	// Shown in the usual order, whatever order they ran in.
	results.sort((x, y) => JOBS.findIndex((j) => j.id === x.id) - JOBS.findIndex((j) => j.id === y.id));
	const byArea: Partial<Record<Area, number>> = {};
	for (const a of Object.keys(AREAS) as Area[]) {
		const r = results.filter((x) => x.area === a);
		if (r.length) byArea[a] = Math.round((r.reduce((n, x) => n + x.score, 0) / r.length) * 100);
	}
	return {
		model: ai.model,
		when: new Date().toISOString(),
		score: Math.round((results.reduce((n, x) => n + x.score, 0) / Math.max(1, results.length)) * 100),
		byArea,
		seconds: results.reduce((n, x) => n + x.seconds, 0) / Math.max(1, results.length),
		wordsPerSecond: perSecond.length ? perSecond.reduce((a, b) => a + b, 0) / perSecond.length : 0,
		jobs: results,
		servedBy,
	};
}

/** Tests the model in use, or each of `models` in turn (then goes back to the one in use). */
export async function runTest(models: string[] = [ai.model]) {
	if (bench.running) return;
	const before = ai.model;
	Object.assign(bench, { running: true, cancelled: false, error: "", models: models.length, modelIndex: 0, started: Date.now(), modelSeconds: [], done: [], current: "" });
	try {
		for (const [i, model] of models.entries()) {
			if (bench.cancelled) break;
			bench.modelIndex = i + 1;
			bench.model = model;
			if (inDesktopApp && ai.model !== model) await useModel(model);
			const run = await testModel();
			// A run cut short isn't a fair score.
			if (!bench.cancelled) keep(run);
		}
	} catch (e) {
		bench.error = e instanceof Error ? e.message : String(e);
	} finally {
		if (inDesktopApp && ai.model !== before) await useModel(before);
		bench.running = false;
	}
}

export function cancelTest() {
	bench.cancelled = true;
	stopAnswer();
}

export function forgetRun(model: string) {
	bench.runs = bench.runs.filter((r) => r.model !== model);
	try {
		localStorage.setItem(KEY, JSON.stringify(bench.runs));
	} catch {
		// Fine.
	}
}
