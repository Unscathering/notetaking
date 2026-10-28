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

- `src/App.svelte`: the window layout: sidebar, tabs, editor, status bar,
  keyboard shortcuts, opening and saving notes.
- `src/lib/vault/`: where notes live. `types.ts` is the interface;
  `disk.ts` is a real folder (Tauri file system plugin); `memory.ts` is a
  browser stand-in with `samples.ts`, used for development and previews.
- `src/lib/editor/`: CodeMirror. `setup.ts` holds the extensions and the
  editor's look (all from theme variables); `livePreview.ts` shows
  formatting as you type and hides the Markdown symbols on lines you are not
  editing (headings, bold, links, `[[wiki links]]`, quotes, code fences,
  bullets, task checkboxes); `Editor.svelte` keeps one editor state per note.
- `src/lib/theme/`: `theme.ts` (the theme shape, presets, `applyTheme`),
  `store.svelte.ts` (the live theme, saved in localStorage).
- `src/lib/ui/`: `FileTree.svelte`, `Settings.svelte` (Appearance panel),
  `icons.ts`.
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

Ctrl+N new note, Ctrl+W close tab, Ctrl+Tab / Ctrl+Shift+Tab switch tabs,
Ctrl+\ sidebar, Ctrl+, appearance, Ctrl+F find in note.

## Status

Version 0.1.0: open a folder, file tree, tabs, live-preview editor,
`[[links]]` that open or create notes, task checkboxes, autosave, five
themes, the Appearance panel (colors, fonts, sizes, corners, spacing,
motion), theme files.

## Next steps

1. Command palette (Ctrl+P) and quick switcher (Ctrl+O).
2. Backlinks panel and link autocomplete when typing `[[`.
3. Custom title bar (no Windows frame) for a sleeker window.
4. Click-to-customize mode: click any part of the app to style it.
5. Rename, delete and move notes from the sidebar (right-click menu).
6. Split panes, search across all notes, daily notes.
7. Graph view (Planetarium could come built in), then plugins.
