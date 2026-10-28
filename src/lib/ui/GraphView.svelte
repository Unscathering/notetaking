<script lang="ts" module>
	import type { GraphNode as Dot } from "../graph";
	/** Where the dots were last time, so the layout is still there when you come back. */
	let kept: Map<string, Dot> | null = null;
	let keptView = { k: 1, x: 0, y: 0 };
</script>

<script lang="ts">
	// The graph view: every note a dot, every link a line, laid out by gentle
	// physics. Hover a dot to light up its neighbors, drag dots around, scroll
	// to zoom, drag the background to move. Click a dot to open the note.
	// Colors come from your folder colors and the theme.
	import { onMount } from "svelte";
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { Simulation, buildGraph, type GraphNode, type GraphOptions } from "../graph";
	import { ws } from "../workspace.svelte";
	import { theme } from "../theme/store.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();

	const KEY = "basalt.graph";
	function saved() {
		const base = { tags: false, orphans: true, missing: false, filter: "", local: false, depth: 2, repel: 380, distance: 70, center: 0.012, size: 1, labels: 1.1, arrows: false };
		try {
			return { ...base, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<typeof base>), filter: "" };
		} catch {
			return base;
		}
	}
	const opts = $state(saved());
	$effect(() => {
		try {
			localStorage.setItem(KEY, JSON.stringify(opts));
		} catch {
			// Not remembered this time.
		}
	});

	let canvas: HTMLCanvasElement;
	let wrap: HTMLDivElement;
	let panel = $state(false);
	// Raw, so it stays the very same dot object the drawing compares against.
	let hovered = $state.raw<GraphNode | null>(null);
	let count = $state({ notes: 0, links: 0 });

	/** The note the graph is about, for "around this note": the last note you had open. */
	let lastNote = $state<string | null>(ws.recent ?? ws.tabs.find((t) => !t.startsWith("basalt:")) ?? null);
	const focusNote = $derived(lastNote && ws.files.includes(lastNote) ? lastNote : null);

	let sim: Simulation | null = null;
	let view = { ...keptView };
	let neighbors = new Set<GraphNode>();
	let frame = 0;
	let reduced = false;

	// ---- Building ----

	function rebuild() {
		const old = sim ? new Map(sim.nodes.map((n) => [n.id, n])) : (kept ?? undefined);
		const o: GraphOptions = { tags: opts.tags, orphans: opts.orphans, missing: opts.missing, filter: opts.filter, around: opts.local ? focusNote : null, depth: opts.depth };
		const g = buildGraph(ws.texts, (t) => ws.resolve(t), o, old);
		const fresh = !sim && !kept;
		sim = new Simulation(g.nodes, g.links, { repel: opts.repel, distance: opts.distance, center: opts.center });
		count = { notes: g.nodes.filter((n) => n.kind === "note").length, links: g.links.length };
		if (fresh) {
			sim.alpha = 1;
			if (reduced) for (let i = 0; i < 300; i++) sim.tick();
		} else sim.alpha = 0.3;
		wake();
	}

	// The cave or the filters changed.
	$effect(() => {
		void ws.texts.size;
		void [...ws.texts.values()].length;
		void ws.files;
		void opts.tags, opts.orphans, opts.missing, opts.filter, opts.local, opts.depth, focusNote;
		rebuild();
	});

	// Sliders change the forces live.
	$effect(() => {
		const f = { repel: opts.repel, distance: opts.distance, center: opts.center };
		if (sim) {
			sim.forces = f;
			sim.heat(0.4);
			wake();
		}
	});

	// ---- Drawing ----

	let colors = { bg: "#000", text: "#ddd", muted: "#888", line: "#444", accent: "#f80", font: "sans-serif" };
	function readColors() {
		const s = getComputedStyle(document.documentElement);
		const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
		colors = { bg: v("--bg", "#16171a"), text: v("--text", "#ddd"), muted: v("--muted", "#888"), line: v("--border", "#444"), accent: v("--accent", "#f80"), font: v("--font-ui", "sans-serif") };
	}
	$effect(() => {
		void JSON.stringify(theme.colors);
		readColors();
		wake();
	});

	const folderColor = (n: GraphNode) => (n.kind === "tag" ? colors.accent : n.kind === "missing" ? colors.muted : (ws.meta.looks[n.folder]?.color || colors.muted));
	const radius = (n: GraphNode) => (n.kind === "tag" ? 4 : 5 + Math.sqrt(n.degree) * 2.2) * opts.size;

	function draw() {
		if (!sim || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth, h = canvas.clientHeight;
		if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
		}
		const ctx = canvas.getContext("2d")!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		ctx.translate(w / 2 + view.x, h / 2 + view.y);
		ctx.scale(view.k, view.k);
		const focus = hovered;
		let moving = false;
		// Ease each dot toward lit or faded.
		for (const n of sim.nodes) {
			const want = !focus || n === focus || neighbors.has(n) ? 1 : 0.12;
			const next = reduced ? want : n.glow + (want - n.glow) * 0.18;
			if (Math.abs(next - want) > 0.01) moving = true;
			n.glow = Math.abs(next - want) < 0.01 ? want : next;
		}
		// Lines.
		ctx.lineCap = "round";
		for (const l of sim.links) {
			const lit = focus && (l.source === focus || l.target === focus);
			const a = Math.min(l.source.glow, l.target.glow);
			ctx.globalAlpha = lit ? 0.95 : 0.32 * a + 0.04;
			ctx.strokeStyle = lit ? colors.accent : colors.muted;
			ctx.lineWidth = (lit ? 1.6 : 1) / Math.sqrt(view.k);
			ctx.beginPath();
			ctx.moveTo(l.source.x, l.source.y);
			ctx.lineTo(l.target.x, l.target.y);
			ctx.stroke();
			if (opts.arrows && !l.tag && view.k > 0.6) arrow(ctx, l.source, l.target);
		}
		// Dots.
		for (const n of sim.nodes) {
			const r = radius(n);
			ctx.globalAlpha = 0.25 + 0.75 * n.glow;
			if (n === focus) {
				ctx.shadowColor = colors.accent;
				ctx.shadowBlur = 18;
			}
			ctx.fillStyle = n === focus ? colors.accent : folderColor(n);
			ctx.beginPath();
			if (n.kind === "missing") {
				ctx.strokeStyle = colors.muted;
				ctx.lineWidth = 1.2 / view.k;
				ctx.arc(n.x, n.y, r * 0.8, 0, Math.PI * 2);
				ctx.stroke();
			} else {
				ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.shadowBlur = 0;
		}
		// Names: they fade in as you zoom, and always show for what's lit.
		const fadeIn = Math.max(0, Math.min(1, (view.k - opts.labels) / 0.35 + 1));
		ctx.font = `${12 / Math.max(view.k, 0.5)}px ${colors.font}`;
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		for (const n of sim.nodes) {
			const lit = focus && (n === focus || neighbors.has(n));
			const a = lit ? 1 : fadeIn * n.glow;
			if (a < 0.03) continue;
			ctx.globalAlpha = a;
			ctx.fillStyle = n === focus ? colors.text : lit ? colors.text : colors.muted;
			ctx.fillText(n.label, n.x, n.y + radius(n) + 4 / view.k);
		}
		ctx.globalAlpha = 1;
		return moving;
	}

	function arrow(ctx: CanvasRenderingContext2D, s: GraphNode, t: GraphNode) {
		const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy) || 1;
		const r = radius(t) + 2;
		const x = t.x - (dx / d) * r, y = t.y - (dy / d) * r;
		const size = 5 / Math.sqrt(view.k);
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x - (dx / d) * size - (dy / d) * size * 0.6, y - (dy / d) * size + (dx / d) * size * 0.6);
		ctx.lineTo(x - (dx / d) * size + (dy / d) * size * 0.6, y - (dy / d) * size - (dx / d) * size * 0.6);
		ctx.closePath();
		ctx.fillStyle = ctx.strokeStyle;
		ctx.fill();
	}

	/** The camera follows the whole graph until you zoom or move it yourself. */
	let follow = !kept;

	function fitTarget() {
		if (!sim?.nodes.length || !canvas) return null;
		let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
		for (const n of sim.nodes) {
			x0 = Math.min(x0, n.x);
			x1 = Math.max(x1, n.x);
			y0 = Math.min(y0, n.y);
			y1 = Math.max(y1, n.y);
		}
		const k = Math.min(2.5, Math.max(0.1, Math.min(canvas.clientWidth / (x1 - x0 + 160), canvas.clientHeight / (y1 - y0 + 160))));
		return { k, x: (-(x0 + x1) / 2) * k, y: (-(y0 + y1) / 2) * k };
	}

	/** Runs the animation while something is moving; sleeps when still. */
	function wake() {
		if (frame) return;
		const loop = () => {
			frame = 0;
			if (!sim) return;
			if (!sim.settled) sim.tick();
			let gliding = false;
			const t = follow ? fitTarget() : null;
			if (t) {
				const ease = reduced ? 1 : 0.08;
				view = { k: view.k + (t.k - view.k) * ease, x: view.x + (t.x - view.x) * ease, y: view.y + (t.y - view.y) * ease };
				gliding = Math.abs(t.k - view.k) > 0.002 || Math.abs(t.x - view.x) > 0.5;
				if (sim.settled && !gliding) follow = false;
			}
			const easing = draw();
			if (!sim.settled || easing || dragging || gliding) frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
	}

	// ---- Mouse ----

	let dragging: GraphNode | null = null;
	let panning: { x: number; y: number } | null = null;
	let downAt = { x: 0, y: 0 };
	let moved = false;

	function toWorld(e: { clientX: number; clientY: number }) {
		const r = canvas.getBoundingClientRect();
		return { x: (e.clientX - r.left - r.width / 2 - view.x) / view.k, y: (e.clientY - r.top - r.height / 2 - view.y) / view.k };
	}

	function hit(e: PointerEvent): GraphNode | null {
		if (!sim) return null;
		const p = toWorld(e);
		let best: GraphNode | null = null, bestD = Infinity;
		for (const n of sim.nodes) {
			const d = Math.hypot(n.x - p.x, n.y - p.y);
			if (d < radius(n) + 6 / view.k && d < bestD) {
				best = n;
				bestD = d;
			}
		}
		return best;
	}

	function setHover(n: GraphNode | null) {
		if (hovered === n) return;
		hovered = n;
		neighbors = new Set();
		if (n && sim) for (const l of sim.links) if (l.source === n) neighbors.add(l.target);
			else if (l.target === n) neighbors.add(l.source);
		canvas.style.cursor = n ? "pointer" : "grab";
		wake();
	}

	function down(e: PointerEvent) {
		canvas.setPointerCapture(e.pointerId);
		downAt = { x: e.clientX, y: e.clientY };
		moved = false;
		const n = hit(e);
		if (n) {
			dragging = n;
			n.fixed = true;
		} else {
			follow = false;
			panning = { x: e.clientX - view.x, y: e.clientY - view.y };
			canvas.style.cursor = "grabbing";
		}
	}

	function move(e: PointerEvent) {
		if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) moved = true;
		if (dragging && sim) {
			const p = toWorld(e);
			dragging.x = p.x;
			dragging.y = p.y;
			sim.heat(0.25);
			wake();
		} else if (panning) {
			view.x = e.clientX - panning.x;
			view.y = e.clientY - panning.y;
			wake();
		} else setHover(hit(e));
	}

	function up(e: PointerEvent) {
		const n = dragging;
		if (n) n.fixed = false;
		dragging = null;
		panning = null;
		canvas.style.cursor = hovered ? "pointer" : "grab";
		if (!moved && n && n.kind === "note") {
			lastNote = n.id;
			void ws.open(n.id);
		}
		if (!moved && n && n.kind === "tag") {
			ws.panel = "tags";
			ws.sidebarOpen = true;
		}
		void e;
	}

	function wheel(e: WheelEvent) {
		e.preventDefault();
		follow = false;
		const r = canvas.getBoundingClientRect();
		const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
		const k = Math.min(6, Math.max(0.1, view.k * Math.exp(-e.deltaY * 0.0015)));
		// Zoom around the mouse.
		view.x = mx - ((mx - view.x) * k) / view.k;
		view.y = my - ((my - view.y) * k) / view.k;
		view.k = k;
		wake();
	}

	/** Glides to show the whole graph. */
	function fit() {
		follow = true;
		wake();
	}

	onMount(() => {
		reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || theme.motion.style === "off";
		const ro = new ResizeObserver(() => wake());
		ro.observe(wrap);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(frame);
			if (sim) kept = new Map(sim.nodes.map((n) => [n.id, n]));
			keptView = view;
		};
	});
