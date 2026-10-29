// The web clipper: a link in, a clean note out. The page is fetched (by the
// desktop app, since most sites don't let a window read them directly), its
// article is found the way Firefox's reader view does it (Readability), and
// turned into Markdown (Turndown). The note goes in the "Clippings" folder
// with where it came from, when, and the page's own description. Pictures
// stay as links to the web.
import { inDesktopApp } from "./cave";
import { writeProps, readProps } from "./notes";
import { ws } from "./workspace.svelte";

export const CLIP_FOLDER = "Clippings";

async function fetchPage(url: string): Promise<string> {
	if (inDesktopApp) {
		const { invoke } = await import("@tauri-apps/api/core");
		return invoke<string>("clip_fetch", { url });
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`The page said ${res.status}.`);
	return res.text();
}

export interface Clip {
	title: string;
	markdown: string;
	description?: string;
	byline?: string;
	site?: string;
}

/** Fetches a page and turns its article into Markdown. */
export async function clip(url: string): Promise<Clip> {
	const html = await fetchPage(url);
	const doc = new DOMParser().parseFromString(html, "text/html");
	// Links and pictures in the page point at the page's own site.
	const base = doc.createElement("base");
	base.href = url;
	doc.head.prepend(base);
	for (const a of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) a.setAttribute("href", a.href);
	for (const img of doc.querySelectorAll<HTMLImageElement>("img[src]")) img.setAttribute("src", img.src);
	const meta = (name: string) => doc.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content?.trim();
	const { Readability } = await import("@mozilla/readability");
	const article = new Readability(doc, { charThreshold: 300 }).parse();
	if (!article?.content) throw new Error("Couldn't find an article on that page.");
	const { default: Turndown } = await import("turndown");
	const td = new Turndown({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
	td.remove(["script", "style", "iframe", "form", "button"]);
	const markdown = td
		.turndown(article.content)
		// "-   item" and "1.  item" as people write them.
		.replace(/^(\s*)([-*+]|\d+\.)\s{2,}/gm, "$1$2 ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	const site = article.siteName || meta("og:site_name") || new URL(url).hostname.replace(/^www\./, "");
	// "How to Grow Tomatoes | Garden Weekly" → "How to Grow Tomatoes".
	let title = (article.title || meta("og:title") || new URL(url).hostname).trim();
	const parts = title.split(/\s+[|–—·-]\s+/);
	if (parts.length > 1 && parts.at(-1)!.length < parts[0].length) title = parts.slice(0, -1).join(" - ");
	return {
		title,
		markdown,
		description: (article.excerpt || meta("description") || meta("og:description"))?.replace(/\s+/g, " ").slice(0, 240),
		byline: article.byline?.trim() || undefined,
		site,
	};
}

/** Saves a clip as a note in Clippings and opens it. */
export async function saveClip(url: string, c: Clip, summary?: string): Promise<string | null> {
	if (!ws.cave) return null;
	const name = c.title.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Clipping";
	const today = new Date().toISOString().slice(0, 10);
	let body = `# ${c.title}\n\n`;
	body += `> From [${c.site}](${url})${c.byline ? ` · ${c.byline}` : ""} · clipped ${today}\n\n`;
	if (summary) body += `> [!summary] Summary\n${summary.trim().split("\n").map((l) => `> ${l}`).join("\n")}\n\n`;
	body += `${c.markdown}\n`;
	const props = readProps("");
	if (c.description) props.description = c.description;
	props.tags = ["clipping"];
	props.other.source = url;
	props.other.clipped = today;
	const path = await ws.cave.create(CLIP_FOLDER, name, writeProps(body, props));
	await ws.refresh();
	ws.openFolders.add(CLIP_FOLDER);
	await ws.open(path);
	return path;
}
