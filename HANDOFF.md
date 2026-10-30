# Handoff: start here

This file is for picking Basalt back up in a brand-new session with no memory
of earlier conversations. Read it first, then `DEVELOPMENT.md` (code map,
commands, releasing) and `MODDING.md` (snippets, live blocks, dashboards).

## Who you're working with

- Unscathering (GitHub: Unscathering). Builds things by describing them;
  is a beginner at code, so explain everything in plain words, no jargon.
- Uses Windows. PC: AMD Ryzen 7 8845HS, 16 GB RAM (often ~15 GB in use),
  NVIDIA RTX 4050 Laptop GPU (6 GB) plus the built-in AMD Radeon 780M.
- Loves things that are sleek, smooth, light and deeply customizable
  (glass looks, themes, dashboards like the Obsidian "Komorebi" style).

## How to work together

- Plain words. Agree before starting a new direction; ask questions as plain
  text. Report problems right away.
- Show pictures: take screenshots (Playwright, see below) after each chunk of
  work and send them.
- Commit and push after each finished step, straight to `main`, as
  Unscathering. **Nothing with "claude" in file names, commits or history,
  and no Co-Authored-By or session lines in commit messages.**
- Don't create `claude/*` branches on GitHub.
- The repository is **private**, and should stay private for now (the user
  wants to polish Basalt more before sharing). Because of that, only the
  user (logged in) can download releases, and the in-app update check can't
  see them.

## The projects

1. **Basalt** (this repo, `Unscathering/notetaking`): a sleek, light,
   customizable Obsidian-like note app for Windows. Tauri v2 (Rust) + Svelte 5
   + CodeMirror 6. Notes are plain Markdown in a folder called a "cave".
   Current version: 0.19.2. Everything works and builds clean.
2. **Planetarium** (`Unscathering/Planetarium`): an Obsidian plugin (formerly
   "Solar System Graph") that shows a vault as a universe of solar systems.
   Release 0.5.1 passed Obsidian's review and is listed in the community
   plugin directory. Older leftovers from that project, never done: a
   "Phase 3" (collision-free orbits, live births of planets) and a polish list
   (legend, rarity, double-click suns, performance setting).

## How Basalt grew (short history)

- 0.1: the app shell, caves, file tree, tabs, live-preview editor, themes.
- Steps A to F (before 0.2): command bar and palette, home page, cave
  switcher; drag-to-order sidebar with folder colors and icons; search,
  descriptions and tags; Trello-style boards; writing features (/ menu,
  tables, callouts, images, block dragging, focus mode); the Appearance
  window with 24+ themes, wallpapers, glass, frosted and liquid glass.
- 0.2: transparent mode, GIF and video backgrounds (15 s max), folder styles,
  releases with fixed download names (Basalt-Setup.exe, Basalt-Portable.exe).
- 0.3: Basalt AI, running entirely on the user's PC: Basalt downloads and
  runs llama.cpp itself, picks a model that suits the PC, and the AI can
  change anything in the cave through plans the user approves, with undo and
  a memory note.
- 0.4 to 0.19 (built by the user in later sessions): writing help, saved
  chats and projects, answers from notes with sources, daily notes,
  templates, backups, Claude with your own API key, graph view, note history,
  calendar and weekly recap, CSS snippets and live blocks, split panes,
  database view, outline, export, habits, focus timer, web clipper, gallery,
  basalt:// links, voice typing (whisper.cpp), newer models (Qwen3 / Qwen3.5,
  gpt-oss), a model test, Plan first or Full access for the AI, view mode,
  resizable panels, dashboard widgets and the Komorebi look, a frameless
  window, Obsidian-style tabs and titles, and a Claudian-style AI panel.

## How releases reach the user

Raise the version in `package.json`, `src-tauri/tauri.conf.json` and
`src-tauri/Cargo.toml`, commit and push to `main`. The Release workflow
builds Windows installers and publishes a release (tag made from the
version). The user installs `Basalt-Setup.exe` from the newest release page
on GitHub. Note: pushing git tags from the cloud session is blocked, which is
why releases start from the version change instead.

## Testing without a Windows PC

- `npm run build`, then `npx vite preview --port 4173`, and drive it with
  Playwright (preinstalled in the cloud container) for checks and
  screenshots. The browser version uses a sample cave kept in localStorage.
- The AI can't download real models in the cloud container (Hugging Face and
  GitHub release downloads are blocked there). To test the AI panel, run a
  stand-in server that answers like llama-server (OpenAI-style streaming at
  `/v1/chat/completions`) and set `localStorage["basalt.ai-dev-url"]` to its
  address; `"setup"` shows the first-time setup screen instead.
- The real AI only runs on the user's PC, so ask them for screenshots of
  anything that goes wrong there.

## Ideas for later (none urgent)

1. Code signing, so Windows stops saying it "protected your PC" (Microsoft's
   Trusted Signing is about $10/month).
2. Public downloads without showing the code: a separate public repo that
   only holds installers, which also lets the in-app updater see releases.
3. Check Basalt is still light (it started at ~12 MB of memory); load big
   views (graph, database, calendar) only when opened if needed.
4. Click-to-customize: click any part of the app to style it right there
   (from the original wish list; not built yet).
5. Sync between devices, like Obsidian Sync.
