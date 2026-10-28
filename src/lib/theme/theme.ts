// A theme is every look-and-feel choice in one small object. The app reads all
// of its colors, fonts, sizes, corners and motion from CSS variables set here,
// so changing a value restyles everything at once, with no CSS needed.
import { mediaUrl } from "./media.svelte";

export type MotionStyle = "smooth" | "snappy" | "bouncy" | "off";
/** What the panels are made of. */
export type Material = "solid" | "clear" | "glass" | "frosted" | "liquid";
/** Where a folder's color shows in the sidebar. */
export type FolderColorOn = "icon" | "name" | "both" | "row";
export type HeadingStyle = "plain" | "underline" | "bar" | "accent" | "gradient" | "caps";

export interface Theme {
	name: string;
	colors: {
		/** The window behind everything. */
		bg: string;
		/** The sidebar and other side panels. */
		panel: string;
		/** Raised things: menus, cards, the active tab. */
		raised: string;
		border: string;
		text: string;
		muted: string;
		accent: string;
		/** Text drawn on top of the accent color. */
		onAccent: string;
		heading: string;
		link: string;
		code: string;
	};
	type: {
		uiFont: string;
		editorFont: string;
		codeFont: string;
		/** Editor text size in pixels. */
		size: number;
		lineHeight: number;
		/** Widest the text column gets, in characters; 0 fills the pane. */
		width: number;
		headingScale: number;
	};
	headings: {
		style: HeadingStyle;
		/** Empty means the same font as the note. */
		font: string;
		weight: number;
	};
	shape: {
		/** Corner rounding in pixels. */
		radius: number;
		/** Multiplies every gap and padding. */
		density: number;
		sidebarWidth: number;
		/** Banner images at the top of notes, in pixels. */
		bannerHeight: number;
	};
	background: {
		kind: "none" | "wallpaper" | "image" | "video";
		/** One of WALLPAPERS when kind is "wallpaper". */
		wallpaper: string;
		/** An older picture of your own, stored inside the theme itself. */
		image: string;
		/** A picture, GIF or video of your own, kept on this computer (see media.svelte.ts). */
		media: string;
		/** Whether `media` is a still or animated picture, or a video. */
		mediaKind: "image" | "video";
		/** Blur in pixels. */
		blur: number;
		/** 0 to 100: how much the theme's background color is laid over the picture. */
		fade: number;
	};
	glass: {
		material: Material;
		/** 0 to 100: how much panel color covers what's behind (less is more see-through). */
		tint: number;
		/** Blur in pixels for glass and frosted glass. */
		blur: number;
		/** The note page's own see-through amount, 0 to 100 (100 is solid). */
		page: number;
		/** Panels float as rounded islands with gaps between them. */
		floating: boolean;
		/** No lines between the sidebar, command bar and note: one seamless sheet. */
		seamless: boolean;
	};
	sidebar: {
		/** The little colored tab beside the active button in the command bar. */
		marker: boolean;
		/** Arrows beside folders. */
		arrows: boolean;
		/** "always": every folder shows a folder icon; "custom": only icons you picked; "none": no folder icons. */
		folderIcons: "always" | "custom" | "none";
		/** A small page icon beside every note. */
		fileIcons: boolean;
		/** Lines down the inside of open folders. */
		guides: boolean;
		colorOn: FolderColorOn;
		/** How many notes are inside each folder. */
		counts: boolean;
		folderWeight: number;
		/** Text size in pixels. */
		size: number;
		/** How far each level steps in, in pixels. */
		indent: number;
	};
	motion: {
		/** 1 is normal; higher is faster. */
		speed: number;
		style: MotionStyle;
	};
}

const SANS = `"Inter", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`;
const SERIF = `"Iowan Old Style", "Charter", Georgia, serif`;
const MONO = `"JetBrains Mono", "Cascadia Code", Consolas, monospace`;

export const FONT_CHOICES: Record<string, string> = {
	"Clean sans": SANS,
	"Book serif": SERIF,
	"Classic": `"Palatino Linotype", "Book Antiqua", Palatino, serif`,
	"Modern": `"Bahnschrift", "DIN Alternate", "Segoe UI", sans-serif`,
	"Rounded": `"Nunito", "Segoe UI", system-ui, sans-serif`,
	"Elegant": `"Cambria", "Constantia", Georgia, serif`,
	"Monospace": MONO,
	"Typewriter": `"Courier New", Courier, monospace`,
	"System": "system-ui, sans-serif",
};

