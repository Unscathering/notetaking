// Basalt's manual, for the AI to look things up in (the basalt_help tool):
// MODDING.md, split into its sections. Small models don't know Basalt's live
// block keys or CSS classes by heart; reading the right section first makes
// what they write work much more often.
import MODDING from "../../../MODDING.md?raw";

interface Section {
	title: string;
	text: string;
}

function split(md: string): Section[] {
	const out: Section[] = [];
	let title = "Modding Basalt";
	let lines: string[] = [];
	const flush = () => lines.join("\n").trim() && out.push({ title, text: lines.join("\n").trim() });
	for (const line of md.split("\n")) {
		const h = /^#{2,3}\s+(.*)$/.exec(line);
		if (h) {
			flush();
			title = h[1].trim();
			lines = [];
		} else lines.push(line);
	}
	flush();
	return out;
}

const SECTIONS = split(MODDING);

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Every section's title, so the AI knows what it can ask about. */
export const TOPICS = SECTIONS.map((s) => s.title);

/** The sections that best match a question, as text for the AI. */
export function lookUp(question: string): string {
	const want = new Set(words(question).filter((w) => w.length > 2));
	const scored = SECTIONS.map((s) => {
		let score = 0;
		for (const w of words(s.title)) if (want.has(w)) score += 4;
		for (const w of words(s.text)) if (want.has(w)) score += 1;
		return { s, score };
	})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score)
		.slice(0, 2);
	if (!scored.length) return `Nothing about that. Topics: ${TOPICS.join(", ")}.`;
	return scored.map(({ s }) => `## ${s.title}\n${s.text}`).join("\n\n").slice(0, 3500);
}
