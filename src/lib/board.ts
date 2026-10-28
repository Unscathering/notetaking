// Boards (like Trello) are ordinary Markdown notes, so they stay readable
// anywhere:
//
//   ---
//   basalt: board
//   ---
//   ## To do
//   - [ ] Paint the fence #home color:green due:2026-11-02
//     Description lines are indented under the card.
//     - [ ] Checklist items too
//
// Columns are `##` headings and cards are task lines under them.
import { frontmatterRange } from "./notes";

export const CARD_COLORS: Record<string, string> = {
	red: "#e05d5d",
	orange: "#e8794a",
	yellow: "#e5b84b",
	green: "#5fb878",
	teal: "#3fb5a8",
	blue: "#4f93e8",
	purple: "#9b7cf0",
	pink: "#e46fa8",
	gray: "#8d939b",
};

export interface CheckItem {
	text: string;
	done: boolean;
}

export interface Card {
	/** Stable while the card keeps its title, so moves animate smoothly. */
	id: string;
	title: string;
	done: boolean;
	tags: string[];
	color?: string;
	due?: string;
	description: string;
	checklist: CheckItem[];
}

export interface Column {
	id: string;
	name: string;
	cards: Card[];
}

export interface Board {
	/** Everything before the first column (the properties block and any notes). */
	head: string;
	columns: Column[];
}

export const isBoardText = (text: string) => {
	const fm = frontmatterRange(text);
	return !!fm && /^basalt:\s*board\s*$/m.test(fm.body);
};

const CARD = /^[-*+] \[( |x|X)\] (.*)$/;
const CHECK = /^\s{2,}[-*+] \[( |x|X)\] (.*)$/;

function parseCardLine(text: string): Pick<Card, "title" | "tags" | "color" | "due"> {
	let rest = text;
	const tags: string[] = [];
	let color: string | undefined, due: string | undefined;
	rest = rest.replace(/(?:^|\s)color:(\w+)/g, (_, c: string) => ((color = c.toLowerCase()), ""));
	rest = rest.replace(/(?:^|\s)due:(\d{4}-\d{2}-\d{2})/g, (_, d: string) => ((due = d), ""));
	rest = rest.replace(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu, (_, t: string) => (tags.push(t.toLowerCase()), ""));
	return { title: rest.trim(), tags, color, due };
}

export function parseBoard(text: string): Board {
	const fm = frontmatterRange(text);
	const lines = text.slice(fm ? fm.to : 0).split("\n");
	const firstColumn = lines.findIndex((l) => /^##\s/.test(l));
	const head = text.slice(0, fm ? fm.to : 0) + (firstColumn > 0 ? lines.slice(0, firstColumn).join("\n") + "\n" : firstColumn < 0 ? lines.join("\n") : "");
	const columns: Column[] = [];
	const seen = new Map<string, number>();
	const uid = (prefix: string, name: string) => {
		const key = `${prefix}:${name}`;
		const n = (seen.get(key) ?? 0) + 1;
		seen.set(key, n);
		return `${key}#${n}`;
	};
	let card: Card | null = null;
	for (const line of firstColumn < 0 ? [] : lines.slice(firstColumn)) {
		const heading = /^##\s+(.*)$/.exec(line);
		if (heading) {
			columns.push({ id: uid("col", heading[1].trim()), name: heading[1].trim(), cards: [] });
			card = null;
			continue;
		}
		const col = columns[columns.length - 1];
		const c = CARD.exec(line);
		if (c && col) {
			const parsed = parseCardLine(c[2]);
			card = { id: uid("card", parsed.title), done: c[1] !== " ", description: "", checklist: [], ...parsed };
			col.cards.push(card);
			continue;
		}
		const check = CHECK.exec(line);
		if (check && card) {
			card.checklist.push({ text: check[2].trim(), done: check[1] !== " " });
			continue;
		}
		if (card && /^\s{2,}\S/.test(line)) {
			card.description += (card.description ? "\n" : "") + line.replace(/^\s{2}/, "");
		}
	}
	return { head, columns };
}

export function serializeBoard(board: Board): string {
	const out: string[] = [];
	for (const col of board.columns) {
		out.push(`## ${col.name}`, "");
		for (const card of col.cards) {
			const bits = [card.title.trim() || "Untitled card", ...card.tags.map((t) => `#${t}`)];
			if (card.color) bits.push(`color:${card.color}`);
			if (card.due) bits.push(`due:${card.due}`);
			out.push(`- [${card.done ? "x" : " "}] ${bits.join(" ")}`);
			for (const l of card.description.split("\n")) if (l.trim()) out.push(`  ${l}`);
			for (const item of card.checklist) out.push(`  - [${item.done ? "x" : " "}] ${item.text}`);
		}
		out.push("");
	}
	// Exactly one blank line between the head and the first list, however often it is saved.
	const head = board.head.replace(/\s+$/, "");
	const body = `${out.join("\n").trimEnd()}\n`;
	return head ? `${head}\n\n${body}` : body;
}

export const newBoardText = (columns = ["To do", "Doing", "Done"]) =>
	`---\nbasalt: board\n---\n\n${columns.map((c) => `## ${c}\n`).join("\n")}`;

export const blankCard = (title: string): Card => ({ id: `new:${title}:${Math.random()}`, title, done: false, tags: [], description: "", checklist: [] });