/** Built-in background pictures, drawn with soft color blobs so they cost almost nothing. */
export const WALLPAPERS: Record<string, { name: string; css: string; light?: boolean }> = {
	aurora: { name: "Aurora", css: "radial-gradient(at 18% 22%, #1fd1a5 0, transparent 46%), radial-gradient(at 82% 12%, #7b3fe4 0, transparent 50%), radial-gradient(at 60% 88%, #1677d8 0, transparent 52%), radial-gradient(at 8% 92%, #0b8a7a 0, transparent 40%), #070b1a" },
	nebula: { name: "Nebula", css: "radial-gradient(at 25% 30%, #c2348f 0, transparent 45%), radial-gradient(at 75% 70%, #4a2bd6 0, transparent 50%), radial-gradient(at 85% 15%, #e0679b 0, transparent 35%), radial-gradient(at 15% 85%, #2b1b6e 0, transparent 50%), #0c0718" },
	dusk: { name: "Dusk", css: "radial-gradient(at 20% 85%, #ff8a3d 0, transparent 50%), radial-gradient(at 80% 75%, #e2466e 0, transparent 50%), radial-gradient(at 50% 10%, #4b2a8c 0, transparent 60%), radial-gradient(at 95% 20%, #26205e 0, transparent 45%), #1a1030" },
	ocean: { name: "Ocean", css: "radial-gradient(at 15% 20%, #0fb5c9 0, transparent 45%), radial-gradient(at 80% 30%, #1d5fd1 0, transparent 50%), radial-gradient(at 45% 95%, #0b3f7a 0, transparent 55%), radial-gradient(at 95% 90%, #12a39a 0, transparent 40%), #04121f" },
	forest: { name: "Forest", css: "radial-gradient(at 20% 25%, #3f9b5a 0, transparent 45%), radial-gradient(at 80% 80%, #1f6b4a 0, transparent 50%), radial-gradient(at 75% 15%, #a3b84a 0, transparent 35%), radial-gradient(at 10% 90%, #144a33 0, transparent 50%), #08140e" },
	ember: { name: "Ember", css: "radial-gradient(at 25% 80%, #ff5a1f 0, transparent 45%), radial-gradient(at 75% 25%, #b3122e 0, transparent 50%), radial-gradient(at 90% 85%, #ffb03a 0, transparent 35%), radial-gradient(at 10% 15%, #4a0c18 0, transparent 50%), #140608" },
	graphite: { name: "Graphite", css: "radial-gradient(at 20% 20%, #4a4f5c 0, transparent 50%), radial-gradient(at 80% 80%, #2c3038 0, transparent 55%), radial-gradient(at 85% 15%, #6b6f7a 0, transparent 35%), #111216" },
	bloom: { name: "Bloom", light: true, css: "radial-gradient(at 15% 20%, #ffb3c7 0, transparent 45%), radial-gradient(at 85% 25%, #ffd6a5 0, transparent 45%), radial-gradient(at 50% 90%, #c9b6ff 0, transparent 50%), radial-gradient(at 90% 90%, #ffc2e2 0, transparent 40%), #fff4f2" },
	lilac: { name: "Lilac", light: true, css: "radial-gradient(at 20% 30%, #c8b6ff 0, transparent 45%), radial-gradient(at 80% 20%, #b8d8ff 0, transparent 45%), radial-gradient(at 60% 90%, #f1c6ff 0, transparent 50%), #f6f2ff" },
	sky: { name: "Sky", light: true, css: "radial-gradient(at 15% 15%, #9fd8ff 0, transparent 45%), radial-gradient(at 85% 30%, #b9c8ff 0, transparent 45%), radial-gradient(at 40% 95%, #a6f0e0 0, transparent 50%), radial-gradient(at 95% 95%, #ffe0b3 0, transparent 35%), #f1f7ff" },
	meadow: { name: "Meadow", light: true, css: "radial-gradient(at 20% 25%, #c4ef9f 0, transparent 45%), radial-gradient(at 80% 20%, #fff2a8 0, transparent 40%), radial-gradient(at 55% 95%, #9fe3c4 0, transparent 50%), #f5fbef" },
	sunrise: { name: "Sunrise", light: true, css: "radial-gradient(at 20% 90%, #ffc48a 0, transparent 50%), radial-gradient(at 85% 80%, #ff9fb0 0, transparent 45%), radial-gradient(at 50% 5%, #a9c9ff 0, transparent 55%), #fff6ec" },
};