</script>

<div class="graph" bind:this={wrap}>
	<canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointerleave={() => !dragging && !panning && setHover(null)} onwheel={wheel} ondblclick={fit}></canvas>

	{#if hovered}
		<div class="hover" transition:fade={{ duration: ms / 2 }}>
			<b>{hovered.label}</b>
			<span>{hovered.kind === "tag" ? "Tag" : hovered.kind === "missing" ? "Not written yet" : hovered.id.replace(/\.md$/, "")} · {hovered.degree} {hovered.degree === 1 ? "link" : "links"}</span>
		</div>
	{/if}

	<div class="corner">
		<span class="count">{count.notes} notes · {count.links} links</span>
		<button class="tool" class:is-on={opts.local} disabled={!focusNote} onclick={() => (opts.local = !opts.local)} title={focusNote ? `Only notes near “${focusNote.replace(/\.md$/, "")}”` : "Open a note first"}>{@html icon("focus", 15)}</button>
		<button class="tool" onclick={fit} title="Fit everything (double-click)">{@html icon("collapse", 15)}</button>
		<button class="tool" class:is-on={panel} onclick={() => (panel = !panel)} title="Filters and forces">{@html icon("settings", 15)}</button>
	</div>

	{#if panel}
		<div class="panel" transition:fly={{ x: 12, duration: ms, easing: cubicOut }}>
			<input class="search" bind:value={opts.filter} placeholder="Filter by name or folder…" onkeydown={(e) => e.stopPropagation()} />
			<h4>Show</h4>
			<label><input type="checkbox" bind:checked={opts.tags} /> Tags</label>
			<label><input type="checkbox" bind:checked={opts.orphans} /> Notes with no links</label>
			<label><input type="checkbox" bind:checked={opts.missing} /> Links to notes not written yet</label>
			<label><input type="checkbox" bind:checked={opts.arrows} /> Arrows</label>
			{#if opts.local}
				<label class="slider">Steps away <span>{opts.depth}</span><input type="range" min="1" max="4" bind:value={opts.depth} /></label>
			{/if}
			<h4>Look</h4>
			<label class="slider">Dot size <input type="range" min="0.5" max="2.5" step="0.1" bind:value={opts.size} oninput={() => wake()} /></label>
			<label class="slider">Show names from <input type="range" min="0.3" max="2.5" step="0.1" bind:value={opts.labels} oninput={() => wake()} /></label>
			<h4>Forces</h4>
			<label class="slider">Push apart <input type="range" min="50" max="1500" step="10" bind:value={opts.repel} /></label>
			<label class="slider">Link length <input type="range" min="20" max="250" step="5" bind:value={opts.distance} /></label>
			<label class="slider">Pull to middle <input type="range" min="0" max="0.06" step="0.002" bind:value={opts.center} /></label>
			<button class="shake" onclick={() => { sim?.heat(1); wake(); }}>{@html icon("zap", 13)} Shake it up</button>
			<p class="hint">Folder colors come from the sidebar: right-click a folder to change its color.</p>
		</div>
	{/if}
</div>

<style>
	.graph {
		position: relative;
		height: 100%;
		overflow: hidden;
		background: radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--accent) 5%, transparent), transparent 60%);
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none;
	}
	.hover {
		position: absolute;
		left: 16px;
		bottom: 16px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 60%;
		padding: 8px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background-color: var(--surface-float);
		backdrop-filter: var(--float-filter);
		pointer-events: none;
	}
	.hover b {
		color: var(--heading);
		font-size: 13px;
	}
	.hover span {
		color: var(--muted);
		font-size: 11.5px;
	}
	.corner {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.count {
		margin-right: 6px;
		color: var(--muted);
		font-size: 11.5px;
	}
	.tool {
		display: inline-flex;
		padding: 7px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background-color: var(--surface-float);
		backdrop-filter: var(--float-filter);
		color: var(--muted);
		cursor: pointer;
		transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.tool:hover:not(:disabled),
	.tool.is-on {
		color: var(--accent);
		border-color: var(--accent);
	}
	.tool:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.panel {
		position: absolute;
		top: 54px;
		right: 12px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 240px;
		max-height: calc(100% - 70px);
		overflow-y: auto;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		box-shadow: var(--glass-edge), 0 14px 34px rgba(0, 0, 0, 0.3);
		font-size: 12.5px;
		color: var(--text);
	}
	h4 {
		margin: 8px 0 0;
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	label.slider {
		flex-wrap: wrap;
		justify-content: space-between;
	}
	label.slider input {
		width: 100%;
	}
	label span {
		color: var(--muted);
	}
	input[type="checkbox"],
	input[type="range"] {
		accent-color: var(--accent);
	}
	.search {
		padding: 6px 9px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
	}
	.search:focus {
		border-color: var(--accent);
	}
	.shake {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		margin-top: 8px;
		padding: 6px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.shake:hover {
		border-color: var(--accent);
	}
	.hint {
		margin: 6px 0 0;
		color: var(--muted);
		font-size: 11.5px;
		line-height: 1.45;
	}
</style>
