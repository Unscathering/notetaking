// Changes to a ```basalt block's text, for organizing a dashboard by hand: pin,
// hide and order notes, pick notes, and move, add or remove the cards of a
// block laid out in columns. Each takes the block's lines (without the ```
// fences) and gives back new ones, so the note stays plain text.

const SEP_COLUMN = /^\s*==\s*$/;
const SEP_CARD = /^\s*--\s*$/;

/** Where each card's lines are: [start, end) indexes, in reading order (column by column). */
export function cards(lines: string[]): Array<{ start: number; end: number; column: number }> {
	if (!lines.some((l) => SEP_COLUMN.test(l))) return [{ start: 0, end: lines.length, column: 0 }];
	const out: Array<{ start: number; end: number; column: number }> = [];
	let column = -1, start = -1;
	const close = (end: number) => {
		if (start >= 0 && lines.slice(start, end).some((l) => l.trim())) out.push({ start, end, column });
	};
	lines.forEach((l, i) => {
		if (SEP_COLUMN.test(l)) {
			close(i);
			column++;
			start = i + 1;
		} else if (SEP_CARD.test(l) && column >= 0) {
			close(i);
			start = i + 1;
		}
	});
	close(lines.length);
	return out;
}

/** Changes one card's lines. */
export function editCard(lines: string[], card: number, fn: (card: string[]) => string[]): string[] {
	const c = cards(lines)[card];
	if (!c) return lines;
	return [...lines.slice(0, c.start), ...fn(lines.slice(c.start, c.end)), ...lines.slice(c.end)];
}

const keyIs = (key: string) => new RegExp(`^\\s*${key}\\s*:`, "i");
const valueOf = (line: string) => line.slice(line.indexOf(":") + 1).trim();
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Puts `key: value` lines right after the last line with that key, or at the end. */
function addLines(card: string[], key: string, values: string[]): string[] {
	let at = -1;
	card.forEach((l, i) => keyIs(key).test(l) && (at = i));
	if (at < 0) {
		// Before trailing blank lines.
		at = card.length - 1;
		while (at >= 0 && !card[at].trim()) at--;
	}
	return [...card.slice(0, at + 1), ...values.map((v) => `${key}: ${v}`), ...card.slice(at + 1)];
}

const without = (card: string[], key: string, name?: string) => card.filter((l) => !(keyIs(key).test(l) && (name == null || same(valueOf(l), name))));

export const pin = (card: string[], name: string) => addLines(without(card, "pin", name), "pin", [name]);
export const unpin = (card: string[], name: string) => without(card, "pin", name);
export const hide = (card: string[], name: string) => addLines(without(card, "pin", name), "hide", [name]);
export const showHidden = (card: string[]) => without(card, "hide");
export const addNote = (card: string[], name: string) => (card.some((l) => keyIs("note").test(l) && same(valueOf(l), name)) ? card : addLines(card, "note", [name]));
export const removeNote = (card: string[], name: string) => without(card, "note", name);
/** The whole list in this order (by pinning each). */
export const order = (card: string[], names: string[]) => addLines(without(card, "pin"), "pin", names);

/** Rebuilds a columns block from its parts. */
function build(head: string[], columns: string[][][]): string[] {
	const out = [...head];
	for (const col of columns) {
		out.push("==");
		col.forEach((card, i) => {
			if (i) out.push("--");
			out.push(...card);
		});
	}
	return out;
}

function trimBlank(lines: string[]) {
	let a = 0, b = lines.length;
	while (a < b && !lines[a].trim()) a++;
	while (b > a && !lines[b - 1].trim()) b--;
	return lines.slice(a, b);
}