interface PresetBits {
	type?: Partial<Theme["type"]>;
	headings?: Partial<Theme["headings"]>;
	shape?: Partial<Theme["shape"]>;
	background?: Partial<Theme["background"]>;
	glass?: Partial<Theme["glass"]>;
	sidebar?: Partial<Theme["sidebar"]>;
	motion?: Partial<Theme["motion"]>;
}

export const DEFAULT_SIDEBAR: Theme["sidebar"] = { marker: false, arrows: true, folderIcons: "custom", fileIcons: false, guides: true, colorOn: "both", counts: false, folderWeight: 600, size: 14, indent: 14 };

/** Ready-made sidebar looks for the Sidebar page. */
export const SIDEBAR_STYLES: Array<{ name: string; about: string; looks: Theme["sidebar"] }> = [
	{ name: "Classic", about: "Arrows, colored folder names and guide lines.", looks: DEFAULT_SIDEBAR },
	{ name: "Minimal", about: "Just a colored folder icon and a quiet name.", looks: { ...DEFAULT_SIDEBAR, arrows: false, folderIcons: "always", guides: false, colorOn: "icon", folderWeight: 400, size: 13.5 } },
	{ name: "Outline", about: "Folder and page icons, like a file explorer.", looks: { ...DEFAULT_SIDEBAR, folderIcons: "always", fileIcons: true, colorOn: "icon", folderWeight: 500, guides: true } },
	{ name: "Bold", about: "Big tinted rows you can't miss, with counts.", looks: { ...DEFAULT_SIDEBAR, folderIcons: "always", colorOn: "row", counts: true, folderWeight: 650, size: 14.5, guides: false } },
];

const base = (name: string, colors: Theme["colors"], bits: PresetBits = {}): Theme => ({
	name,
	colors,
	type: { uiFont: SANS, editorFont: SANS, codeFont: MONO, size: 16, lineHeight: 1.65, width: 72, headingScale: 1.25, ...bits.type },
	headings: { style: "plain", font: "", weight: 700, ...bits.headings },
	shape: { radius: 8, density: 1, sidebarWidth: 260, bannerHeight: 220, ...bits.shape },
	background: { kind: "none", wallpaper: "aurora", image: "", media: "", mediaKind: "image", blur: 0, fade: 30, ...bits.background },
	glass: { material: "solid", tint: 70, blur: 18, page: 100, floating: false, seamless: false, ...bits.glass },
	sidebar: { ...DEFAULT_SIDEBAR, ...bits.sidebar },
	motion: { speed: 1, style: "smooth", ...bits.motion },
});

/** Where each material starts when you pick it. */
export const GLASS_DEFAULTS: Record<Material, { material: Material; tint: number; blur: number; page: number }> = {
	solid: { material: "solid", tint: 100, blur: 0, page: 100 },
	clear: { material: "clear", tint: 12, blur: 0, page: 10 },
	glass: { material: "glass", tint: 45, blur: 16, page: 55 },
	frosted: { material: "frosted", tint: 55, blur: 34, page: 60 },
	liquid: { material: "liquid", tint: 35, blur: 6, page: 55 },
};

/** A glass theme over one of the built-in wallpapers. */
const glassy = (name: string, colors: Theme["colors"], wallpaper: string, material: Material, bits: PresetBits = {}) =>
	base(name, colors, {
		...bits,
		background: { kind: "wallpaper", wallpaper, blur: 0, fade: 25, ...bits.background },
		glass: { ...GLASS_DEFAULTS[material], floating: material === "liquid", seamless: material === "clear", ...bits.glass },
		shape: { radius: material === "liquid" ? 14 : 10, ...bits.shape },
	});

export type PresetGroup = "Dark" | "Light" | "Glass";

