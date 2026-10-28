# Basalt

A fast, light note-taking app where you can change how everything looks, with no code.

Your notes are plain Markdown files in a folder you choose, so they stay yours. Obsidian can open the same folder.

## What it does so far

- Caves: folders of notes you can switch between, each with its own home page
- A command bar, a command palette (Ctrl+P) and a quick note switcher (Ctrl+O)
- Shows formatting as you type, and hides the Markdown symbols when you move away
- `[[Links]]` between notes, with suggestions as you type
- A `/` menu for headings, lists, checklists, callouts, tables, code, images and more
- Tables you edit cell by cell, pasted and dropped images, callout boxes
- Drag paragraphs, files and folders into any order; color and icon your folders
- Descriptions and tags on every note, a tags panel, and search across all notes
- Boards like Trello: lists, cards, colors, due dates, descriptions and checklists
- Focus mode, typewriter scrolling and dimming of other paragraphs
- 24 themes, shown as little pictures of the app, and themes you can save and share as one file
- Glass, frosted glass and liquid glass panels, floating panels, and background pictures with blur
- Banner pictures on notes, heading styles, nine fonts, and animation styles you can watch before choosing
- An Appearance window (Ctrl+,) where every change shows up live

## Download

Windows installers are built automatically. Grab the latest from [Releases](https://github.com/Unscathering/notetaking/releases), or from the newest run in the [Actions](https://github.com/Unscathering/notetaking/actions) tab, under "Artifacts".

## Build it yourself

You need [Node.js](https://nodejs.org) and [Rust](https://rustup.rs).

```bash
npm install
npm run dev        # the interface in your browser, with sample notes
npx tauri dev      # the desktop app
npx tauri build    # an installer for your system
```

## License

[MIT](LICENSE)
