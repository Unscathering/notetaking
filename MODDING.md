# Modding Basalt

Basalt is made to be changed. Everything here works with plain files you can
write in any editor and share with anyone: a `.md` note and a `.css` snippet
are all a dashboard needs.

## CSS snippets

A snippet is a `.css` file in your cave's `.basalt/snippets` folder. Turn
snippets on and off in **Appearance → Snippets**, where you can also edit them
(changes show as you type) and start from examples. Which ones are on is saved
with the cave, so a cave you copy to another computer looks the same there.

To share a snippet, share its file. To install one, put it in
`.basalt/snippets` (or paste it into a new snippet) and turn it on.

### Theme variables

Use these instead of fixed colors, and your snippet will fit every theme:

| Variable | What it is |
| --- | --- |
| `--accent`, `--on-accent` | The accent color, and text on top of it |
| `--text`, `--muted`, `--heading`, `--link`, `--code` | Text colors |
| `--bg`, `--panel`, `--raised` | Backgrounds: the page, side panels, raised things |
| `--border`, `--hover`, `--accent-soft` | Lines, hover backgrounds, a soft accent wash |
| `--radius` | Corner rounding |
| `--font-ui`, `--font-editor`, `--font-heading`, `--font-code` | Fonts |
| `--text-size`, `--line-height`, `--text-width` | The note's text |
| `--dur`, `--ease` | Animation length and curve (0 when motion is off) |
| `--surface-panel`, `--surface-float`, `--glass-filter`, `--float-filter` | Glass |

### Styling one kind of note

Add `cssclass` (or `cssclasses`) to a note's properties:

```markdown
---
cssclass: dashboard
---
```

The note's editor then sits inside an element with both `dashboard` and
`note-dashboard` as classes, so `.note-dashboard .cm-content { … }` styles
only those notes.

### Classes worth knowing

| Selector | What it is |
| --- | --- |
| `.cm-content` | The note's text column |
| `.cm-h1` … `.cm-h6` | Headings |
| `.cm-props` | The description and tags at the top of a note |
| `.cm-wikilink`, `.cm-hashtag`, `.cm-task`, `.cm-callout` | Links, #tags, checkboxes, callouts |
| `.cm-table`, `.cm-image`, `.cm-codeblock` | Tables, pictures, code |
| `.basalt-block` | A live block; also `.basalt-show-list`, `.basalt-show-cards`, `.basalt-show-table`, `.basalt-show-count` and `.basalt-list-notes`, `-tasks`, `-tags`, `-backlinks` |
| `.basalt-title`, `.basalt-items`, `.basalt-card`, `.basalt-card-title`, `.basalt-card-text`, `.basalt-card-meta`, `.basalt-table`, `.basalt-count` | The parts of a live block (a card's `--card-color` is its folder's color) |
| `.basalt-embed`, `.basalt-embed-head`, `.basalt-embed-body` | An embedded note |
| `.sidebar`, `.ribbon`, `.tabbar`, `.status` | The parts of the window |
| `html[data-material="glass"]`, `html[data-light="yes"]` | The current material, light or dark theme |

## Live blocks

A code block marked `basalt` becomes a live list. Type `/` in a note for ready
ones. Each line is `key: value`:

````markdown
```basalt
title: Active projects
from: Projects
where: status = active
show: cards
sort: name
```
````

| Key | Values |
| --- | --- |
| `list` | `notes` (the default), `tasks`, `tags`, `backlinks`, `habits` |
| `show` | `list` (the default), `cards`, `table`, `count` |
| `from` | Folders, separated by commas |
| `tag` | Only notes with this tag |
| `where` | A property test: `status = active`, `rating > 3`, `status != done`, `has due` (repeat the line for more) |
| `search` | Only notes that mention this |
| `done` | Tasks: `false` (the default), `true`, `any` |
| `due` | Tasks: `today`, `week`, `overdue`, `any` |
| `to` | Backlinks to another note (this note if left out) |
| `sort` | `name`, `due`, `folder` or any property; put `-` in front to reverse |
| `limit` | How many (50 if left out) |
| `columns` | Table columns: properties, or `folder`, `due`, `tags`, `note` |
| `days` | Habits: how many days back (28 if left out) |
| `title` | A heading above it |

Tasks are checklist items. They count as due on a day when they say
`due:2026-11-02`, `📅 2026-11-02` or `@2026-11-02`; board cards with a due date
count too. Ticking a task in a live block ticks it in its note.

## Habits

Write your habits as a checklist in a note called **Habits**. New daily
notes copy them in under a "Habits" heading (the `{{habits}}` placeholder in
the daily template); tick them off there. A block with `list: habits` draws
them as a tracker with streaks; click a square to tick that day. Style it
with `.basalt-habits`, `.basalt-habit-cell` (`.is-done`, `.is-today`) and
`.basalt-habit-streak`.

## Embeds

A line that is only `![[Note]]` shows that note in place; `![[Note#Heading]]`
shows just that section.

## Templates

Notes in the cave's `Templates` folder are templates (**New note from a
template**, Ctrl+Shift+N). These fill in when a note is made: `{{date}}`,
`{{time}}`, `{{weekday}}`, `{{title}}`, `{{yesterday}}`, `{{tomorrow}}`,
`{{habits}}`. A
template named like a built-in one ("Daily note", "Dashboard") replaces it.

## Themes

**Appearance → Save** writes the whole look to a `.basalt-theme.json` file;
**Load** reads one. Share themes as those files.

## Sharing in the gallery

**Appearance → Gallery** shows themes, snippets and dashboards from the
`gallery` folder of Basalt's repository; one click adds one. To share yours:

1. Fork the repository and add your file: a snippet to `gallery/snippets/`
   (a `.css` file), a theme to `gallery/themes/` (a `.json` file: `name`,
   `base` (a built-in theme to start from) and any of `colors`, `type`,
   `headings`, `shape`, `glass` as in a saved theme), or a dashboard to
   `gallery/dashboards/` (a `.md` note).
2. Add an entry for it to `gallery/gallery.json`: `id`, `name`, `about`,
   `author` and `file`; themes also have `swatch` (four colors: background,
   panel, accent, text) and dashboards can name the `snippet` they need.
3. Open a pull request.

## Putting it together: a dashboard

1. Make a note from the **Dashboard** template.
2. In **Appearance → Snippets**, add the **dashboard** example.
3. Change the blocks to show what you care about, and the snippet to look how
   you like. Share both files.
