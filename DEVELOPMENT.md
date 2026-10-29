# Developing Basalt

Basalt is a note-taking app in the spirit of Obsidian: notes are plain
Markdown files in a folder the user picks. The goals, in order: smooth,
light, sleek, and customizable without writing CSS.

"Basalt" is a working name (a terminal tool for Obsidian notes uses it too);
check again before a public launch.

## How we work

- Explain changes in plain words.
- Agree on a new direction before building it.
- Show previews of visual changes (screenshots, short videos).
- Report problems as soon as they come up.
- Commit and push after every finished step, straight to `main`, signed as
  Unscathering, with no tool or assistant names in commits or files.

## The design rules

- **Customizable without hoops.** Every color, font, size, corner, spacing
  value and animation setting lives in the theme (`src/lib/theme/theme.ts`)
  and is changed live from the Appearance panel. Nothing in the interface
  hard-codes a color or size: components read CSS variables (`--accent`,
  `--radius`, `--dur`, `--ease`, ...). New features must follow this.
- **Themes are one file.** Save and load a theme as a single JSON file.
- **Smooth.** Animations use the theme's `--dur` and `--ease`, only animate
  cheap things (opacity, transform, colors), and turn off with motion "off"
  or the system's reduced-motion setting.
- **Light.** Svelte for the interface, CodeMirror for the editor, Tauri for
  the desktop shell (uses the system's web view, so the installer is small).
  Think twice before adding a dependency.
- **Your files stay yours.** Notes are plain `.md` files; the app never
  locks them in a database.

## Code map

- `src/App.svelte`: the window layout (command bar, sidebar, tabs, editor
  or board, status bar), focus mode and keyboard shortcuts.
- `src/lib/workspace.svelte.ts`: the app's state and actions (`ws`): the
  open cave, notes, tabs, saving, moving, renaming, home page, images.
- `src/lib/commands.ts`: every command in one list; the command bar, the
  palette (Ctrl+P) and shortcuts all read from it.
- `src/lib/cave/`: where notes live (a "cave" is a folder of notes).
  `types.ts` is the interface and the file tree; `disk.ts` is a real folder
  (Tauri file system plugin); `memory.ts` is a browser stand-in with
  `samples.ts`, used for development and previews. Per-cave settings (home
  page, hand-picked order, folder colors and icons) are in
  `.basalt/cave.json` inside the cave.
- `src/lib/notes.ts`: note properties (description, tags, banner) and
  search. `src/lib/board.ts`: boards (Markdown with `basalt: board`).
- `src/lib/templates.ts`: templates (notes in the cave's `Templates` folder,
  plus built-in ones, with `{{date}}`-style placeholders) and daily notes
  (`Daily/2026-10-28.md`, made from the "Daily note" template). The picker
  is the palette's "templates" mode.
- `src/lib/backups.svelte.ts` and `ui/Backups.svelte`: automatic backups of
  every note, folder and the cave's settings (not pictures), kept outside the
  cave in the app's data folder (in a browser, in localStorage). Made when a
  cave opens, every half hour if something changed, and before the AI applies
  a plan; the newest 20 and one a day for two weeks are kept. Restoring makes
  a backup first; `ws.reloaded` tells the editor to reload every note.
- Views: tabs whose path starts with `basalt:` aren't notes (`VIEWS` and
  `isView` in `workspace.svelte.ts`; `ws.note` is the note in front, if any,
  and `ws.recent` the last one). `basalt:graph` is the graph:
  `src/lib/graph.ts` builds it (links, tags, notes not written yet) and runs
  the physics; `ui/GraphView.svelte` draws it on a canvas (folder colors,
  hover glow, drag, zoom, a camera that follows until you take over, filters,
  forces and a "near this note" mode). The layout is kept between visits.
- `src/lib/history.svelte.ts` and `ui/NoteHistory.svelte`: each note's earlier
  versions (kept outside the cave like backups), saved through `ws.hooks`
  (`saved`, `replacing`, `renamed`): one every five minutes while typing, and
  pinned copies before anything else replaces a note. The window compares a
  version with now, line by line, and restores it.
- `basalt:calendar` is `ui/CalendarView.svelte`: a month of days with daily
  notes and everything dated (`src/lib/agenda.ts`: board cards with a due
  date, checklist items with `due:`, `📅` or `@` and a date). The ✨ beside
  a week runs `src/lib/recap.svelte.ts`, which has the AI write that week's
  recap into `Daily/<year>-W<week> recap.md`, filling in live.
