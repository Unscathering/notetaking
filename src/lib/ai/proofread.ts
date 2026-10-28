// Writing help: three ways to improve text, from strictest to freest.
//
// - grammar: only spelling, grammar, punctuation and capitals. The writer's
//   words stay theirs: anything bigger than a small fix is thrown out here in
//   code, whatever the AI sends back.
// - fix: also smooths what's inconsistent or awkward (tense, names, clumsy
//   bits), changing as little as possible.
// - rewrite: says it again in the AI's own words.
//
// Grammar and fix come back as small suggestions (like Grammarly's
// underlines); a rewrite comes back as one new version to take or leave.

export type Mode = "grammar" | "fix" | "rewrite";

export const MODES: Record<Mode, { name: string; about: string; working: string }> = {
	grammar: { name: "Grammar", about: "Only fixes spelling, grammar and punctuation. Your words stay yours.", working: "Proofreading" },
	fix: { name: "Fix", about: "Smooths inconsistent or awkward bits, keeping your voice.", working: "Smoothing things out" },
	rewrite: { name: "Rewrite", about: "Says it again in new words.", working: "Rewriting" },
};

const RULES: Record<Mode, string> = {
	grammar: `You are a strict proofreader. Correct ONLY spelling, grammar, punctuation and capitalization mistakes.
Never change word choice, tone, style, meaning or sentence structure. Never add or remove sentences. Never rephrase.
If a line has no mistakes, give it back exactly as it was.`,
	fix: `You are a careful editor. Fix spelling and grammar, and smooth out what's inconsistent or awkward: mixed tenses, a name or term written different ways, clumsy or unclear phrasing, repeated words.
Keep the writer's own voice, words and meaning. Change as little as possible. Don't add new ideas.`,
	rewrite: `Rewrite the text in your own words so it reads clearly and naturally, keeping its meaning, every fact, every [[link]], #tag and its Markdown formatting.`,
};

/** The messages for the engine. Lines are kept apart so each comes back in its place. */
export function request(mode: Mode, lines: string[]) {
	const many = mode !== "rewrite" && lines.length > 1;
	const rules = `${RULES[mode]}
${many ? `The text has ${lines.length} lines. Reply with exactly ${lines.length} lines, in the same order, one for each.` : ""}
Reply with ONLY the text, nothing before or after it: no quotes, no notes, no explanations.`;
	return {
		messages: [
			{ role: "system", content: rules },
			{ role: "user", content: lines.join("\n") },
		],
		temperature: mode === "grammar" ? 0 : mode === "fix" ? 0.2 : 0.7,
		cache_prompt: true,
		// For Claude: a quick job.
		effort: "low" as const,
	};
}

/** Takes off what small models like to wrap their answer in. */
export function clean(answer: string, original: string): string {
	let t = answer.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, "$1");
	t = t.replace(/^(here('s| is)|sure[,!]?)[^\n:]*:\s*\n?/i, "");
	if (/^["“].*["”]$/s.test(t.trim()) && !/^["“]/.test(original.trim())) t = t.trim().slice(1, -1);
	return t.replace(/\s+$/, "");
}

// ---- Comparing old and new, word by word ----

export interface Edit {
	/** Where in the original text. */
	from: number;
	to: number;
	insert: string;
	/** What kind of change, in a word or two. */
	why: string;
}

const pieces = (s: string) => s.match(/[\p{L}\p{N}’']+|\s+|[^\p{L}\p{N}\s]/gu) ?? [];
const isWord = (p: string) => /[\p{L}\p{N}]/u.test(p);
const words = (s: string) => pieces(s).filter(isWord).length;

/** The smallest set of changes that turns `a` into `b`, as ranges of `a`. */
export function diff(a: string, b: string): Edit[] {
	const x = pieces(a), y = pieces(b);
	// Longest common run, the classic way. Lines are short, so this is quick.
	const n = x.length, m = y.length;
	const len: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) len[i][j] = x[i] === y[j] ? len[i + 1][j + 1] + 1 : Math.max(len[i + 1][j], len[i][j + 1]);
	const out: Edit[] = [];
	let i = 0, j = 0, pos = 0;
	let open: { from: number; to: number; insert: string } | null = null;
	const close = () => {
		if (open) out.push({ ...open, why: "" });
		open = null;
	};
	while (i < n || j < m) {
		if (i < n && j < m && x[i] === y[j]) {
			close();
			pos += x[i].length;
			i++, j++;
		} else if (j < m && (i === n || len[i][j + 1] >= len[i + 1][j])) {
			open ??= { from: pos, to: pos, insert: "" };
			open.insert += y[j++];
		} else {
			open ??= { from: pos, to: pos, insert: "" };
			pos += x[i].length;
			open.to = pos;
			i++;
		}
	}
	close();
	// The pieces are whole words, so each change already covers whole words.
	// Changes to spacing alone are dropped: people space things their own way.
	return out
		.filter((e) => a.slice(e.from, e.to).replace(/\s+/g, " ") !== e.insert.replace(/\s+/g, " "))
		.map((e) => ({ ...e, why: kind(a.slice(e.from, e.to), e.insert) }));
}

/** Within `n` letter edits of each other (for telling spelling from new words). */
function near(a: string, b: string, n: number) {
	if (Math.abs(a.length - b.length) > n) return false;
	let prev = Array.from({ length: b.length + 1 }, (_, k) => k);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let k = 1; k <= b.length; k++) row[k] = Math.min(prev[k] + 1, row[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1));
		prev = row;
	}
	return prev[b.length] <= n;
}

function kind(old: string, now: string): string {
	if (old.toLowerCase() === now.toLowerCase()) return "Capitals";
	const letters = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
	if (letters(old) === letters(now)) return "Punctuation";
	if (words(old) === 1 && words(now) === 1 && near(letters(old), letters(now), 2)) return "Spelling";
	return "Grammar";
}

/** Parts of a note that must never be touched: links, code, tags, web addresses. */
const LOCKED = /\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)|`[^`]*`|https?:\/\/\S+|(?<![\p{L}\p{N}])#[\p{L}\p{N}_/-]+/gu;
/** Formatting marks that must stay as they are. */
const MARKS = /[*_~=#|<>[\]()`]/;

