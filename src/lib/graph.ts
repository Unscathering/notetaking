// The graph of a cave: every note is a dot, every link a line. Also the little
// physics that lays it out: dots push each other away, links pull like
// springs, and a soft pull keeps everything near the middle. The layout
// settles by itself and wakes up again when you drag something.
import { noteTitle } from "./cave";
import { frontmatterRange, readProps } from "./notes";

export interface GraphNode {
	id: string;
	label: string;
	kind: "note" | "tag" | "missing";
	/** The top folder, for its color. */
	folder: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	/** Held in place while dragged. */
	fixed?: boolean;
	/** How many lines touch it. */
	degree: number;
	/** Shown highlighted (1) or faded (0), eased toward its target while drawing. */
	glow: number;
}

export interface GraphLink {
	source: GraphNode;
	target: GraphNode;
	/** A tag line rather than a note link. */
	tag?: boolean;
}

export interface GraphOptions {
	tags: boolean;
	orphans: boolean;
	/** Links to notes that don't exist yet. */
	missing: boolean;
	/** Only show notes whose path contains this. */
	filter: string;
	/** Just the notes within `depth` links of this one. */
	around?: string | null;
	depth: number;
}

/** The notes a note links to: [[wiki links]] and [text](note.md) links, as written. */
export function linksIn(text: string): string[] {
	const fm = frontmatterRange(text);
	const body = fm ? text.slice(fm.to) : text;
	const out: string[] = [];
	for (const m of body.matchAll(/!?\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)) out.push(m[1].trim());
	for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s]+\.md)(?:#[^)]*)?\)/gi)) out.push(decodeURIComponent(m[1]).replace(/\.md$/i, ""));
	return out;
}

/** The note's tags: in its properties and #written in the text. */
export function tagsIn(text: string): string[] {
	const fm = frontmatterRange(text);
	const body = fm ? text.slice(fm.to) : text;
	const inline = [...body.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1]).filter((t) => !/^\d+$/.test(t));
	return [...new Set([...readProps(text).tags, ...inline].map((t) => t.toLowerCase()))];
}

/** Builds the graph from the cave's notes. `old` keeps dots where they were. */
export function buildGraph(texts: Map<string, string>, resolve: (target: string) => string | null, opts: GraphOptions, old?: Map<string, GraphNode>): { nodes: GraphNode[]; links: GraphLink[] } {
	const nodes = new Map<string, GraphNode>();
	const links: GraphLink[] = [];
	const node = (id: string, kind: GraphNode["kind"], label: string, folder: string) => {
		let n = nodes.get(id);
		if (!n) {
			const was = old?.get(id);
			// New dots start near the middle, in a little spiral, so they bloom outward.
			const a = nodes.size * 2.399963, r = 12 * Math.sqrt(nodes.size + 1);
			n = { id, kind, label, folder, x: was?.x ?? Math.cos(a) * r, y: was?.y ?? Math.sin(a) * r, vx: 0, vy: 0, degree: 0, glow: was?.glow ?? 1 };
			nodes.set(id, n);
		}
		return n;
	};
	const seen = new Set<string>();
	const link = (a: GraphNode, b: GraphNode, tag?: boolean) => {
		const key = a.id < b.id ? `${a.id}\n${b.id}` : `${b.id}\n${a.id}`;
		if (a === b || seen.has(key)) return;
		seen.add(key);
		links.push({ source: a, target: b, tag });
		a.degree++;
		b.degree++;
	};
	const shown = [...texts.keys()].filter((p) => !p.startsWith("Templates/") && (!opts.filter || p.toLowerCase().includes(opts.filter.toLowerCase())));
	for (const path of shown) node(path, "note", noteTitle(path), path.includes("/") ? path.slice(0, path.indexOf("/")) : "");
	for (const path of shown) {
		const text = texts.get(path) ?? "";
		const from = nodes.get(path)!;
		for (const target of linksIn(text)) {
			const to = resolve(target);
			if (to && nodes.has(to)) link(from, nodes.get(to)!);
			else if (!to && opts.missing) link(from, node(`missing:${target.toLowerCase()}`, "missing", target.split("/").pop()!, ""));
		}
		if (opts.tags) for (const tag of tagsIn(text)) link(from, node(`tag:${tag}`, "tag", `#${tag}`, ""), true);
	}
	let list = [...nodes.values()];
	// Just the neighborhood of one note.
	if (opts.around && nodes.has(opts.around)) {
		const keep = new Set([opts.around]);
		let edge = [opts.around];
		for (let d = 0; d < opts.depth; d++) {
			const next: string[] = [];
			for (const l of links) {
				for (const [a, b] of [[l.source.id, l.target.id], [l.target.id, l.source.id]]) {
					if (edge.includes(a) && !keep.has(b)) {
						keep.add(b);
						next.push(b);
					}
				}
			}
			edge = next;
		}
		list = list.filter((n) => keep.has(n.id));
	}
	if (!opts.orphans) list = list.filter((n) => n.degree > 0 || n.id === opts.around);
	const kept = new Set(list);
	return { nodes: list, links: links.filter((l) => kept.has(l.source) && kept.has(l.target)) };
}

