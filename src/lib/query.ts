// Live blocks: a ```basalt code block in a note becomes a live list of notes,
// tasks, tags or backlinks, as a list, cards, a table or a count. They're how
// dashboards are made. A block is plain `key: value` lines:
//
//   list: notes | tasks | tags | backlinks | habits  (what to list; notes if left out)
//   days: 28                                   (habits: how many days back)
//   from: Projects, Writing                    (only inside these folders)
//   tag: idea                                  (only with this tag)
//   where: status = active                     (a property's value; also !=, >, <, has status)
//   search: garden                             (only notes that mention it)
//   done: false | true | any                   (tasks; false if left out)
//   due: today | week | overdue | any          (tasks with a due date)
//   to: Garden plan                            (backlinks to another note; this one if left out)
//   sort: name | -name | <property> | -<property> | due
//   limit: 10
//   show: list | cards | table | count
//   columns: status, due                       (table columns)
//   title: My projects                         (a heading above it)
import { agenda } from "./agenda";
import { noteTitle } from "./cave";
import { linksIn, tagsIn } from "./graph";
import { readProps } from "./notes";

export interface Spec {
	list: "notes" | "tasks" | "tags" | "backlinks" | "habits";
	show: "list" | "cards" | "table" | "count";
	from: string[];
	tag: string;
	where: Array<{ key: string; op: string; value: string }>;
	search: string;
	done: "false" | "true" | "any";
	due: string;
	to: string;
	sort: string;
	limit: number;
	/** Habits: how many days back. */
	days: number;
	columns: string[];
	title: string;
	/** Lines it didn't understand, to point out. */
	unknown: string[];
}