/** The parts of a columns block: the lines before the first ==, and each column's cards. */
function parts(lines: string[]) {
	const list = cards(lines);
	const first = lines.findIndex((l) => SEP_COLUMN.test(l));
	const head = lines.slice(0, first);
	const count = lines.filter((l) => SEP_COLUMN.test(l)).length;
	const columns: string[][][] = Array.from({ length: count }, () => []);
	for (const c of list) columns[c.column].push(trimBlank(lines.slice(c.start, c.end)));
	const where = (card: number) => {
		let n = 0;
		for (let col = 0; col < columns.length; col++)
			for (let i = 0; i < columns[col].length; i++) if (n++ === card) return { col, i };
		return null;
	};
	return { head, columns, where };
}

/** Moves a card: up or down in its column, or to the end of the next column left or right. */
export function moveCard(lines: string[], card: number, dir: "up" | "down" | "left" | "right"): string[] {
	if (!lines.some((l) => SEP_COLUMN.test(l))) return lines;
	const { head, columns, where } = parts(lines);
	const at = where(card);
	if (!at) return lines;
	const col = columns[at.col];
	if (dir === "up" || dir === "down") {
		const to = at.i + (dir === "up" ? -1 : 1);
		if (to < 0 || to >= col.length) return lines;
		[col[at.i], col[to]] = [col[to], col[at.i]];
	} else {
		const to = at.col + (dir === "left" ? -1 : 1);
		if (to < 0 || to >= columns.length) return lines;
		columns[to].push(...col.splice(at.i, 1));
	}
	return build(head, columns);
}

export function removeCard(lines: string[], card: number): string[] {
	if (!lines.some((l) => SEP_COLUMN.test(l))) return [];
	const { head, columns, where } = parts(lines);
	const at = where(card);
	if (!at) return lines;
	columns[at.col].splice(at.i, 1);
	return build(head, columns);
}

/** Adds a card under another one, in the same column. */
export function addCard(lines: string[], card: number, add: string[]): string[] {
	if (!lines.some((l) => SEP_COLUMN.test(l))) return lines;
	const { head, columns, where } = parts(lines);
	const at = where(card);
	if (!at) return lines;
	columns[at.col].splice(at.i + 1, 0, add);
	return build(head, columns);
}

/** Pieces to add to a dashboard, as block lines. `folder` is where the dashboard is. */
export const PIECES: Array<{ name: string; icon: string; lines: (folder: string) => string[] }> = [
	{ name: "Notes I pick", icon: "pin", lines: () => ["title: Pinned", "list: picked"] },
	{ name: "Notes in a folder", icon: "folder", lines: (f) => ["title: Notes", ...(f ? [`from: ${f}`] : []), "show: cards", "limit: 8"] },
	{ name: "Open tasks", icon: "check", lines: (f) => ["title: Open tasks", "list: tasks", ...(f ? [`from: ${f}`] : [])] },
	{ name: "Due this week", icon: "calendar", lines: (f) => ["title: Due this week", "list: tasks", "due: week", ...(f ? [`from: ${f}`] : [])] },
	{ name: "Tags", icon: "tag", lines: (f) => ["title: Tags", "list: tags", ...(f ? [`from: ${f}`] : []), "limit: 12"] },
	{ name: "Tiles", icon: "layout", lines: () => ["title: Collection", "list: tiles", "tile: Ideas | 💡"] },
	{ name: "Today's goal", icon: "focus", lines: () => ["title: Today's goal", "list: goal", "text: What matters today?"] },
	{ name: "Calendar", icon: "calendar", lines: () => ["title: Calendar", "list: calendar"] },
	{ name: "Focus timer", icon: "clock", lines: () => ["title: Focus", "list: timer", "text: 25"] },
	{ name: "Quick capture", icon: "pencil", lines: (f) => ["title: Quick capture", "list: capture", `to: ${f ? `${f}/Inbox` : "Inbox"}`] },
	{ name: "Habits", icon: "check", lines: () => ["title: Habits", "list: habits", "days: 14"] },
	{ name: "Quick actions", icon: "zap", lines: () => ["title: Actions", "list: actions"] },
	{ name: "Counts", icon: "graph", lines: () => ["title: Stats", "list: stats"] },
];