export const PRESETS: Array<Theme & { group: PresetGroup }> = [
	// Dark
	["Basalt", { bg: "#16171a", panel: "#1c1d21", raised: "#25262b", border: "#2e3036", text: "#e6e4df", muted: "#8b8d94", accent: "#e8794a", onAccent: "#1a0d06", heading: "#f3efe8", link: "#f09a6e", code: "#c9b59a" }],
	["Midnight", { bg: "#0d1020", panel: "#121630", raised: "#1a1f40", border: "#252b52", text: "#dfe4ff", muted: "#7d86b8", accent: "#7c8cff", onAccent: "#0b0d1f", heading: "#ffffff", link: "#9aa8ff", code: "#9fd3ff" }],
	["Moss", { bg: "#141a16", panel: "#18201b", raised: "#202a23", border: "#2a362d", text: "#dde6dc", muted: "#86968a", accent: "#7fc48b", onAccent: "#0c1a0f", heading: "#eef6ec", link: "#9bd8a4", code: "#c6d8a0" }],
	["Nightshade", { bg: "#17141f", panel: "#1d1928", raised: "#272235", border: "#332c45", text: "#ece6f7", muted: "#9488ad", accent: "#c792ea", onAccent: "#1a0f24", heading: "#ffffff", link: "#d7a8f5", code: "#f1c27d" }, { headings: { style: "accent" } }],
	["Rosewood", { bg: "#191724", panel: "#1f1d2e", raised: "#26233a", border: "#332f4a", text: "#e0def4", muted: "#908caa", accent: "#ebbcba", onAccent: "#26172a", heading: "#f6c9c7", link: "#9ccfd8", code: "#f6c177" }, { type: { editorFont: SERIF } }],
	["Fjord", { bg: "#2e3440", panel: "#323946", raised: "#3b4252", border: "#434c5e", text: "#e5e9f0", muted: "#8f9bb3", accent: "#88c0d0", onAccent: "#1c2430", heading: "#eceff4", link: "#81a1c1", code: "#a3be8c" }],
	["Mocha", { bg: "#1e1e2e", panel: "#232336", raised: "#2c2c42", border: "#383852", text: "#cdd6f4", muted: "#8a8fae", accent: "#cba6f7", onAccent: "#1e1530", heading: "#f5e0dc", link: "#89b4fa", code: "#a6e3a1" }, { headings: { style: "gradient" } }],
	["Ember", { bg: "#171110", panel: "#1d1513", raised: "#271c19", border: "#362620", text: "#f1e4dc", muted: "#a08b80", accent: "#ff7a45", onAccent: "#210b03", heading: "#ffe9dc", link: "#ffa071", code: "#ffcf70" }, { headings: { style: "bar" } }],
	["Abyss", { bg: "#071318", panel: "#0b1a21", raised: "#11242d", border: "#18313d", text: "#d6eef2", muted: "#6f949e", accent: "#3fc1c9", onAccent: "#04161a", heading: "#ffffff", link: "#6fd6dc", code: "#9fe0b0" }],
	["Carbon", { bg: "#0b0b0c", panel: "#111113", raised: "#19191c", border: "#26262a", text: "#ededed", muted: "#7c7c82", accent: "#f2f2f2", onAccent: "#0b0b0c", heading: "#ffffff", link: "#d0d0d0", code: "#b8b8b8" }, { headings: { style: "caps" }, shape: { radius: 4 } }],
	// Light
	["Paper", { bg: "#faf8f3", panel: "#f2efe7", raised: "#ffffff", border: "#e2ddd1", text: "#2b2924", muted: "#8a857a", accent: "#c4572a", onAccent: "#ffffff", heading: "#1a1814", link: "#b04a20", code: "#7a5a3a" }, { type: { editorFont: SERIF, size: 17 } }],
	["Frost", { bg: "#f4f7fb", panel: "#eaeff6", raised: "#ffffff", border: "#d8e0ea", text: "#1f2733", muted: "#77839a", accent: "#2f7de1", onAccent: "#ffffff", heading: "#0f1722", link: "#2369c4", code: "#5a4fb0" }],
	["Latte", { bg: "#eff1f5", panel: "#e6e9ef", raised: "#ffffff", border: "#d3d7e0", text: "#4c4f69", muted: "#8c8fa1", accent: "#8839ef", onAccent: "#ffffff", heading: "#2f3147", link: "#1e66f5", code: "#40a02b" }, { headings: { style: "underline" } }],
	["Sakura", { bg: "#fff7f8", panel: "#fcecef", raised: "#ffffff", border: "#f3d6dc", text: "#3d2a30", muted: "#a08088", accent: "#e4578b", onAccent: "#ffffff", heading: "#2a1a1f", link: "#d0446f", code: "#9a5fb0" }, { type: { uiFont: `"Nunito", "Segoe UI", system-ui, sans-serif` }, shape: { radius: 12 } }],
	["Solar", { bg: "#fdf6e3", panel: "#f5eed8", raised: "#fffbef", border: "#e6dcc0", text: "#4a5a60", muted: "#93a1a1", accent: "#b58900", onAccent: "#ffffff", heading: "#073642", link: "#268bd2", code: "#cb4b16" }, { type: { editorFont: `"Palatino Linotype", "Book Antiqua", Palatino, serif` } }],
	["Sage", { bg: "#f3f6f1", panel: "#e9eee5", raised: "#ffffff", border: "#d6dfd0", text: "#2c3a2e", muted: "#7f8f80", accent: "#4f8a5b", onAccent: "#ffffff", heading: "#1b2a1e", link: "#3c7a49", code: "#8a6a2f" }, { headings: { style: "bar" } }],
	["Linen", { bg: "#ffffff", panel: "#f6f6f5", raised: "#ffffff", border: "#e7e7e4", text: "#242424", muted: "#8b8b88", accent: "#111111", onAccent: "#ffffff", heading: "#000000", link: "#333333", code: "#6b6b6b" }, { headings: { style: "caps" }, shape: { radius: 4 } }],
	// Glass
	["Aurora Glass", { bg: "#0b1224", panel: "#111a33", raised: "#18223f", border: "#2a3a5e", text: "#e6efff", muted: "#93a3c4", accent: "#4be1b8", onAccent: "#04180f", heading: "#ffffff", link: "#7cecd0", code: "#b9a4ff" }, "aurora", "liquid"],
	["Nebula Liquid", { bg: "#120b22", panel: "#1a1030", raised: "#24183f", border: "#3d2d63", text: "#f1e8ff", muted: "#a796c8", accent: "#ff6fb5", onAccent: "#26061a", heading: "#ffffff", link: "#ff9ccc", code: "#9ec5ff" }, "nebula", "liquid", { headings: { style: "gradient" } }],
	["Dusk Frost", { bg: "#1b1230", panel: "#22183d", raised: "#2b1f4b", border: "#43346b", text: "#fbeef0", muted: "#bfa6c0", accent: "#ff9a55", onAccent: "#2a1200", heading: "#ffffff", link: "#ffb98a", code: "#ffd27a" }, "dusk", "frosted"],
	["Ocean Glass", { bg: "#06182a", panel: "#0b2238", raised: "#102b46", border: "#1e4466", text: "#e0f2ff", muted: "#86a8c2", accent: "#34c6e0", onAccent: "#021820", heading: "#ffffff", link: "#6fd7ea", code: "#8fe3c0" }, "ocean", "glass"],
	["Forest Frost", { bg: "#0b1710", panel: "#102016", raised: "#16291d", border: "#24402e", text: "#e3f1e5", muted: "#8fae96", accent: "#b9d665", onAccent: "#141b02", heading: "#ffffff", link: "#cbe38a", code: "#8fd4b0" }, "forest", "frosted"],
	["Bloom Frost", { bg: "#fff4f3", panel: "#ffffff", raised: "#ffffff", border: "#f1d5da", text: "#3b2830", muted: "#9a7f88", accent: "#e0567f", onAccent: "#ffffff", heading: "#2a1820", link: "#c9406a", code: "#8f5bb0" }, "bloom", "frosted", { shape: { radius: 14 } }],
	["Lilac Liquid", { bg: "#f6f2ff", panel: "#ffffff", raised: "#ffffff", border: "#ddd3f3", text: "#2e2944", muted: "#8a83a6", accent: "#7a5cf0", onAccent: "#ffffff", heading: "#1c1730", link: "#6447d8", code: "#c0508f" }, "lilac", "liquid"],
	["Night Clear", { bg: "#0d0f1a", panel: "#141726", raised: "#1c2033", border: "#2c3150", text: "#e9ecf8", muted: "#9aa1c2", accent: "#9db4ff", onAccent: "#0b0f24", heading: "#ffffff", link: "#b8c8ff", code: "#c8b8ff" }, "nebula", "clear", { background: { fade: 40, blur: 2 }, sidebar: { arrows: false, folderIcons: "always", guides: false, colorOn: "icon", folderWeight: 400, size: 13.5 }, type: { codeFont: MONO } }],
	["Sky Glass", { bg: "#f1f7ff", panel: "#ffffff", raised: "#ffffff", border: "#d3e2f5", text: "#1e2b3c", muted: "#7b8ba1", accent: "#1f8ef1", onAccent: "#ffffff", heading: "#0d1826", link: "#1677d2", code: "#2c9a7a" }, "sky", "glass"],
].map((row, i) => {
	const group: PresetGroup = i < 10 ? "Dark" : i < 17 ? "Light" : "Glass";
	const [name, colors, a, b, c] = row as [string, Theme["colors"], unknown, unknown, unknown];
	const t = typeof a === "string" ? glassy(name, colors, a, b as Material, c as PresetBits | undefined) : base(name, colors, a as PresetBits | undefined);
	return { ...t, group };
});