export function parseSpec(source: string): Spec {
	const spec: Spec = { list: "notes", show: "list", from: [], tag: "", where: [], search: "", done: "false", due: "", to: "", sort: "", limit: 50, days: 28, columns: [], title: "", unknown: [] };
	for (const raw of source.split("\n")) {
		const line = raw.replace(/\s+#.*$/, "").trim();
		if (!line) continue;
		const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
		if (!m) {
			spec.unknown.push(line);
			continue;
		}
		const [, key, value] = m;
		const v = value.trim();
		switch (key.toLowerCase()) {
			case "list":
				if (["notes", "tasks", "tags", "backlinks", "habits"].includes(v)) spec.list = v as Spec["list"];
				else spec.unknown.push(line);
				break;
			case "show":
				if (["list", "cards", "table", "count"].includes(v)) spec.show = v as Spec["show"];
				else spec.unknown.push(line);
				break;
			case "from":
			case "folder":
				spec.from = v.split(",").map((f) => f.trim().replace(/^\/|\/$/g, "")).filter(Boolean);
				break;
			case "tag":
				spec.tag = v.replace(/^#/, "").toLowerCase();
				break;
			case "where": {
				const w = /^(\w[\w-]*)\s*(!=|>=|<=|=|>|<)\s*(.*)$/.exec(v) ?? (/^has\s+(\w[\w-]*)$/.exec(v) ? ["", /^has\s+(\w[\w-]*)$/.exec(v)![1], "has", ""] : null);
				if (w) spec.where.push({ key: w[1].toLowerCase(), op: w[2], value: w[3].trim().replace(/^["']|["']$/g, "") });
				else spec.unknown.push(line);
				break;
			}
			case "search":
				spec.search = v.toLowerCase();
				break;
			case "done":
				spec.done = v === "true" || v === "yes" ? "true" : v === "any" ? "any" : "false";
				break;
			case "due":
				spec.due = v;
				break;
			case "to":
				spec.to = v.replace(/^\[\[|\]\]$/g, "");
				break;
			case "sort":
				spec.sort = v;
				break;
			case "limit":
				spec.limit = Math.max(1, Math.min(500, parseInt(v) || 50));
				break;
			case "days":
				spec.days = Math.max(7, Math.min(120, parseInt(v) || 28));
				break;
			case "columns":
				spec.columns = v.split(",").map((c) => c.trim()).filter(Boolean);
				break;
			case "title":
				spec.title = v;
				break;
			default:
				spec.unknown.push(line);
		}
	}
	return spec;
}

export interface Row {
	/** The note it's in or about. */
	path: string;
	title: string;
	folder: string;
	/** Properties, by lowercase name. */
	props: Record<string, string>;
	description?: string;
	tags: string[];
	/** For tasks. */
	task?: { done: boolean; due?: string; line: number };
	/** For tags: how many notes. */
	count?: number;
}

const inFolders = (path: string, from: string[]) => !from.length || from.some((f) => path === `${f}.md` || path.startsWith(`${f}/`));

function propsOf(text: string): { props: Record<string, string>; description?: string; tags: string[] } {
	const p = readProps(text);
	const props: Record<string, string> = {};
	for (const [k, v] of Object.entries(p.other)) props[k.toLowerCase()] = v;
	if (p.description) props.description = p.description;
	return { props, description: p.description, tags: tagsIn(text) };
}

function matches(value: string | undefined, op: string, want: string) {
	if (op === "has") return value != null && value !== "";
	const a = (value ?? "").toLowerCase(), b = want.toLowerCase();
	const na = parseFloat(a), nb = parseFloat(b);
	const numbers = !isNaN(na) && !isNaN(nb) && /^[\d.-]+$/.test(a) && /^[\d.-]+$/.test(b);
	switch (op) {
		case "=":
			return a === b;
		case "!=":
			return a !== b;
		case ">":
			return numbers ? na > nb : a > b;
		case "<":
			return numbers ? na < nb : a < b;
		case ">=":
			return numbers ? na >= nb : a >= b;
		case "<=":
			return numbers ? na <= nb : a <= b;
	}
	return false;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Runs a block's query over the cave. `here` is the note the block is in. */
export function runQuery(spec: Spec, texts: Map<string, string>, resolve: (t: string) => string | null, here: string): Row[] {
	const notes = [...texts.keys()].filter((p) => p !== here && !p.startsWith("Templates/") && inFolders(p, spec.from));
	let rows: Row[] = [];
	if (spec.list === "habits") return rows; // Drawn as a tracker (editor/liveBlocks.ts).
	if (spec.list === "tags") {
		const counts = new Map<string, number>();
		for (const p of notes) for (const t of tagsIn(texts.get(p) ?? "")) counts.set(t, (counts.get(t) ?? 0) + 1);
		rows = [...counts].map(([tag, count]) => ({ path: "", title: `#${tag}`, folder: "", props: {}, tags: [tag], count }));
		rows.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
	} else if (spec.list === "tasks") {
		const today = iso(new Date());
		const week = iso(new Date(Date.now() + 7 * 86_400_000));
		for (const p of notes) {
			const text = texts.get(p) ?? "";
			const meta = propsOf(text);
			if (spec.tag && !meta.tags.includes(spec.tag)) continue;
			text.split("\n").forEach((line, n) => {
				const t = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
				if (!t) return;
				const done = t[1] !== " ";
				if (spec.done !== "any" && done !== (spec.done === "true")) return;
				const due = /(?:due:|📅\s*|@)(\d{4}-\d{2}-\d{2})/.exec(t[2])?.[1];
				if (spec.due === "today" && due !== today) return;
				if (spec.due === "overdue" && !(due && due < today)) return;
				if (spec.due === "week" && !(due && due >= today && due <= week)) return;
				if (spec.due === "any" && !due) return;
				const title = t[2].replace(/(?:due:|📅\s*|@)\d{4}-\d{2}-\d{2}/, "").trim();
				if (spec.search && !title.toLowerCase().includes(spec.search)) return;
				rows.push({ path: p, title, folder: p.split("/").slice(0, -1).join("/"), props: meta.props, tags: meta.tags, task: { done, due, line: n } });
			});
		}
		// Board cards with a due date count as tasks too.
		for (const a of agenda(texts)) {
			if (a.kind !== "card" || !inFolders(a.path, spec.from) || a.path === here) continue;
			if (spec.done !== "any" && !!a.done !== (spec.done === "true")) continue;
			if (spec.due === "today" && a.date !== today) continue;
			if (spec.due === "overdue" && !(a.date < today)) continue;
			if (spec.due === "week" && !(a.date >= today && a.date <= week)) continue;
			rows.push({ path: a.path, title: a.title, folder: a.path.split("/").slice(0, -1).join("/"), props: {}, tags: [], task: { done: !!a.done, due: a.date, line: -1 } });
		}
	} else {
		const target = spec.list === "backlinks" ? (spec.to ? resolve(spec.to) : here) : null;
		for (const p of notes) {
			const text = texts.get(p) ?? "";
			if (target && !linksIn(text).some((l) => resolve(l) === target)) continue;
			const meta = propsOf(text);
			if (spec.tag && !meta.tags.includes(spec.tag)) continue;
			if (spec.search && !text.toLowerCase().includes(spec.search) && !noteTitle(p).toLowerCase().includes(spec.search)) continue;
			if (!spec.where.every((w) => matches(w.key === "name" ? noteTitle(p) : meta.props[w.key], w.op, w.value))) continue;
			rows.push({ path: p, title: noteTitle(p), folder: p.split("/").slice(0, -1).join("/"), ...meta });
		}
	}
	// Sorting: by name unless told otherwise; a leading - reverses.
	const by = spec.sort.replace(/^-/, "").toLowerCase() || (spec.list === "tasks" ? "due" : spec.list === "tags" ? "" : "name");
	const flip = spec.sort.startsWith("-") ? -1 : 1;
	if (by) {
		const key = (r: Row) => (by === "name" ? r.title.toLowerCase() : by === "due" ? (r.task?.due ?? "9999") : by === "folder" ? r.folder.toLowerCase() : (r.props[by] ?? "").toLowerCase());
		rows.sort((a, b) => key(a).localeCompare(key(b), undefined, { numeric: true }) * flip);
	}
	return rows.slice(0, spec.limit);
}