- Modding (the user-facing guide is `MODDING.md`): `src/lib/snippets.svelte.ts`
  and `ui/settings/SnippetsPage.svelte` (CSS files in `.basalt/snippets`,
  turned on per cave in `meta.snippets`, put in the page as `<style
  data-snippet>`); `cssclass` in a note's properties puts classes on the
  editor's wrapper (`Editor.svelte`); `src/lib/query.ts` runs ```basalt
  blocks and `editor/liveBlocks.ts` draws them and `![[embeds]]`, with
  `liveHooks.ts` connecting them to the cave. `Cave.listDir` lists hidden
  folders.
- `basalt:db:<folder>` is `ui/DatabaseView.svelte`: a folder's notes as a
  table (properties as columns, edited in place through `writeProps`),
  gallery, or board grouped by a property. `viewInfo` names view tabs.
- `ui/OutlinePanel.svelte`: the sidebar's outline (headings, reading time,
  `goal:` words); the editor reports the cursor line as `ws.cursorLine`.
- Split panes: `ws.split` is the note on the right (`ui/SplitPane.svelte`,
  opened with Ctrl+click or "Open on the right"); each editor follows
  changes made elsewhere while it isn't focused (marked `Transaction.remote`
  so they aren't saved twice).
- `src/lib/export.ts`: notes to HTML (with `marked`, loaded only then):
  PDF through the print window, one self-contained web page, or a folder as
  a website (desktop app; pages, links between them, pictures, an index).
- Habits (`src/lib/habits.ts`): the checklist in a note called "Habits",
  copied into daily notes by `{{habits}}`; `list: habits` blocks draw the
  tracker. The focus timer is `src/lib/focus.svelte.ts` and
  `ui/FocusTimer.svelte` (in the bottom bar); finished sessions are logged
  in today's note. `ensureDay` in `templates.ts` finds or makes a day's note.
- Web clipper: `src/lib/clip.ts` and `ui/ClipDialog.svelte` (Ctrl+Shift+K).
  The desktop app fetches the page (`src-tauri/src/web.rs`), Readability
  finds the article and Turndown makes it Markdown (both loaded only then);
  it's saved in `Clippings` with `source` and `clipped` properties.
- Gallery: `gallery/` in this repository (`gallery.json` lists the
  snippets, themes and dashboards); `src/lib/gallery.svelte.ts` reads it
  from GitHub and installs entries; `ui/settings/GalleryPage.svelte`.
- `basalt://` links: `src/lib/links.ts` (with the deep-link and
  single-instance plugins in `src-tauri/src/lib.rs`).
- Voice typing: `src/lib/speech.svelte.ts` records 16 kHz WAV and
  `src-tauri/src/speech.rs` runs whisper.cpp (downloaded once, with a
  voice model, into the app data folder; on the processor). The mic is
  `ui/MicButton.svelte`, in the bottom bar and the AI chat box.
- `src/lib/writing.svelte.ts`: writing settings (typewriter, dimming,
  spell check, focus mode).