const { group: _group, ...first } = PRESETS[0];
export const DEFAULT_THEME: Theme = first;

/** How each motion style moves: a timing curve and a base length. */
export const EASING: Record<MotionStyle, { ease: string; ms: number }> = {
	smooth: { ease: "cubic-bezier(0.22, 1, 0.36, 1)", ms: 260 },
	snappy: { ease: "cubic-bezier(0.2, 0, 0, 1)", ms: 150 },
	bouncy: { ease: "cubic-bezier(0.34, 1.56, 0.64, 1)", ms: 380 },
	off: { ease: "linear", ms: 0 },
};

/** Base animation length in milliseconds after speed; 0 when motion is off. */
export const motionMs = (t: Theme) => (t.motion.style === "off" ? 0 : Math.round(EASING[t.motion.style].ms / Math.max(0.25, t.motion.speed)));

const pct = (n: number) => `${Math.round(Math.min(100, Math.max(0, n)))}%`;
const mix = (color: string, amount: number) => (amount >= 100 ? color : `color-mix(in srgb, ${color} ${pct(amount)}, transparent)`);
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** The background picture as CSS, or "none" (videos are drawn separately). */
export function wallpaperCss(t: Theme): string {
	const b = t.background;
	if (b.kind === "wallpaper") return WALLPAPERS[b.wallpaper]?.css ?? "none";
	if (b.kind === "image") {
		const url = b.media ? mediaUrl(b.media) : b.image;
		return url ? `url("${url}") center / cover no-repeat` : "none";
	}
	return "none";
}