/**
 * Keeps only the changes the mode allows. Grammar mode is strict: small
 * changes of at most two words, and if the AI reworded much more than that
 * overall, it rewrote the line instead of proofreading it, so nothing is kept.
 * Links, code, tags and formatting are never changed in any mode.
 */
export function allowed(mode: Mode, original: string, edits: Edit[]): Edit[] {
	const locked = [...original.matchAll(LOCKED)].map((m) => [m.index, m.index + m[0].length]);
	const kept = edits.filter((e) => {
		const old = original.slice(e.from, e.to);
		if (MARKS.test(old) || MARKS.test(e.insert)) return false;
		if (locked.some(([a, b]) => e.from < b && e.to > a)) return false;
		const size = Math.max(words(old), words(e.insert));
		return mode === "grammar" ? size <= 2 : size <= 12;
	});
	// Capitals, punctuation and spelling are always fine; rewording is what's counted.
	const reworded = kept.filter((e) => e.why === "Grammar").reduce((sum, e) => sum + Math.max(words(original.slice(e.from, e.to)), words(e.insert)), 0);
	if (reworded > 2 && reworded / Math.max(1, words(original)) > (mode === "grammar" ? 0.3 : 0.6)) return [];
	return kept;
}

// ---- Which parts of a note are writing ----

export interface Piece {
	/** Where the words start and end in the note (after any "- ", "# ", "> "). */
	from: number;
	to: number;
	text: string;
}

const MARKER = /^(\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*(?:\[![^\]]*\][+-]?\s*)?|#{1,6}\s+))/;

/**
 * The lines of writing in `text` between `from` and `to`, each without its
 * Markdown marker, skipping properties, code, tables and lines that aren't
 * sentences.
 */
export function prose(text: string, from = 0, to = text.length): Piece[] {
	const out: Piece[] = [];
	let at = 0, fence = false, front = text.startsWith("---\n");
	for (const line of text.split("\n")) {
		const start = at, end = at + line.length;
		at = end + 1;
		if (front) {
			if (start > 0 && line.trim() === "---") front = false;
			continue;
		}
		if (/^\s*(```|~~~)/.test(line)) {
			fence = !fence;
			continue;
		}
		if (fence || end < from || start > to || /^\s*\|/.test(line) || /^\s*!\[/.test(line)) continue;
		const lead = line.match(MARKER)?.[0].length ?? 0;
		const a = Math.max(start + lead, from), b = Math.min(end, to);
		const words_ = text.slice(a, b);
		if (b > a && words(words_) >= 2) out.push({ from: a, to: b, text: words_ });
	}
	return out;
}

/** Groups pieces into requests of a sensible size. */
export function batches(list: Piece[], maxChars = 900): Piece[][] {
	const out: Piece[][] = [];
	let cur: Piece[] = [], size = 0;
	for (const p of list) {
		if (cur.length && size + p.text.length > maxChars) {
			out.push(cur);
			cur = [];
			size = 0;
		}
		cur.push(p);
		size += p.text.length;
	}
	if (cur.length) out.push(cur);
	return out;
}
