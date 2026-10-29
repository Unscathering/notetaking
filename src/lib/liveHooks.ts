// What a note's live parts (```basalt blocks and ![[embeds]]) need from the cave.
import type { LiveHooks } from "./editor/liveBlocks";
import { frontmatterRange } from "./notes";
import { parseSpec, runQuery } from "./query";
import { ws } from "./workspace.svelte";
import { habitDays, habitList } from "./habits";
import { openDay } from "./templates";
import { focus, pauseFocus, startFocus, stopFocus } from "./focus.svelte";
import { noteTitle } from "./cave";

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

/** `where` gives the note's path now (it changes when the note is renamed). */
export function liveHooksFor(where: string | (() => string)): LiveHooks {
	const at = typeof where === "string" ? () => where : where;
	return {
		runBlock(source) {
			const spec = parseSpec(source);
			return { spec, rows: runQuery(spec, ws.texts, (t) => ws.resolve(t), at()) };
		},
		embed(target) {
			const [name, heading] = target.split("#");
			const path = ws.resolve(name);
			if (!path || path === at()) return null;
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
		noteNames: () => ws.notes.filter((p) => p !== at()).map((p) => p.split("/").pop()!.replace(/\.md$/i, "")),
		folder: () => at().split("/").slice(0, -1).join("/"),
		habits: (days) => ({ list: habitList(ws.texts), days: habitDays(ws.texts, days) }),
		openDay: (date) => void openDay(new Date(`${date}T12:00:00`)),
		openTarget(name) {
			const want = name.trim().replace(/^\/+|\/+$/g, "").toLowerCase();
			const folder = ws.folders.find((f) => f.toLowerCase() === want) ?? ws.folders.find((f) => f.split("/").pop()!.toLowerCase() === want);
			if (folder) {
				const last = folder.split("/").pop()!;
				// The folder's dashboard, or a note named like it, or the whole folder as a table.
				const inside = [`${folder}/${last} dashboard.md`, `${folder}/${last}.md`, `${folder}/Home.md`].find((p) => ws.files.includes(p));
				return void ws.open(inside ?? `basalt:db:${folder}`);
			}
			void ws.follow(name);
		},
		imageUrl: (src) => ws.cave?.fileUrl(src) ?? Promise.resolve(null),
		run: (command) => void import("./commands").then((m) => m.COMMANDS.find((c) => c.id === command)?.run()),
		stats() {
			let open = 0, done = 0;
			for (const [p, t] of ws.texts) {
				if (p.startsWith("Templates/")) continue;
				for (const m of t.matchAll(/^\s*[-*+]\s+\[([ xX])\]/gm)) m[1] === " " ? open++ : done++;
			}
			return { notes: ws.files.filter((f) => !f.startsWith("Templates/")).length, open, done };
		},
		dailyDates: () => new Set(ws.files.map((f) => noteTitle(f)).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t))),
		timer: {
			state: () => ({ phase: focus.phase, left: focus.left, paused: !!focus.paused, minutes: focus.minutes, count: focus.count }),
			start: (minutes) => startFocus(minutes),
			pause: () => pauseFocus(),
			stop: () => stopFocus(),
		},
		async capture(note, text) {
			if (!ws.cave) return;
			const stamp = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
			const path = ws.resolve(note);
			if (path) {
				const old = ws.texts.get(path) ?? (await ws.cave.read(path));
				await ws.writeNote(path, `${old.replace(/\s+$/, "")}\n\n## ${stamp}\n\n${text}\n`);
			} else {
				const name = note.split("/").pop()!;
				await ws.cave.create(note.split("/").slice(0, -1).join("/"), name, `# ${name}\n\n## ${stamp}\n\n${text}\n`);
				await ws.refresh();
			}
		},
	};
}
