// The notes shown outside the desktop app, and a tour of what the editor does.
export const SAMPLE_NOTES: Record<string, string> = {
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
