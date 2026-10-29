// Habits: kept in daily notes, as a checklist under a "Habits" heading.
// Your habits are the checklist in a note called "Habits"; each new daily note
// copies them in (the {{habits}} placeholder of the daily template). A
// ```basalt block with `list: habits` draws them as a tracker: one row per
// habit, one square per day, with streaks.
import { noteTitle } from "./cave";

export interface HabitDay {
	date: string;
	/** The daily note, if there is one that day. */
	path: string | null;
	done: Set<string>;
	/** Habit name → line number in that day's note, to tick it from the tracker. */
	lines: Map<string, number>;
}

/** The habits listed in the "Habits" note, as written. */
export function habitList(texts: Map<string, string>): string[] {
	const note = [...texts.keys()].find((p) => noteTitle(p).toLowerCase() === "habits" && !p.startsWith("Templates/"));
	if (!note) return [];
	return [...(texts.get(note) ?? "").matchAll(/^\s*[-*+]\s+\[[ xX]\]\s+(.+)$/gm)].map((m) => m[1].trim());
}

/** The habits as unticked checklist lines, for a new daily note. */
export const habitLines = (texts: Map<string, string>) =>
	habitList(texts)
		.map((h) => `- [ ] ${h}`)
		.join("\n");

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The last `days` days, oldest first, with which habits were ticked. */
export function habitDays(texts: Map<string, string>, days: number): HabitDay[] {
	const byDate = new Map<string, string>();
	for (const p of texts.keys()) if (/^\d{4}-\d{2}-\d{2}$/.test(noteTitle(p)) && !p.startsWith("Templates/")) byDate.set(noteTitle(p), p);
	const out: HabitDay[] = [];
	const today = new Date();
	for (let i = days - 1; i >= 0; i--) {
		const date = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
		const path = byDate.get(date) ?? null;
		const day: HabitDay = { date, path, done: new Set(), lines: new Map() };
		if (path) {
			let inHabits = false;
			(texts.get(path) ?? "").split("\n").forEach((line, n) => {
				if (/^#{1,6}\s/.test(line)) inHabits = /^#{1,6}\s+habits\b/i.test(line);
				const m = inHabits && /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line);
				if (!m) return;
				const name = m[2].trim();
				day.lines.set(name, n);
				if (m[1] !== " ") day.done.add(name);
			});
		}
		out.push(day);
	}
	return out;
}

/** Days in a row a habit was done, counting back from today (or yesterday, if today isn't ticked yet). */
export function streak(days: HabitDay[], habit: string): number {
	let i = days.length - 1;
	if (i >= 0 && !days[i].done.has(habit)) i--;
	let n = 0;
	for (; i >= 0 && days[i].done.has(habit); i--) n++;
	return n;
}
