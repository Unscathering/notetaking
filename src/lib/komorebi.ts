// Komorebi (木漏れ日, sunlight through leaves): a dashboard look rebuilt for
// Basalt from InlitX's Obsidian "Dashboard-Komorebi". Frosted indigo glass
// tiles, // labels in a mono font, a header with a clock, tiles that breathe
// when you point at them. Here it's a CSS snippet over Basalt's own widgets
// (editor/widgets.ts) instead of scripts, plus two dashboards to start from.
//
// A note uses it with `cssclass: dashboard komorebi`; a color way is one more
// word: `cssclass: dashboard komorebi sakura`.

export const COLORWAYS: Array<{ id: string; name: string; about: string }> = [
	{ id: "indigo", name: "Indigo", about: "The original: deep indigo glass with lilac labels." },
	{ id: "sakura", name: "Sakura", about: "Cherry-blossom pinks on plum glass." },
	{ id: "matcha", name: "Matcha", about: "Soft greens on mossy glass." },
	{ id: "ember", name: "Ember", about: "Warm amber and rust, like a fire at night." },
	{ id: "glacier", name: "Glacier", about: "Icy blues and white, cold and clear." },
	{ id: "mono", name: "Mono", about: "Grays only, quiet and sharp." },
];

export const KOMOREBI_CSS = `/* Komorebi: frosted glass dashboard tiles.
   Use it with "cssclass: dashboard komorebi" (add a color way:
   indigo, sakura, matcha, ember, glacier or mono).
   Rebuilt for Basalt from InlitX's Dashboard-Komorebi. */

.note-komorebi {
  --k-surface: rgba(18, 21, 43, 0.44);
  --k-overlay: rgba(26, 28, 56, 0.30);
  --k-raised: rgba(54, 41, 82, 0.34);
  --k-border: rgba(171, 167, 215, 0.17);
  --k-border-hover: rgba(226, 228, 244, 0.44);
  --k-accent: #d7bddf;
  --k-accent-2: #9da9df;
  --k-glow: 220, 142, 210;
  --k-deep: 8, 17, 37;
  --k-text: #d9dce8;
  --k-muted: #7a7d92;
  --k-font: "JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace;
}
.note-komorebi.note-sakura {
  --k-surface: rgba(43, 18, 34, 0.44); --k-overlay: rgba(56, 26, 44, 0.30); --k-raised: rgba(92, 41, 70, 0.34);
  --k-border: rgba(232, 167, 199, 0.18); --k-border-hover: rgba(250, 214, 232, 0.5);
  --k-accent: #f2b8d2; --k-accent-2: #e58fb6; --k-glow: 245, 150, 190; --k-deep: 30, 8, 22;
  --k-text: #f0dbe5; --k-muted: #a3788c;
}
.note-komorebi.note-matcha {
  --k-surface: rgba(18, 34, 24, 0.44); --k-overlay: rgba(26, 46, 32, 0.30); --k-raised: rgba(48, 78, 52, 0.34);
  --k-border: rgba(170, 214, 170, 0.17); --k-border-hover: rgba(214, 240, 206, 0.46);
  --k-accent: #bfe0a6; --k-accent-2: #8cc79a; --k-glow: 160, 210, 130; --k-deep: 8, 24, 14;
  --k-text: #dce9d8; --k-muted: #7f9480;
}
.note-komorebi.note-ember {
  --k-surface: rgba(40, 22, 14, 0.46); --k-overlay: rgba(54, 30, 18, 0.32); --k-raised: rgba(90, 50, 28, 0.36);
  --k-border: rgba(232, 180, 140, 0.18); --k-border-hover: rgba(255, 220, 190, 0.48);
  --k-accent: #f4b98a; --k-accent-2: #e08a5a; --k-glow: 250, 160, 90; --k-deep: 28, 12, 4;
  --k-text: #f1e0d2; --k-muted: #a38672;
}
.note-komorebi.note-glacier {
  --k-surface: rgba(14, 28, 42, 0.42); --k-overlay: rgba(20, 38, 54, 0.30); --k-raised: rgba(40, 68, 92, 0.34);
  --k-border: rgba(170, 210, 235, 0.18); --k-border-hover: rgba(225, 242, 255, 0.5);
  --k-accent: #bfe3f7; --k-accent-2: #86c2e6; --k-glow: 150, 210, 245; --k-deep: 4, 16, 30;
  --k-text: #e1eef6; --k-muted: #7d93a3;
}
.note-komorebi.note-mono {
  --k-surface: rgba(22, 22, 24, 0.46); --k-overlay: rgba(34, 34, 36, 0.32); --k-raised: rgba(60, 60, 64, 0.34);
  --k-border: rgba(200, 200, 205, 0.15); --k-border-hover: rgba(240, 240, 245, 0.42);
  --k-accent: #e6e6ea; --k-accent-2: #b4b4bc; --k-glow: 220, 220, 230; --k-deep: 10, 10, 12;
  --k-text: #e4e4e8; --k-muted: #85858d;
}

/* Wide, and no properties header. */
.note-komorebi .cm-content { max-width: 1460px; }
.note-komorebi .cm-props { display: none; }
/* In view mode the empty lines between parts don't leave gaps. */
.note-komorebi.is-reading .cm-line:has(> br:only-child) { height: 0; padding: 0; overflow: hidden; }

.note-komorebi .basalt-block {
  font-family: var(--k-font);
  color: var(--k-text);
}

/* Frosted glass tiles. */
.note-komorebi .basalt-block,
.note-komorebi .basalt-column > .basalt-block {
  margin: 0 0 14px;
  padding: 18px;
  border: 1px solid var(--k-border);
  border-radius: 9px;
  background: var(--k-surface);
  background-image:
    radial-gradient(ellipse 100% 100% at 0% 0%, rgba(var(--k-glow), 0.06) 0%, rgba(var(--k-glow), 0.03) 22%, transparent 68%),
    linear-gradient(145deg, rgba(var(--k-glow), 0.04) 0%, transparent 42%, rgba(var(--k-deep), 0.16) 75%, rgba(var(--k-deep), 0.22) 100%);
  backdrop-filter: blur(14px) saturate(115%);
  box-shadow: inset 1px 1px 0 rgba(var(--k-glow), 0.065), inset 0 0 28px rgba(var(--k-glow), 0.035), 0 2px 20px rgba(0, 0, 0, 0.18);
  transform: scale(0.996);
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}
.note-komorebi .basalt-column > .basalt-block { margin: 0; }
.note-komorebi .basalt-block:hover {
  transform: scale(1.008);
  z-index: 2;
  border-color: var(--k-border-hover);
  box-shadow: 0 8px 22px rgba(var(--k-deep), 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05);
}
.note-komorebi .basalt-row { gap: 14px; }
.note-komorebi .basalt-column { gap: 14px; }

/* // LABELS */
.note-komorebi .basalt-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  color: var(--k-accent);
  opacity: 0.8;
  font-family: var(--k-font);
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.note-komorebi .basalt-title::before { content: "//"; color: var(--k-muted); opacity: 0.7; }

/* Header */
.note-komorebi .basalt-header { padding: 22px 26px; }
.note-komorebi .basalt-header:hover { transform: scale(0.996); }
.note-komorebi .basalt-header-title { color: var(--k-accent); font-size: 1.55rem; letter-spacing: 0.08em; }
.note-komorebi .basalt-header-title::before { content: "> "; color: var(--k-muted); }
.note-komorebi .basalt-tagline { color: var(--k-muted); font-size: 0.72rem; letter-spacing: 0.04em; }
.note-komorebi .basalt-tagline::before { content: "// "; }
.note-komorebi .basalt-time { color: var(--k-text); font-size: 2.4rem; font-weight: 600; letter-spacing: 0.04em; }
.note-komorebi .basalt-date,
.note-komorebi .basalt-greeting { color: var(--k-muted); font-size: 0.68rem; }
.note-komorebi .basalt-header.has-image .basalt-date,
.note-komorebi .basalt-header.has-image .basalt-greeting { color: #e2deee; }
.note-komorebi .basalt-stat { border: 1px solid var(--k-border); border-radius: 3px; background: var(--k-overlay); }
.note-komorebi .basalt-stat:hover { border-color: var(--k-border-hover); }
.note-komorebi .basalt-stat-num { color: var(--k-text); font-size: 1.05rem; font-weight: 600; }
.note-komorebi .basalt-stat-label { color: var(--k-muted); font-size: 0.58rem; letter-spacing: 0.06em; }

/* Tiles that breathe when you point at them */
.note-komorebi .basalt-tiles { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
.note-komorebi .basalt-tile {
  position: relative;
  padding: 16px;
  border: 1px solid var(--k-border);
  border-radius: 7px;
  background: var(--k-overlay);
  background-image: radial-gradient(ellipse 100% 100% at 0% 0%, rgba(var(--k-glow), 0.055) 0%, transparent 70%), linear-gradient(145deg, transparent 40%, rgba(var(--k-deep), 0.2) 100%);
  transform-origin: center;
}
.note-komorebi .basalt-tile:hover {
  border-color: var(--k-border-hover);
  animation: komorebi-breathe 2.2s ease-in-out infinite;
}
.note-komorebi .basalt-tile::after {
  content: "";
  position: absolute;
  inset: -8px;
  border: 1px solid rgba(226, 228, 244, 0.22);
  border-radius: inherit;
  box-shadow: 0 0 16px rgba(var(--k-glow), 0.12);
  opacity: 0;
  pointer-events: none;
}
.note-komorebi .basalt-tile:hover::after { animation: komorebi-pop 0.52s cubic-bezier(.22, .8, .3, 1) 1; }
.note-komorebi .basalt-tile-art { height: 100px; border-radius: 3px; background: var(--k-raised); color: var(--k-accent); }
.note-komorebi .basalt-tile-name { color: var(--k-text); font-size: 0.85rem; font-weight: 600; }
.note-komorebi .basalt-tile-about { color: var(--k-muted); font-size: 0.65rem; }

/* Today's goal */
.note-komorebi .basalt-goal { color: var(--k-text); font-family: "Noto Sans JP", "Segoe UI", sans-serif; font-size: 1.1rem; line-height: 1.5; }

/* Quick actions */
.note-komorebi .basalt-action { border-color: var(--k-border); border-radius: 3px; background: var(--k-overlay); color: var(--k-muted); font-size: 0.6rem; }
.note-komorebi .basalt-action:hover { border-color: var(--k-accent); color: var(--k-text); animation: komorebi-bump 0.38s cubic-bezier(.22, .8, .3, 1) 1; }
.note-komorebi .basalt-action-icon { color: var(--k-accent-2); }

/* Calendar */
.note-komorebi .basalt-cal-month { color: var(--k-text); font-size: 0.72rem; }
.note-komorebi .basalt-cal-dow { color: var(--k-muted); font-size: 0.58rem; }
.note-komorebi .basalt-cal-day { color: var(--k-text); font-size: 0.66rem; border-radius: 3px; }
.note-komorebi .basalt-cal-day:hover { border-color: var(--k-border-hover); }
.note-komorebi .basalt-cal-day.has-note { color: var(--k-accent); }
.note-komorebi .basalt-cal-day.is-today { border-color: var(--k-accent); background: rgba(var(--k-glow), 0.12); }

/* Pomodoro */
.note-komorebi .basalt-timer-time { color: var(--k-text); font-size: 2.6rem; font-weight: 600; letter-spacing: 0.04em; }
.note-komorebi .basalt-timer-bar { background: var(--k-raised); }
.note-komorebi .basalt-timer-bar i { background: var(--k-accent); }
.note-komorebi .basalt-timer-status,
.note-komorebi .basalt-timer-count { color: var(--k-muted); }
.note-komorebi .basalt-timer-btn { border-color: var(--k-border); border-radius: 3px; background: var(--k-overlay); color: var(--k-text); }
.note-komorebi .basalt-timer-btn:hover { border-color: var(--k-accent); color: var(--k-accent); }

/* Habits, lists, capture */
.note-komorebi .basalt-habit-cell { border-radius: 2px; background: var(--k-overlay); outline: 1px solid var(--k-border); }
.note-komorebi .basalt-habit-cell.is-done { background: var(--k-accent); }
.note-komorebi .basalt-link { color: var(--k-text); text-decoration-color: rgba(var(--k-glow), 0.35); }
.note-komorebi .basalt-capture-input { border-color: var(--k-border); background: var(--k-overlay); color: var(--k-text); font-family: var(--k-font); font-size: 0.78rem; }
.note-komorebi .basalt-capture-input:focus { border-color: var(--k-accent); }
.note-komorebi .basalt-capture-btn { border-color: var(--k-border); border-radius: 3px; background: var(--k-overlay); color: var(--k-accent); font-family: var(--k-font); font-size: 0.7rem; }
.note-komorebi .basalt-card { border-color: var(--k-border); border-top-color: var(--card-color); background: var(--k-overlay); }

@keyframes komorebi-breathe {
  0%, 100% { transform: translateY(-1px) scale(1.012); box-shadow: 0 6px 16px rgba(var(--k-deep), 0.3); }
  50% { transform: translateY(-2px) scale(1.02); box-shadow: 0 8px 19px rgba(var(--k-deep), 0.36); }
}
@keyframes komorebi-pop {
  0% { opacity: 0; transform: scale(0.965); }
  35% { opacity: 0.2; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.028); }
}
@keyframes komorebi-bump {
  0% { transform: scale(1); }
  35% { transform: scale(1.09); }
  65% { transform: scale(0.985); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .note-komorebi .basalt-tile:hover,
  .note-komorebi .basalt-tile:hover::after,
  .note-komorebi .basalt-action:hover { animation: none; }
}
`;

