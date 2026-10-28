// A theme is every look-and-feel choice in one small object. The app reads all
// of its colors, fonts, sizes, corners and motion from CSS variables set here,
// so changing a value restyles everything at once, with no CSS needed.

export type MotionStyle = "smooth" | "snappy" | "bouncy" | "off";

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
	shape: {
		/** Corner rounding in pixels. */
		radius: number;
		/** Multiplies every gap and padding. */
		density: number;
		sidebarWidth: number;
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
	"Monospace": MONO,
	"Rounded": `"Nunito", "Segoe UI", system-ui, sans-serif`,
	"System": "system-ui, sans-serif",
};

const base = (name: string, colors: Theme["colors"], extra: Partial<Theme["type"]> = {}): Theme => ({
	name,
	colors,
	type: { uiFont: SANS, editorFont: SANS, codeFont: MONO, size: 16, lineHeight: 1.65, width: 72, headingScale: 1.25, ...extra },
	shape: { radius: 8, density: 1, sidebarWidth: 260 },
	motion: { speed: 1, style: "smooth" },
});

export const PRESETS: Theme[] = [
	base("Basalt", { bg: "#16171a", panel: "#1c1d21", raised: "#25262b", border: "#2e3036", text: "#e6e4df", muted: "#8b8d94", accent: "#e8794a", onAccent: "#1a0d06", heading: "#f3efe8", link: "#f09a6e", code: "#c9b59a" }),
	base("Midnight", { bg: "#0d1020", panel: "#121630", raised: "#1a1f40", border: "#252b52", text: "#dfe4ff", muted: "#7d86b8", accent: "#7c8cff", onAccent: "#0b0d1f", heading: "#ffffff", link: "#9aa8ff", code: "#9fd3ff" }),
	base("Moss", { bg: "#141a16", panel: "#18201b", raised: "#202a23", border: "#2a362d", text: "#dde6dc", muted: "#86968a", accent: "#7fc48b", onAccent: "#0c1a0f", heading: "#eef6ec", link: "#9bd8a4", code: "#c6d8a0" }),
	base("Paper", { bg: "#faf8f3", panel: "#f2efe7", raised: "#ffffff", border: "#e2ddd1", text: "#2b2924", muted: "#8a857a", accent: "#c4572a", onAccent: "#ffffff", heading: "#1a1814", link: "#b04a20", code: "#7a5a3a" }, { editorFont: SERIF, size: 17 }),
	base("Frost", { bg: "#f4f7fb", panel: "#eaeff6", raised: "#ffffff", border: "#d8e0ea", text: "#1f2733", muted: "#77839a", accent: "#2f7de1", onAccent: "#ffffff", heading: "#0f1722", link: "#2369c4", code: "#5a4fb0" }),
];

export const DEFAULT_THEME = PRESETS[0];

/** How each motion style moves: a timing curve and a base length. */
const EASING: Record<MotionStyle, { ease: string; ms: number }> = {
	smooth: { ease: "cubic-bezier(0.22, 1, 0.36, 1)", ms: 260 },
	snappy: { ease: "cubic-bezier(0.2, 0, 0, 1)", ms: 150 },
	bouncy: { ease: "cubic-bezier(0.34, 1.56, 0.64, 1)", ms: 380 },
	off: { ease: "linear", ms: 0 },
};

/** Base animation length in milliseconds after speed; 0 when motion is off. */
export const motionMs = (t: Theme) => (t.motion.style === "off" ? 0 : Math.round(EASING[t.motion.style].ms / Math.max(0.25, t.motion.speed)));

/** Writes a theme into CSS variables on the page. */
export function applyTheme(t: Theme, root: HTMLElement = document.documentElement) {
	const c = t.colors;
	const vars: Record<string, string> = {
		"--bg": c.bg, "--panel": c.panel, "--raised": c.raised, "--border": c.border,
		"--text": c.text, "--muted": c.muted, "--accent": c.accent, "--on-accent": c.onAccent,
		"--heading": c.heading, "--link": c.link, "--code": c.code,
		"--accent-soft": `color-mix(in srgb, ${c.accent} 16%, transparent)`,
		"--hover": `color-mix(in srgb, ${c.text} 7%, transparent)`,
		"--font-ui": t.type.uiFont, "--font-editor": t.type.editorFont, "--font-code": t.type.codeFont,
		"--text-size": `${t.type.size}px`, "--line-height": String(t.type.lineHeight),
		"--text-width": t.type.width > 0 ? `${t.type.width}ch` : "none",
		"--heading-scale": String(t.type.headingScale),
		"--radius": `${t.shape.radius}px`, "--density": String(t.shape.density),
		"--sidebar-width": `${t.shape.sidebarWidth}px`,
		"--ease": EASING[t.motion.style].ease, "--dur": `${motionMs(t)}ms`,
	};
	for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
	// Light themes get light scrollbars and form controls.
	const light = luminance(c.bg) > 0.5;
	root.style.colorScheme = light ? "light" : "dark";
}

function luminance(hex: string): number {
	const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
	return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}

export const cloneTheme = (t: Theme): Theme => JSON.parse(JSON.stringify(t)) as Theme;
