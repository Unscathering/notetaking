// Everything in the cave that has a date: daily notes, board cards with a due
// date, and checklist items with one (written `due:2026-11-02`, `📅 2026-11-02`
// or `@2026-11-02`). The calendar shows these on their days.
import { isBoardText, parseBoard } from "./board";
import { noteTitle } from "./cave";

export interface Dated {
	/** YYYY-MM-DD */
	date: string;
	kind: "daily" | "card" | "task";
	title: string;
	path: string;
	done?: boolean;
}

const DATE = /(?:due:|📅\s*|@)(\d{4}-\d{2}-\d{2})/;

export function agenda(texts: Map<string, string>): Dated[] {
	const out: Dated[] = [];
	for (const [path, text] of texts) {
		if (path.startsWith("Templates/")) continue;
		const name = noteTitle(path);
		if (/^\d{4}-\d{2}-\d{2}$/.test(name)) out.push({ date: name, kind: "daily", title: name, path });
		if (isBoardText(text)) {
			for (const col of parseBoard(text).columns) for (const card of col.cards) if (card.due) out.push({ date: card.due, kind: "card", title: card.title, path, done: card.done });
			continue;
		}
		for (const line of text.split("\n")) {
			const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
			const when = task && DATE.exec(task[2]);
			if (task && when) out.push({ date: when[1], kind: "task", title: task[2].replace(DATE, "").trim(), path, done: task[1] !== " " });
		}
	}
	return out;
}
