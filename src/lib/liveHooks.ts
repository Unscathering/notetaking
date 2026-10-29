// What a note's live parts (```basalt blocks and ![[embeds]]) need from the cave.
import type { LiveHooks } from "./editor/liveBlocks";
import { frontmatterRange } from "./notes";
import { parseSpec, runQuery } from "./query";
import { ws } from "./workspace.svelte";
import { habitDays, habitList } from "./habits";
import { openDay } from "./templates";

/** The part of a note under one heading, down to the next heading as big or bigger. */
function section(text: string, heading: string): string | null {
	const lines = text.split("\n");
	const want = heading.trim().toLowerCase();
	const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#+\s*/, "").trim().toLowerCase() === want);
	if (start < 0) return null;
	const level = lines[start].match(/^#+/)![0].length;
	let end = start + 1;
	while (end < lines.length && !(/^#{1,6}\s/.test(lines[end]) && lines[end].match(/^#+/)![0].length <= level)) end++;
	return lines.slice(start, end).join("\n");
}

export function liveHooksFor(here: string): LiveHooks {
	return {
		runBlock(source) {
			const spec = parseSpec(source);
			return { spec, rows: runQuery(spec, ws.texts, (t) => ws.resolve(t), here) };
		},
		embed(target) {
			const [name, heading] = target.split("#");
			const path = ws.resolve(name);
			if (!path || path === here) return null;
			let text = ws.texts.get(path) ?? "";
			const fm = frontmatterRange(text);
			if (fm) text = text.slice(fm.to);
			if (heading) text = section(text, heading) ?? `(No heading called “${heading}” in this note.)`;
			return { path, text: text.trim().slice(0, 6000) };
		},
		open: (path) => void ws.open(path),
		async toggleTask(path, line) {
			const lines = (ws.texts.get(path) ?? "").split("\n");
			const m = /^(\s*[-*+]\s+\[)([ xX])(\].*)$/.exec(lines[line] ?? "");
			if (!m) return;
			lines[line] = `${m[1]}${m[2] === " " ? "x" : " "}${m[3]}`;
			await ws.writeNote(path, lines.join("\n"));
		},
		folderColor: (folder) => ws.meta.looks[folder]?.color,
		habits: (days) => ({ list: habitList(ws.texts), days: habitDays(ws.texts, days) }),
		openDay: (date) => void openDay(new Date(`${date}T12:00:00`)),
	};
}
