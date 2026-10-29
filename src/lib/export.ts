// Export and share: a note as a PDF (through the print window), as one web
// page that works anywhere (pictures built in), or a whole folder as a small
// website with working links between its pages.
//
// Notes are turned into HTML here: properties become the page's title and
// description, [[links]] become real links (between pages of an exported
// website) or plain words, ![[embeds]] are put in place, callouts, tags,
// pictures, boards and live blocks are drawn as they look in Basalt.
import { inDesktopApp, joinPath, noteTitle } from "./cave";
import { isBoardText, parseBoard } from "./board";
import { frontmatterRange, readProps } from "./notes";
import { parseSpec, runQuery } from "./query";
import { ws } from "./workspace.svelte";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Options {
	/** Where a link to another note goes; null means no link (plain words). */
	linkTo: (path: string) => string | null;
	/** Pictures as data: URLs, so a single page needs nothing else. */
	inlineImages: boolean;
	/** Where a picture lives, when not built in. */
	imageTo?: (path: string) => string;
}

async function dataUrl(path: string): Promise<string | null> {
	const url = await ws.cave?.fileUrl(path);
	if (!url) return null;
	const blob = await (await fetch(url)).blob();
	return new Promise((resolve) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => resolve(null);
		r.readAsDataURL(blob);
	});
}

/** One note's body as HTML. */
export async function noteHtml(path: string, opts: Options, depth = 0): Promise<{ title: string; description?: string; html: string }> {
	const { marked } = await import("marked");
	const raw = ws.texts.get(path) ?? (await ws.cave!.read(path));
	const props = readProps(raw);
	const title = noteTitle(path);
	if (isBoardText(raw)) {
		const board = parseBoard(raw);
		const cols = board.columns.map((c) => `<section class="column"><h3>${esc(c.name)}</h3>${c.cards.map((card) => `<div class="card${card.done ? " done" : ""}"><b>${esc(card.title)}</b>${card.description ? `<p>${esc(card.description)}</p>` : ""}${card.due ? `<small>due ${card.due}</small>` : ""}</div>`).join("")}</section>`).join("");
		return { title, html: `<div class="board">${cols}</div>` };
	}
	let text = raw.slice(frontmatterRange(raw)?.to ?? 0);
	// A first heading that just repeats the title is left out (the page has the title).
	text = text.replace(/^\s*#\s+(.+)\n/, (all, h: string) => (h.trim().toLowerCase() === title.toLowerCase() ? "" : all));

	// Live blocks, drawn once as they are now.
	text = text.replace(/```basalt\n([\s\S]*?)```/g, (_, source: string) => {
		const spec = parseSpec(source);
		const rows = runQuery(spec, ws.texts, (t) => ws.resolve(t), path);
		const head = spec.title ? `<p class="block-title">${esc(spec.title)}</p>` : "";
		if (spec.show === "count") return `\n<div class="block">${head}<p class="count">${rows.length}</p></div>\n`;
		const item = (r: (typeof rows)[number]) => {
			const to = r.path ? opts.linkTo(r.path) : null;
			const name = to ? `<a href="${esc(to)}">${esc(r.title)}</a>` : esc(r.title);
			return r.task ? `<li class="task${r.task.done ? " done" : ""}">${r.task.done ? "☑" : "☐"} ${name}${r.task.due ? ` <small>${r.task.due}</small>` : ""}</li>` : `<li>${name}${r.description ? ` <small>${esc(r.description)}</small>` : ""}</li>`;
		};
		return `\n<div class="block">${head}<ul>${rows.map(item).join("")}</ul></div>\n`;
	});

	// Embeds: the other note, in place (not too deep, in case notes embed each other).
	const embeds: Array<[string, string]> = [];
	for (const m of text.matchAll(/^!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]\s*$/gm)) {
		const target = ws.resolve(m[1].trim());
		const inner = target && depth < 2 ? (await noteHtml(target, opts, depth + 1)).html : `<p class="muted">${esc(m[1])}</p>`;
		embeds.push([m[0], `\n<div class="embed"><p class="embed-title">${esc(m[1].trim())}</p>${inner}</div>\n`]);
	}
	for (const [from, to] of embeds) text = text.replace(from, to);

	// [[Links]] and #tags.
	text = text.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) => {
		const found = ws.resolve(target.trim());
		const to = found ? opts.linkTo(found) : null;
		const words = esc(label ?? target.split("/").pop()!);
		return to ? `<a class="internal" href="${esc(to)}">${words}</a>` : `<span class="internal">${words}</span>`;
	});
	text = text.replace(/(^|[\s(])#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu, '$1<span class="tag">#$2</span>');

	let html = await marked.parse(text, { gfm: true, breaks: false });
	// Callouts: > [!note] Title
	html = html.replace(/<blockquote>\s*<p>\[!(\w+)\][+-]?\s*([^\n<]*)/g, (_, kind: string, head: string) => `<blockquote class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${head || kind[0].toUpperCase() + kind.slice(1)}</p><p>`);
	// Pictures from the cave.
	const pics = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]).filter((src) => !/^(https?:|data:)/.test(src));
	for (const src of new Set(pics)) {
		const path = decodeURIComponent(src);
		const to = opts.inlineImages ? await dataUrl(path) : (opts.imageTo?.(path) ?? null);
		if (to) html = html.split(`src="${src}"`).join(`src="${to}"`);
	}
	return { title, description: props.description, html };
}

