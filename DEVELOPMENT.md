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
- `src/lib/writing.svelte.ts`: writing settings (typewriter, dimming,
  spell check, focus mode).
- `src/lib/editor/`: CodeMirror. `setup.ts` puts it together and holds the
  editor's look (all from theme variables). `livePreview.ts` hides Markdown
  symbols on lines you are not editing (headings, bold, links, quotes,
  callouts, code fences, bullets, checkboxes, #tags). `properties.ts` is the
  description and tags header. `blocks.ts` draws tables you can edit and
  images. `suggest.ts` is the `/` menu and `[[` note suggestions.
  `behaviors.ts` is drag-to-move blocks, pasting images and links,
  typewriter scrolling and dimming. `Editor.svelte` keeps one state per note.
- `src/lib/theme/`: `theme.ts` (the theme shape, presets, `applyTheme`),
  `store.svelte.ts` (the live theme, saved in localStorage).
- `src/lib/ui/`: `Ribbon.svelte` (command bar), `Sidebar.svelte`,
  `FileTree.svelte`, `SearchPanel.svelte`, `TagsPanel.svelte`,
  `BoardView.svelte` and `CardDialog.svelte`, `Palette.svelte`,
  `CaveSwitcher.svelte`, `ContextMenu.svelte`, `Settings.svelte`, `icons.ts`.
- `src-tauri/`: the desktop shell (Rust). `capabilities/default.json` lists
  what the window may do (folder picker; read and write files).

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

## Keyboard shortcuts

Ctrl+P commands, Ctrl+O open a note, Ctrl+H home, Ctrl+N new note,
Ctrl+Shift+B new board, Ctrl+Shift+E files, Ctrl+Shift+F search all notes,
Ctrl+Shift+T tags, Ctrl+Shift+O switch cave, Ctrl+Shift+Enter focus mode,
Ctrl+W close tab, Ctrl+Tab / Ctrl+Shift+Tab switch tabs, Ctrl+\ sidebar,
Ctrl+, appearance, Ctrl+F find in note.

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

## Next steps

1. F. Looks: background images with blur, glass panels, banner images on
   notes, heading styles, many more color palettes.
2. G. Click-to-customize: click any part of the app to style it.
3. A local AI helper (Ollama) that can read and suggest edits you approve.
4. Custom title bar, backlinks, split panes, daily notes, graph view.
