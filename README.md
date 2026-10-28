# Basalt

A fast, light note-taking app where you can change how everything looks, with no code.

Your notes are plain Markdown files in a folder you choose, so they stay yours. Obsidian can open the same folder.

## What it does so far

- Opens any folder of notes, with a sidebar and tabs
- Shows formatting as you type, and hides the Markdown symbols when you move away
- `[[Links]]` between notes; click one to open it, or to create the note if it doesn't exist yet
- Checkboxes you can tick, code blocks with highlighting, quotes and lists
- Saves as you type
- An Appearance panel (Ctrl+,) for colors, fonts, text size, line spacing, width, corners, spacing and animation style and speed, all changing live
- Five built-in themes, and themes you can save and share as one file

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