/** The look of exported pages: the current theme's colors, or a light one for paper. */
function styles(print: boolean): string {
	const css = getComputedStyle(document.documentElement);
	const v = (name: string, light: string) => (print ? light : css.getPropertyValue(name).trim() || light);
	return `
:root { --bg: ${v("--bg", "#ffffff")}; --text: ${v("--text", "#1f2328")}; --muted: ${v("--muted", "#6b7280")}; --heading: ${v("--heading", "#111111")};
  --accent: ${css.getPropertyValue("--accent").trim() || "#e8794a"}; --link: ${print ? css.getPropertyValue("--accent").trim() || "#2563eb" : v("--link", "#2563eb")}; --border: ${v("--border", "#e5e7eb")}; --raised: ${v("--raised", "#f6f7f9")};
  --font: ${css.getPropertyValue("--font-editor").trim() || "Georgia, serif"}; --font-ui: ${css.getPropertyValue("--font-ui").trim() || "system-ui, sans-serif"}; --code-font: ${css.getPropertyValue("--font-code").trim() || "ui-monospace, monospace"}; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.7 var(--font); }
main { max-width: 760px; margin: 0 auto; padding: 56px 28px 80px; }
nav.site { max-width: 760px; margin: 0 auto; padding: 18px 28px 0; font: 13px var(--font-ui); }
nav.site a { color: var(--muted); text-decoration: none; }
h1, h2, h3, h4 { color: var(--heading); font-family: var(--font-ui); line-height: 1.25; }
h1.title { margin: 0 0 6px; font-size: 2.1em; letter-spacing: -0.02em; }
p.description { margin: 0 0 28px; color: var(--muted); font-style: italic; }
a { color: var(--link); }
a.internal, span.internal { text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--link) 40%, transparent); }
span.internal { color: var(--text); }
.tag { padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); font: 600 0.8em var(--font-ui); }
img { max-width: 100%; border-radius: 8px; }
pre, code { font-family: var(--code-font); font-size: 0.88em; }
pre { padding: 14px 16px; overflow-x: auto; border-radius: 8px; background: var(--raised); }
:not(pre) > code { padding: 1px 5px; border-radius: 4px; background: var(--raised); }
blockquote { margin: 1em 0; padding: 4px 18px; border-left: 3px solid var(--accent); color: var(--muted); }
blockquote.callout { color: var(--text); background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 0 8px 8px 0; }
.callout-title { font: 650 0.95em var(--font-ui); color: var(--accent); }
table { width: 100%; border-collapse: collapse; font-size: 0.92em; }
th, td { padding: 7px 12px; border: 1px solid var(--border); text-align: left; }
th { background: var(--raised); font-family: var(--font-ui); }
li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.3em; }
li > input[type="checkbox"] { margin-right: 8px; accent-color: var(--accent); }
hr { border: 0; border-top: 1px solid var(--border); margin: 2em 0; }
.embed { margin: 1.2em 0; padding: 8px 20px; border-left: 3px solid var(--accent); background: var(--raised); border-radius: 0 8px 8px 0; }
.embed-title, .block-title { margin: 6px 0; font: 650 0.85em var(--font-ui); color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.block { margin: 1.2em 0; padding: 6px 18px; border: 1px solid var(--border); border-radius: 10px; }
.block .count { font: 700 2.2em var(--font-ui); margin: 0; color: var(--accent); }
.block small, .muted { color: var(--muted); }
.task.done { color: var(--muted); text-decoration: line-through; }
.board { display: flex; gap: 14px; align-items: flex-start; overflow-x: auto; }
.column { flex: 0 0 230px; padding: 10px; border-radius: 10px; background: var(--raised); font-family: var(--font-ui); font-size: 14px; }
.column h3 { margin: 4px 4px 10px; font-size: 14px; }
.card { margin-bottom: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
.card p { margin: 4px 0 0; color: var(--muted); }
.card.done b { text-decoration: line-through; color: var(--muted); }
ul.index { padding: 0; list-style: none; font-family: var(--font-ui); }
ul.index li { padding: 8px 0; border-bottom: 1px solid var(--border); }
ul.index small { color: var(--muted); margin-left: 8px; }
footer { margin-top: 60px; color: var(--muted); font: 12px var(--font-ui); }
@media print { main { padding: 0; } a { color: inherit; } }
`;
}