// ---- The physics ----

export interface Forces {
	/** How hard dots push apart. */
	repel: number;
	/** How long links like to be. */
	distance: number;
	/** How strongly everything is pulled to the middle. */
	center: number;
}

export class Simulation {
	alpha = 1;

	constructor(
		public nodes: GraphNode[],
		public links: GraphLink[],
		public forces: Forces
	) {}

	/** Wakes the layout up (after a drag or a change). */
	heat(to = 0.3) {
		this.alpha = Math.max(this.alpha, to);
	}

	get settled() {
		return this.alpha < 0.002;
	}

	tick() {
		const { nodes, links, forces } = this;
		const a = this.alpha;
		const n = nodes.length;
		// Dots push apart (every pair; for big caves, a sample of pairs each tick).
		const step = n > 1200 ? Math.ceil(n / 600) : 1;
		const offset = Math.floor(Math.random() * step);
		for (let i = 0; i < n; i++) {
			const p = nodes[i];
			for (let j = i + 1 + ((offset + i) % step); j < n; j += step) {
				const q = nodes[j];
				let dx = q.x - p.x, dy = q.y - p.y;
				let d2 = dx * dx + dy * dy;
				if (d2 < 0.01) {
					dx = Math.random() - 0.5;
					dy = Math.random() - 0.5;
					d2 = 0.25;
				}
				if (d2 > 640_000) continue;
				const f = (forces.repel * step * a) / d2;
				p.vx -= dx * f;
				p.vy -= dy * f;
				q.vx += dx * f;
				q.vy += dy * f;
			}
		}
		// Links pull like springs; busy dots move less.
		for (const l of links) {
			const s = l.source, t = l.target;
			const dx = t.x + t.vx - s.x - s.vx, dy = t.y + t.vy - s.y - s.vy;
			const d = Math.sqrt(dx * dx + dy * dy) || 1;
			const want = l.tag ? forces.distance * 0.7 : forces.distance;
			const k = ((d - want) / d) * a * 0.6;
			const bias = s.degree / (s.degree + t.degree);
			t.vx -= dx * k * bias;
			t.vy -= dy * k * bias;
			s.vx += dx * k * (1 - bias);
			s.vy += dy * k * (1 - bias);
		}
		for (const p of nodes) {
			// A soft pull to the middle keeps loose dots from drifting away.
			// Notes with no links get a stronger pull, so they float nearby instead of drifting off.
			const pull = forces.center * a * (p.degree === 0 ? 6 : 1);
			p.vx -= p.x * pull;
			p.vy -= p.y * pull;
			if (p.fixed) {
				p.vx = p.vy = 0;
				continue;
			}
			p.vx *= 0.6;
			p.vy *= 0.6;
			p.x += p.vx;
			p.y += p.vy;
		}
		this.alpha += (0 - this.alpha) * 0.0228;
	}
}
