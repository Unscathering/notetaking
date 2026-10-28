// Templates and daily notes.
//
// A template is any note in the cave's "Templates" folder, so it's edited like
// any note (boards work too). A few come built in. Placeholders fill in when a
// note is made: {{date}}, {{time}}, {{weekday}}, {{title}}, {{yesterday}} and
// {{tomorrow}} (the last two as links to those days' notes).
//
// Today's note lives in the "Daily" folder, named by date, and is made from
// the "Daily note" template the first time it's opened that day.
import { joinPath, noteTitle } from "./cave";
import { ws } from "./workspace.svelte";

export const TEMPLATE_FOLDER = "Templates";
export const DAILY_FOLDER = "Daily";

export const BUILT_IN: Record<string, string> = {
	"Daily note": `# {{weekday}}, {{date}}

## Plan for today
- [ ]

## Notes


## How did it go?


← [[{{yesterday}}]] · [[{{tomorrow}}]] →
`,
	Meeting: `# {{title}}
{{date}} · {{time}}

**Who:**

## Agenda
-

## Notes


## Decisions


## Next steps
- [ ]
`,
	Project: `# {{title}}

> [!note] Goal
> What does done look like?

## Why it matters


## Steps
- [ ]

## Ideas and links


## Log
- {{date}}: Started.
`,
	"Weekly review": `# Week of {{date}}

## What went well


## What didn't


## What I learned


## Next week
- [ ]
`,
	"Book notes": `---
tags: [book]
---
# {{title}}

**Author:**
**Started:** {{date}}

## In one sentence


## Favourite parts
>

## What I'll do differently

`,
	Board: `---
basalt: board
---

## To do

## Doing

## Done
`,
};

const pad = (n: number) => String(n).padStart(2, "0");
export const dateName = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Fills in a template's placeholders. */
export function fill(text: string, title: string, now = new Date()): string {
	const values: Record<string, string> = {
		date: dateName(now),
		time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
		weekday: now.toLocaleDateString(undefined, { weekday: "long" }),
		title,
		yesterday: dateName(shift(now, -1)),
		tomorrow: dateName(shift(now, 1)),
	};
	return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => values[key.toLowerCase()] ?? all);
}

/** Every template: the cave's own first, then the built-in ones it doesn't replace. */
export function templates(): Array<{ name: string; path?: string; text: () => string }> {
	const mine = ws.files.filter((f) => f.startsWith(`${TEMPLATE_FOLDER}/`)).map((path) => ({ name: noteTitle(path), path, text: () => ws.texts.get(path) ?? "" }));
	const taken = new Set(mine.map((t) => t.name.toLowerCase()));
	const builtIn = Object.entries(BUILT_IN)
		.filter(([name]) => !taken.has(name.toLowerCase()))
		.map(([name, text]) => ({ name, text: () => text }));
	return [...mine, ...builtIn];
}

/** Makes a note from a template, in the folder of the open note. */
export async function fromTemplate(name: string) {
	const t = templates().find((x) => x.name === name);
	if (!t || !ws.cave) return;
	const open = ws.note;
	const folder = open && !open.startsWith(`${TEMPLATE_FOLDER}/`) ? open.split("/").slice(0, -1).join("/") : "";
	const title = name === "Daily note" ? dateName(new Date()) : `New ${name.toLowerCase()}`;
	const path = await ws.cave.create(folder, title, fill(t.path ? await ws.cave.read(t.path) : t.text(), title));
	await ws.refresh();
	await ws.open(path);
	ws.renaming = title.startsWith("New ") ? path : null;
}

/** Copies the built-in templates into the cave, so they can be changed. */
export async function makeTemplateFolder() {
	if (!ws.cave) return;
	for (const [name, text] of Object.entries(BUILT_IN)) {
		const path = joinPath(TEMPLATE_FOLDER, `${name}.md`);
		if (!(await ws.cave.exists(path))) await ws.cave.write(path, text);
	}
	await ws.refresh();
	ws.openFolders.add(TEMPLATE_FOLDER);
	await ws.open(joinPath(TEMPLATE_FOLDER, "Daily note.md"));
}

/** Opens today's note, making it first if needed. */
export async function today(offset = 0) {
	if (!ws.cave) return;
	const day = shift(new Date(), offset);
	const path = joinPath(DAILY_FOLDER, `${dateName(day)}.md`);
	if (!(await ws.cave.exists(path))) {
		const t = templates().find((x) => x.name === "Daily note")!;
		await ws.cave.write(path, fill(t.path ? await ws.cave.read(t.path) : t.text(), dateName(day), day));
		await ws.refresh();
	}
	ws.openFolders.add(DAILY_FOLDER);
	await ws.open(path);
}