- `src/lib/ai/`: Basalt's local AI. `engine.svelte.ts` sets up, wakes and
  puts to sleep the engine (llama.cpp's llama-server, managed by
  `src-tauri/src/ai.rs`: downloads, start/stop, streaming chats, all on
  127.0.0.1). `models.ts` is the model list and "recommended for your PC".
  `tools.ts` is everything the AI can do: looking around runs straight away,
  changes become a plan the user approves, each with its own undo. `check`
  turns down changes that can't work (blank or made-up names) before they
  reach the plan. Tools come in groups (`GROUPS`): before each message a
  tiny request (`sortRequest` in `agent.svelte.ts`, JSON-constrained) plus
  the message's words pick the groups, so a small model chooses from about
  10 tools instead of 25; the look tools are only offered when the user asks
  about the look. Big jobs are one tool each (`create_space`,
  `create_dashboard`, `create_project`, `create_snippet`…) and Basalt writes
  the result. `basalt_help` looks things up in this repo's MODDING.md
  (`manual.ts`). `agent.svelte.ts` runs the conversation (live steps the
  user can open, no repeated calls, at most two memories a message, older
  messages trimmed to fit the engine's `CONTEXT`) and the memory note
  (`.basalt/ai/memory.md` in the cave, hidden from the sidebar). It also
  keeps saved chats (`.basalt/ai/chats/`, listed in `.basalt/ai/chats.json`)
  and projects: a chat can belong to a folder, whose chats share a memory in
  `.basalt/ai/projects/`. The speed test is `speedTest` in `writer.ts`.
  The model test (`bench.svelte.ts`, shown by `ui/ai/ModelTest.svelte`)
  runs 18 Basalt jobs in a practice cave that exists only in memory: the
  real instructions, tools and request sorting, with looking around
  answered from the practice cave and planned changes scored, never made.
  To add a job, add it to `JOBS` with a `score` that checks the plan and
  the answer.
  Speed: the system prompt holds only what rarely changes (what changes per
  message goes with the message), chats use engine slot 0 and the sorting
  slot 1, and slot 0 is saved to the app folder's `cache` after the first
  answer of each wake and restored on the next (`ai_cache`). The engine
  starts with `--spec-type ngram-mod` (plus `draft-mtp` for MTP models),
  and starts again without these if it won't start with them. Writing help
  can have its own model (a second engine, `slot: "writer"`); mixture-of-
  experts models move experts to normal memory with `--n-cpu-moe`.
  The panel is `ui/ai/AiPanel.svelte`. In a browser, setting
  `localStorage["basalt.ai-dev-url"]` to an OpenAI-style server (or "setup")
  lets you try it without the desktop app.
- Claude (optional, online): `ai/claude.svelte.ts` turns the engine-style
  requests into Messages API calls through the official `@anthropic-ai/sdk`
  (loaded only when used) and streams the answer back in the engine's shape,
  so the chat, writing help and memory work unchanged. Claude's answers are
  kept as they came (`raw` on the history) and sent back unchanged; the chat
  isn't trimmed for it. Opus and Sonnet use server-side fallbacks
  (`fallbacks: "default"`). The key and choice are in localStorage on this
  PC (`basalt.claude`). The panel says plainly when messages go to Anthropic.
  `ui/ai/ClaudeSettings.svelte` is its section under AI models. In a browser,
  `localStorage["basalt.claude-dev-url"]` points the SDK at a stand-in server.
- Writing help: `ai/proofread.ts` (the three modes, the word-by-word
  comparison and the rules that keep grammar mode to small fixes, never
  touching links, code, tags or formatting), `ai/writer.ts` (sends lines to
  the engine one job at a time, wakes it early) and `editor/writingHelp.ts`
  (the selection bar, underlines, review cards, the bottom bar and "check
  grammar as I write"). `editor/active.ts` is the editor on screen, for
  commands.
- `src/lib/updates.svelte.ts` and `ui/UpdateNotice.svelte`: the desktop app
  asks GitHub for the latest release now and then and offers "Update now":
  `src-tauri/src/update.rs` downloads the installer, runs it on its own
  (`/P /R`) and closes Basalt, which reopens updated. The AI engine and
  models live in the app data folder, so updates keep them. Downloads (in
  `ai.rs`) come in 8 pieces at once and pick up where a piece stopped.
- `src/lib/editor/`: CodeMirror. `setup.ts` puts it together and holds the
  editor's look (all from theme variables). `livePreview.ts` hides Markdown
  symbols on lines you are not editing (headings, bold, links, quotes,
  callouts, code fences, bullets, checkboxes, #tags). `properties.ts` is the
  description and tags header. `blocks.ts` draws tables you can edit and
  images. `suggest.ts` is the `/` menu and `[[` note suggestions.
  `behaviors.ts` is drag-to-move blocks, pasting images and links,
  typewriter scrolling and dimming. `Editor.svelte` keeps one state per note.
- `src/lib/theme/`: `theme.ts` (the theme shape, 24 presets, wallpapers,
  `themeVars` which turns a theme into CSS variables, including the glass
  surfaces), `store.svelte.ts` (the live theme, saved in localStorage),
  `media.svelte.ts` (your own background pictures, GIFs and videos, kept in
  IndexedDB on this computer, with the 15-second limit for moving ones).
  Glass works through `--surface-*`, `--glass-filter`, `--glass-edge` and
  `--glass-grain`; liquid glass uses the SVG filter `#basalt-liquid` in
  `App.svelte`. Heading styles are CSS in `app.css` keyed on
  `html[data-headings]`.
- `src/lib/ui/`: `Ribbon.svelte` (command bar), `Sidebar.svelte`,
  `FileTree.svelte`, `SearchPanel.svelte`, `TagsPanel.svelte`,
  `BoardView.svelte` and `CardDialog.svelte`, `Palette.svelte`,
  `CaveSwitcher.svelte`, `ContextMenu.svelte`, `icons.ts`. `Settings.svelte`
  is the Appearance window; its pages, the little theme pictures
  (`MiniApp.svelte`), sliders, switches and the looping motion examples
  (`demo.ts`) are in `ui/settings/`. `SidebarPage.svelte` and
  `TreePreview.svelte` hold the folder-list choices (`theme.sidebar`).
- `src-tauri/`: the desktop shell (Rust). `capabilities/default.json` lists
  what the window may do (folder picker; read and write files). The window's
  own drag-and-drop is off (`dragDropEnabled`), so the page gets drags (moving
  notes into folders, dropping pictures).

## Running and testing

- `npm run dev`: the interface in a browser at http://localhost:1420 with
  sample notes.
- `npm run check`: type check. `npm run build`: build the interface.
- `npx tauri dev`: the desktop app (needs Rust; on Linux also the WebKitGTK
  libraries: `libwebkit2gtk-4.1-dev build-essential libssl-dev
  libayatana-appindicator3-dev librsvg2-dev`).
- Windows installers are built by GitHub: `.github/workflows/build.yml` on
  every push to `main` (download from the Actions run, under Artifacts) and
  `release.yml` on a `v*` tag (publishes a release).

## Releasing a version

1. Raise the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`.
2. Commit and push to `main`. That's all: a changed version starts
   `release.yml` (it can also be started by hand from the Actions tab).
3. It builds Basalt, makes the tag (like `v0.3.0`) and publishes a release with
   `Basalt-Setup.exe` and `Basalt-Portable.exe`. The links in the README
   always point at the newest release, and the app's update notice finds it.
   (The repository has to be public for other people to download.)

## Keyboard shortcuts

Ctrl+P commands, Ctrl+O open a note, Ctrl+H home, Ctrl+N new note,
Ctrl+Shift+B new board, Ctrl+Shift+E files, Ctrl+Shift+F search all notes,
Ctrl+Shift+T tags, Ctrl+Shift+O switch cave, Ctrl+Shift+Enter focus mode,
Ctrl+W close tab, Ctrl+Tab / Ctrl+Shift+Tab switch tabs, Ctrl+\ sidebar,
Ctrl+, appearance, Ctrl+F find in note, Ctrl+J the AI, Ctrl+Shift+G check
grammar (selection or whole note), Ctrl+Shift+D today's note, Ctrl+Shift+N
new note from a template, Ctrl+click a note to open it on the right, Ctrl+Shift+P print or save as
PDF, Ctrl+Shift+K clip a web page.

## Status

Version 0.1.0 plus, so far:

- A. Caves (vaults) with a switcher, a home page, the command bar and
  command palette.
- B. Drag files and folders into any order; folder colors and icons;
  right-click menu (new, rename, delete, home, looks).
- C. Search across notes, descriptions and tags on every note, a tags panel.
- D. Trello-style boards: lists and cards you drag, card colors, due dates,
  tags, descriptions and checklists.
- E. Writing: the `/` menu, `[[` suggestions, callouts, tables you edit
  like a spreadsheet, images (paste, drop or pick), drag blocks to move
  them, focus mode, typewriter scrolling, dim other paragraphs, spell check.
- F. Looks: a new Appearance window made of picture cards, 24 themes,
  background pictures (12 built in, or your own) with blur and fade, solid,
  glass, frosted and liquid glass, floating panels, banner images on notes,
  six heading styles with their own font and weight, nine fonts, and motion
  styles you can watch before choosing.
- 0.2.0: transparent panels (the "Clear" material) and seamless mode, GIF
  and video backgrounds up to 15 seconds, a Sidebar page with folder styles
  (arrows, icons, guide lines, where colors show, counts, sizes), 48 icons
  and emoji for folders and notes, any custom color, the command bar's side
  tab as a setting, direct download links, a portable version and update
  notices.

- 0.3 to 0.6: Basalt AI on your PC (chat, plans with undo, memory, saved
  chats and projects, answers from notes with sources, writing help in three
  modes, a speed test), or Claude with your own API key; in-app updates;
  daily notes, templates and automatic backups.
- 0.7 to 0.12: graph view, note history, calendar and weekly AI recap,
  modding (CSS snippets, cssclass, live blocks, embeds, MODDING.md), outline,
  database view, split panes, export and share, habits and a focus timer,
  web clipper, the gallery, basalt:// links and voice typing.

## Next steps

1. Canvas (an endless whiteboard of notes, pictures and arrows).
2. Flashcards with spaced repetition; presentation mode.
3. A phone companion.
4. Click-to-customize: click any part of the app to style it.
