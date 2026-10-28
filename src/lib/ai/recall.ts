// Finding the notes that matter for a question, so the AI answers from your
// notes instead of guessing. Ranks notes by the question's words (rare words
// count more, a word in the title counts more still), and takes the lines
// around the matches. Runs on this computer, in an instant.

const STOP = new Set(
	"a an and are as at be but by can did do does for from had has have how i if in into is it its me my of on or our so than that the their them then there these they this to was we were what when where which who why will with would you your about after again all also am any because been before being both could each few more most much no nor not now only other out over own same she should some such too under until up very just like get got make made want know think".split(" ")
);

/** The words of `text` worth searching for, cut to a rough stem ("plans" → "plan"). */
export function terms(text: string): string[] {
	const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	return [...new Set(words.filter((w) => w.length > 2 && !STOP.has(w)).map(stem))];
}

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1") || w;

export interface Found {
	path: string;
	score: number;
	/** The lines around the matches. */
	excerpt: string;
}

/**
 * The notes that best match `question`, best first. Notes inside `prefer`
 * (a project's folder) get a head start.
 */
export function recall(texts: Map<string, string>, question: string, title: (p: string) => string, limit = 3, prefer = ""): Found[] {
	const want = terms(question);
	if (!want.length) return [];
	// How many notes each word appears in: a word in every note says little.
	const docs = [...texts].map(([path, text]) => ({ path, text, lower: text.toLowerCase(), name: title(path).toLowerCase() }));
	const weight = new Map(want.map((w) => [w, Math.log(1 + docs.length / (1 + docs.filter((d) => d.lower.includes(w)).length))]));
	const out: Found[] = [];
	for (const d of docs) {
		let score = 0;
		for (const w of want) {
			const count = d.lower.split(w).length - 1;
			if (count) score += weight.get(w)! * (1 + Math.log(count));
			if (d.name.includes(w)) score += weight.get(w)! * 3;
		}
		if (score <= 0) continue;
		if (prefer && (d.path === prefer || d.path.startsWith(`${prefer}/`))) score *= 1.5;
		out.push({ path: d.path, score, excerpt: excerpt(d.text, want) });
	}
	return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** The lines that mention the words, with a line either side, up to about 700 characters. */
function excerpt(text: string, want: string[]): string {
	const lines = text.split("\n");
	const keep = new Set<number>();
	lines.forEach((l, i) => {
		const lower = l.toLowerCase();
		if (want.some((w) => lower.includes(w))) for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < lines.length) keep.add(j);
	});
	let out = "", last = -2;
	for (const i of [...keep].sort((a, b) => a - b)) {
		if (!lines[i].trim()) continue;
		const piece = (i > last + 1 && out ? "…\n" : "") + lines[i] + "\n";
		if (out.length + piece.length > 700) break;
		out += piece;
		last = i;
	}
	return out.trim() || text.slice(0, 400);
}
