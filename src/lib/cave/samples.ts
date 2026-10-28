// The sample cave shown outside the desktop app, and a tour of what Basalt does.
import type { CaveMeta } from "./types";

export const SAMPLE_META: CaveMeta = { home: "Home.md", order: { "": ["Home.md", "Welcome.md", "Writing in Basalt.md"] }, looks: { Ideas: { color: "#e8794a", icon: "lightbulb" }, Journal: { color: "#7c8cff", icon: "book" }, Reading: { color: "#7fc48b", icon: "library" } } };

export const SAMPLE_NOTES: Record<string, string> = {
	"Home.md": `---
description: Where every day starts.
tags: [home]
---
# Home

Good to see you. Pick up where you left off:

- [[Welcome]] for the basics
- [[Writing in Basalt]] for a tour of the editor
- [[Ideas/Garden plan]] and [[Ideas/App ideas]]
`,
	"Welcome.md": `# Welcome to Basalt

Basalt keeps your notes as plain **Markdown files** in a folder you choose, so they are always yours.

## Getting around

- Click a note on the left to open it. It opens in a tab.
- Link notes by typing two square brackets: [[Ideas/Garden plan]]
- Press **Ctrl+,** to open settings and make the app your own.

> Everything you see can be changed: colors, fonts, spacing, corners and how things move.

Start with [[Writing in Basalt]] for a quick tour.
`,
	"Writing in Basalt.md": `# Writing in Basalt

Formatting shows as you type. The symbols hide when your cursor leaves the line.

## Text

You can write **bold**, *italic*, ~~struck through~~ and \`inline code\`.

## Lists

1. Numbered lists
2. Keep counting
   - and can nest

- [ ] A task to do
- [x] A task that's done

## Quotes and code

> A quote stands out from the rest of the note.

\`\`\`js
function hello(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

Back to [[Welcome]].
`,
	"Ideas/Garden plan.md": `# Garden plan

Spring list, linked from [[Welcome]].

- [ ] Move the tomatoes to the sunny bed
- [ ] Basil right next to them
- [x] Order seeds

## Notes

Last year the peppers liked the **south wall** best.
`,
	"Ideas/Basalt roadmap.md": `---
basalt: board
description: What's being built, and what's next.
---

## Ideas

- [ ] Planetarium as the graph view #big color:purple
  Every folder a sun, every note a planet.
- [ ] Daily notes with a calendar #writing

## Doing

- [ ] Trello-style boards #boards color:orange due:2026-11-02
  Cards with descriptions, tags, dates and checklists.
  - [x] Lists and cards
  - [x] Drag and drop
  - [ ] Card details
- [ ] Click to customize #looks color:blue

## Done

- [x] Command bar and palette #ui color:green
- [x] Search across notes #ui
`,
	"Ideas/App ideas.md": `# App ideas

- A planetarium view of all my notes
- Daily notes with a calendar
- Themes people can share as one file
`,
	"Journal/2026-10-28.md": `# Wednesday

Started building Basalt today. Goal: *smooth, light and fully customizable*.
`,
	"Reading/Books.md": `# Books

| Title | Status |
| --- | --- |
| The Left Hand of Darkness | Reading |
| Piranesi | Done |
`,
};