/** The home dashboard, laid out like the original: header; goal and actions, tiles, calendar and timer; habits and capture. */
export const KOMOREBI_HOME = (colorway = "indigo") => `---
cssclass: dashboard komorebi ${colorway}
---
\`\`\`basalt
list: header
title: My Vault
text: notes, thoughts & things that matter
\`\`\`

\`\`\`basalt
columns: 220px 1fr 220px
==
title: today's goal
list: goal
text: do the work. trust the process.
--
title: system
list: actions
actions: today, search, graph, new-note, template, palette
==
title: collection
list: tiles
tile: Writing | ✍️
tile: Life | 🌿
tile: Organization | 🗂️
tile: Games | 🎮
==
title: calendar
list: calendar
--
title: pomodoro
list: timer
text: 25
\`\`\`

\`\`\`basalt
columns: 3fr 1fr
==
title: habits
list: habits
days: 7
==
title: quick capture
list: capture
to: Inbox
\`\`\`
`;

/** The writing dashboard: what you're writing, recent notes, projects as tiles, quick capture. */
export const KOMOREBI_WRITING = (colorway = "indigo") => `---
cssclass: dashboard komorebi ${colorway}
---
\`\`\`basalt
list: header
title: Writing
text: words, worlds & unfinished things
\`\`\`

\`\`\`basalt
columns: 2fr 1fr
==
title: currently writing
list: goal
text: The story is still unwritten. Define the scene, find the voice, keep going.
--
title: projects
list: tiles
tile: Novels | 📖 | Novels | long-form worlds
tile: Short stories | 📝 | Short stories | contained worlds
tile: Characters | 🎭 | Characters | voices & people
tile: Worldbuilding | 🗺️ | Worldbuilding | places, lore & history
tile: Ideas | 💡 | Ideas | fragments worth keeping
tile: Archive | 📦 | Archive | finished & shelved
==
title: notes in writing
from: Writing
sort: name
limit: 8
--
title: quick capture
list: capture
to: Writing Inbox
text: write down a thought before it disappears…
\`\`\`
`;
