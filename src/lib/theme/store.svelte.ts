// The live theme: the whole app re-styles the moment a value changes, and the
// choice is remembered for next time.
import { DEFAULT_THEME, applyTheme, cloneTheme, type Theme } from "./theme";

const KEY = "basalt.theme";

function load(): Theme {
	try {
		const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Theme | null;
		// Fill in anything a newer version added since the theme was saved.
		if (saved) return { ...cloneTheme(DEFAULT_THEME), ...saved, colors: { ...DEFAULT_THEME.colors, ...saved.colors }, type: { ...DEFAULT_THEME.type, ...saved.type }, shape: { ...DEFAULT_THEME.shape, ...saved.shape }, motion: { ...DEFAULT_THEME.motion, ...saved.motion } };
	} catch {
		// A broken saved theme falls back to the default.
	}
	return cloneTheme(DEFAULT_THEME);
}

export const theme: Theme = $state(load());

/** Keeps the page's CSS variables and the saved copy in step with `theme`. */
export function trackTheme() {
	$effect(() => {
		applyTheme(theme);
		try {
			localStorage.setItem(KEY, JSON.stringify(theme));
		} catch {
			// Not saved this time; the theme still applies.
		}
	});
}

export function useTheme(next: Theme) {
	Object.assign(theme, cloneTheme(next));
}