function page(title: string, description: string | undefined, body: string, css: string, nav = ""): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ""}
<style>${css}</style>
</head>
<body>
${nav}
<main>
<h1 class="title">${esc(title)}</h1>
${description ? `<p class="description">${esc(description)}</p>` : ""}
${body}
<footer>Made with Basalt</footer>
</main>
</body>
</html>`;
}

/** Opens the print window for a note (where "Save as PDF" is one of the printers). */
export async function printNote(path: string) {
	const n = await noteHtml(path, { linkTo: () => null, inlineImages: true });
	const frame = document.createElement("iframe");
	frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
	document.body.append(frame);
	frame.srcdoc = page(n.title, n.description, n.html, styles(true));
	await new Promise((r) => (frame.onload = r));
	frame.contentWindow?.focus();
	frame.contentWindow?.print();
	setTimeout(() => frame.remove(), 60_000);
}

/** Saves a file the user picks a place for (or downloads it in a browser). */
async function saveAs(name: string, text: string, kind: { name: string; ext: string }) {
	if (inDesktopApp) {
		const { save } = await import("@tauri-apps/plugin-dialog");
		const to = await save({ defaultPath: name, filters: [{ name: kind.name, extensions: [kind.ext] }] });
		if (!to) return false;
		const { writeTextFile } = await import("@tauri-apps/plugin-fs");
		await writeTextFile(to, text);
		return true;
	}
	const a = document.createElement("a");
	a.href = URL.createObjectURL(new Blob([text], { type: "text/html" }));
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	return true;
}

/** One web page with everything in it, to send to anyone. */
export async function exportPage(path: string) {
	const n = await noteHtml(path, { linkTo: () => null, inlineImages: true });
	return saveAs(`${n.title}.html`, page(n.title, n.description, n.html, styles(false)), { name: "Web page", ext: "html" });
}

/** A folder's notes as a little website: one page each, links between them, and an index. Desktop app only. */
export async function exportSite(folder: string): Promise<string | null> {
	if (!inDesktopApp) throw new Error("Exporting a website is in the desktop app.");
	const { open } = await import("@tauri-apps/plugin-dialog");
	const fs = await import("@tauri-apps/plugin-fs");
	const picked = await open({ directory: true, title: "Pick a folder for the website" });
	if (!picked || Array.isArray(picked)) return null;
	const name = folder ? folder.split("/").pop()! : (ws.cave?.name ?? "Notes");
	const root = joinPath(String(picked).replace(/[\\/]+$/, ""), name.replace(/[\\/:*?"<>|]/g, "-"));
	const notes = ws.files.filter((p) => (folder === "" || p.startsWith(`${folder}/`)) && !p.startsWith("Templates/"));
	// Each note's page, by its path inside the folder: "Ideas/Garden plan.md" → "Ideas/Garden plan.html".
	const inside = (p: string) => (folder ? p.slice(folder.length + 1) : p);
	const pageOf = (p: string) => inside(p).replace(/\.md$/i, ".html");
	const rel = (from: string, to: string) => {
		const up = inside(from).split("/").length - 1;
		return "../".repeat(up) + to.split("/").map(encodeURIComponent).join("/");
	};
	const css = styles(false);
	const images = new Set<string>();
	await fs.mkdir(root, { recursive: true });
	for (const p of notes) {
		const n = await noteHtml(p, {
			linkTo: (to) => (notes.includes(to) ? rel(p, pageOf(to)) : null),
			inlineImages: false,
			imageTo: (img) => {
				images.add(img);
				return rel(p, img);
			},
		});
		const nav = `<nav class="site"><a href="${rel(p, "index.html")}">← ${esc(name)}</a></nav>`;
		const out = joinPath(root, pageOf(p));
		await fs.mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true });
		await fs.writeTextFile(out, page(n.title, n.description, n.html, css, nav));
	}
	// Pictures, copied next to the pages.
	for (const img of images) {
		const url = await ws.cave?.fileUrl(img);
		if (!url) continue;
		const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
		const out = joinPath(root, img);
		await fs.mkdir(out.slice(0, out.lastIndexOf("/")), { recursive: true });
		await fs.writeFile(out, bytes);
	}
	const list = notes
		.sort((a, b) => a.localeCompare(b))
		.map((p) => `<li><a class="internal" href="${pageOf(p).split("/").map(encodeURIComponent).join("/")}">${esc(noteTitle(p))}</a>${p.includes("/") && inside(p).includes("/") ? `<small>${esc(inside(p).split("/").slice(0, -1).join(" / "))}</small>` : ""}</li>`)
		.join("");
	await fs.writeTextFile(joinPath(root, "index.html"), page(name, `${notes.length} notes`, `<ul class="index">${list}</ul>`, css));
	return root;
}