/** Whether something sits behind the panels: a picture, GIF or video. */
export const hasBackground = (t: Theme) => t.background.kind === "video" ? !!t.background.media : wallpaperCss(t) !== "none";

/** Every CSS variable a theme sets. Also used to paint the little theme pictures. */
export function themeVars(t: Theme): Record<string, string> {
	const c = t.colors, g = t.glass;
	const light = isLight(t);
	const see = hasBackground(t);
	const solid = g.material === "solid";
	// How much panel color covers what's behind; solid panels cover it all.
	const tint = solid ? 100 : g.tint;
	const shine = "255,255,255";
	const filters: Record<Material, string> = {
		solid: "none",
		clear: g.blur > 0 ? `blur(${g.blur}px)` : "none",
		glass: `blur(${g.blur}px) saturate(1.3)`,
		frosted: `blur(${g.blur}px) saturate(1.6) brightness(${light ? 1.04 : 1.08})`,
		liquid: `url(#basalt-liquid) blur(${Math.max(1, g.blur * 0.25)}px) saturate(1.9) brightness(${light ? 1.05 : 1.12})`,
	};
	const edges: Record<Material, string> = {
		solid: "0 0 0 transparent",
		clear: "0 0 0 transparent",
		glass: `inset 0 1px 0 rgba(${shine},${light ? 0.6 : 0.08})`,
		frosted: `inset 0 1px 0 rgba(${shine},${light ? 0.7 : 0.14}), inset 0 0 0 1px rgba(${shine},${light ? 0.35 : 0.05})`,
		liquid: `inset 1.5px 1.5px 0 -0.5px rgba(${shine},${light ? 0.9 : 0.4}), inset -1px -1px 0 -0.5px rgba(${shine},${light ? 0.6 : 0.18}), inset 0 0 18px rgba(${shine},${light ? 0.35 : 0.07}), 0 10px 34px rgba(0,0,0,${light ? 0.12 : 0.32})`,
	};
	return {
		"--bg": c.bg, "--panel": c.panel, "--raised": c.raised, "--border": solid ? c.border : mix(c.border, light ? 70 : 60),
		"--text": c.text, "--muted": c.muted, "--accent": c.accent, "--on-accent": c.onAccent,
		"--heading": c.heading, "--link": c.link, "--code": c.code,
		"--accent-soft": `color-mix(in srgb, ${c.accent} 16%, transparent)`,
		"--hover": `color-mix(in srgb, ${c.text} 7%, transparent)`,
		"--font-ui": t.type.uiFont, "--font-editor": t.type.editorFont, "--font-code": t.type.codeFont,
		"--font-heading": t.headings.font || t.type.editorFont, "--heading-weight": String(t.headings.weight),
		"--text-size": `${t.type.size}px`, "--line-height": String(t.type.lineHeight),
		"--text-width": t.type.width > 0 ? `${t.type.width}ch` : "none",
		"--heading-scale": String(t.type.headingScale),
		"--radius": `${t.shape.radius}px`, "--density": String(t.shape.density),
		"--sidebar-width": `${t.shape.sidebarWidth}px`, "--banner-height": `${t.shape.bannerHeight}px`,
		"--ease": EASING[t.motion.style].ease, "--dur": `${motionMs(t)}ms`,
		// The background picture and how the panels sit on it.
		"--wallpaper": wallpaperCss(t),
		"--wallpaper-blur": `${t.background.blur}px`,
		"--wallpaper-fade": mix(c.bg, t.background.fade),
		"--surface-page": see ? mix(c.bg, g.page) : c.bg,
		"--surface-panel": see || !solid ? mix(c.panel, tint) : c.panel,
		// Menus and pop-ups float over text, so they stay a little more covered.
		"--surface-float": solid ? c.raised : mix(c.raised, Math.max(tint, g.material === "clear" ? 72 : light ? 62 : 55)),
		"--surface-card": solid ? c.raised : mix(c.raised, Math.max(tint, 72)),
		"--glass-filter": filters[g.material],
		// Pop-ups sit over text, so even transparent ones blur what's behind a little.
		"--float-filter": g.material === "clear" ? `blur(${Math.max(14, g.blur)}px) saturate(1.2)` : filters[g.material],
		"--glass-edge": edges[g.material],
		"--glass-grain": g.material === "frosted" ? GRAIN : "none",
		"--chrome-line": g.seamless ? "transparent" : solid ? c.border : mix(c.border, light ? 70 : 60),
		"--float-gap": g.floating ? "8px" : "0px",
		"--float-radius": g.floating ? `${Math.max(10, t.shape.radius * 1.5)}px` : "0px",
		"--tree-size": `${t.sidebar.size}px`,
		"--tree-indent": `${t.sidebar.indent}px`,
		"--tree-folder-weight": String(t.sidebar.folderWeight),
	};
}

/** Writes a theme into CSS variables on the page. */
export function applyTheme(t: Theme, root: HTMLElement = document.documentElement) {
	for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v);
	root.dataset.headings = t.headings.style;
	root.dataset.material = t.glass.material;
	root.dataset.marker = t.sidebar.marker ? "on" : "off";
	root.dataset.light = isLight(t) ? "yes" : "no";
	// Light themes get light scrollbars and form controls.
	root.style.colorScheme = isLight(t) ? "light" : "dark";
}

export const isLight = (t: Theme) => luminance(t.colors.bg) > 0.5;

function luminance(hex: string): number {
	const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
	return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

export const cloneTheme = (t: Theme): Theme => JSON.parse(JSON.stringify(t)) as Theme;
