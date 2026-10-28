// The weekly recap: the AI reads a week's daily notes and what was due, and
// drafts a review of it into Daily/<year>-W<week> recap.md. The note opens
// straight away and fills in as the AI writes; it's an ordinary note after.
import { agenda } from "./agenda";
import { joinPath, noteTitle } from "./cave";
import { stream } from "./ai/engine.svelte";
import { helperReady } from "./ai/writer";
import { DAILY_FOLDER, dateName } from "./templates";
import { ws } from "./workspace.svelte";

export const recapping = $state({ week: "", error: "" });

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function isoWeek(d: Date) {
	const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)));
	const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
	return { year: t.getUTCFullYear(), week: 1 + Math.round(((t.getTime() - y.getTime()) / 86_400_000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7) };
}

/** Where a week's recap lives. `monday` is the week's first day. */
export function recapPath(monday: Date) {
	const { year, week } = isoWeek(monday);
	return joinPath(DAILY_FOLDER, `${year}-W${String(week).padStart(2, "0")} recap.md`);
}

/** What the AI gets: each day's note and what was due that week. */
function material(monday: Date): string {
	const days = Array.from({ length: 7 }, (_, i) => dateName(addDays(monday, i)));
	const parts: string[] = [];
	for (const day of days) {
		const note = [...ws.texts.keys()].find((p) => noteTitle(p) === day && !p.startsWith("Templates/"));
		if (note) parts.push(`### ${day}\n${(ws.texts.get(note) ?? "").slice(0, 3000)}`);
	}
	const due = agenda(ws.texts).filter((i) => i.kind !== "daily" && days.includes(i.date));
	if (due.length) parts.push(`### Due this week\n${due.map((i) => `- [${i.done ? "x" : " "}] ${i.title} (${i.date}, in ${noteTitle(i.path)})`).join("\n")}`);
	return parts.join("\n\n");
}

/** Opens a week's recap, writing it with the AI first if there isn't one. */
export async function recap(monday: Date) {
	const path = recapPath(monday);
	if (ws.files.includes(path)) return ws.open(path);
	recapping.error = "";
	if (!helperReady()) {
		recapping.error = "The weekly recap needs the AI. Set it up in the AI panel (Ctrl+J) first.";
		return;
	}
	const stuff = material(monday);
	if (!stuff.trim()) {
		recapping.error = "There are no daily notes or due dates that week to write about.";
		return;
	}
	const start = dateName(monday), end = dateName(addDays(monday, 6));
	const head = `# Week ${isoWeek(monday).week} recap\n${start} to ${end}\n\n`;
	recapping.week = start;
	try {
		await ws.writeNote(path, `${head}_Writing…_\n`, false);
		await ws.open(path);
		let text = "", shown = 0;
		await stream(
			{
				messages: [
					{
						role: "system",
						content:
							"You write a short, warm weekly review for the person whose notes these are, in Markdown, addressed to them as \"you\". Use only what their notes say; never invent events. Sections: \"## Highlights\" (2 to 4 bullets), \"## What you got done\", \"## Still open\" (unfinished tasks, as - [ ] checklist items), \"## Patterns\" (moods, habits or themes you notice, gently, only if the notes show them), \"## For next week\" (2 or 3 suggestions). Link to days as [[YYYY-MM-DD]]. Under 350 words. Reply with only the review, no title.",
					},
					{ role: "user", content: `The week of ${start} to ${end}:\n\n${stuff}` },
				],
				temperature: 0.4,
				effort: "low",
			},
			(d) => {
				text += (d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "";
				// Show it filling in, a few times a second.
				if (text.length - shown > 60) {
					shown = text.length;
					void ws.writeNote(path, `${head}${text}\n`, false);
				}
			}
		);
		await ws.writeNote(path, `${head}${text.trim()}\n`, false);
		for (const h of ws.hooks.saved) h(path, `${head}${text.trim()}\n`);
	} catch (e) {
		recapping.error = e instanceof Error ? e.message : String(e);
	} finally {
		recapping.week = "";
	}
}
