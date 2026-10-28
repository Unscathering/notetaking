// Reading a note's details: the properties block at the top (description,
// tags, banner and anything else) and the #tags in its text.

export interface NoteProps {
	description?: string;
	tags: string[];
	banner?: string;
	/** Everything else in the properties block, as written. */
	other: Record<string, string>;
}

/** The `---` block at the very top of a note, if there is one. */
export function frontmatterRange(text: string): { from: number; to: number; body: string } | null {
	if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return null;
	const end = text.indexOf("\n---", 3);
	if (end < 0) return null;
	const close = text.indexOf("\n", end + 4);
	return { from: 0, to: close < 0 ? text.length : close + 1, body: text.slice(text.indexOf("\n") + 1, end) };
}

const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, "");

/** A small reader for the simple properties notes use (key: value, and lists). */
export function readProps(text: string): NoteProps {
	const props: NoteProps = { tags: [], other: {} };
	const fm = frontmatterRange(text);
	if (fm) {
		let listKey: string | null = null;
		for (const line of fm.body.split(/\r?\n/)) {
			const item = /^\s*-\s+(.*)$/.exec(line);
			if (item && listKey) {
				if (listKey === "tags") props.tags.push(unquote(item[1]).replace(/^#/, ""));
				continue;
			}
			const kv = /^([\w-]+):\s*(.*)$/.exec(line);
			if (!kv) continue;
			const [, key, raw] = kv;
			listKey = raw.trim() === "" ? key : null;
			if (key === "tags") {
				const list = raw.trim().replace(/^\[|\]$/g, "");
				if (list) props.tags.push(...list.split(",").map((t) => unquote(t).replace(/^#/, "")).filter(Boolean));
			} else if (key === "description") props.description = unquote(raw);
			else if (key === "banner") props.banner = unquote(raw);
			else props.other[key] = unquote(raw);
		}
	}
	// #tags written in the text itself (not inside code or links).
	const body = fm ? text.slice(fm.to) : text;
	for (const m of body.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "").matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) {
		if (!/^\d+$/.test(m[1])) props.tags.push(m[1]);
	}
	props.tags = [...new Set(props.tags.map((t) => t.toLowerCase()))];
	return props;
}

/** Writes properties back into a note's text, keeping the rest as it was. */
export function writeProps(text: string, props: NoteProps): string {
	const fm = frontmatterRange(text);
	const body = fm ? text.slice(fm.to) : text;
	const lines: string[] = [];
	if (props.description) lines.push(`description: ${props.description}`);
	const fmTags = props.tags.filter((t) => !new RegExp(`(?:^|\\s)#${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i").test(body));
	if (fmTags.length) lines.push(`tags: [${fmTags.join(", ")}]`);
	if (props.banner) lines.push(`banner: ${props.banner}`);
	for (const [k, v] of Object.entries(props.other)) lines.push(`${k}: ${v}`);
	if (!lines.length) return body;
	return `---\n${lines.join("\n")}\n---\n${body}`;
}

export interface SearchHit {
	path: string;
	/** Short pieces of the note around each match, with the match marked. */
	snippets: Array<{ before: string; match: string; after: string; line: number }>;
	score: number;
}

/** Finds every note containing all the words of the query; titles count most. */
export function searchNotes(texts: Map<string, string>, query: string, title: (p: string) => string): SearchHit[] {
	const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
	if (!words.length) return [];
	const hits: SearchHit[] = [];
	for (const [path, text] of texts) {
		const lower = text.toLowerCase(), name = title(path).toLowerCase();
		if (!words.every((w) => lower.includes(w) || name.includes(w))) continue;
		let score = words.reduce((s, w) => s + (name.includes(w) ? 10 : 0), 0);
		const snippets: SearchHit["snippets"] = [];
		const lines = text.split("\n");
		for (let n = 0; n < lines.length && snippets.length < 3; n++) {
			const l = lines[n].toLowerCase();
			const w = words.find((w) => l.includes(w));
			if (!w) continue;
			const at = l.indexOf(w);
			const start = Math.max(0, at - 40);
			snippets.push({
				before: (start > 0 ? "…" : "") + lines[n].slice(start, at),
				match: lines[n].slice(at, at + w.length),
				after: lines[n].slice(at + w.length, at + w.length + 70),
				line: n,
			});
			score += 1;
		}
		hits.push({ path, snippets, score });
	}
	return hits.sort((a, b) => b.score - a.score);
}
