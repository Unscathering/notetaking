// Writing preferences (how the editor behaves, as opposed to how it looks).
const KEY = "basalt.writing";

interface Writing {
	/** Keep the line you're typing on in the middle of the screen. */
	typewriter: boolean;
	/** Fade every paragraph except the one you're in. */
	dimOthers: boolean;
	spellcheck: boolean;
	/** The AI checks grammar in each paragraph after you leave it. */
	aiCheck: boolean;
	/** Hide everything but the text (not remembered between visits). */
	focus: boolean;
}

function load(): Writing {
	const base: Writing = { typewriter: false, dimOthers: false, spellcheck: true, aiCheck: false, focus: false };
	try {
		return { ...base, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Writing>), focus: false };
	} catch {
		return base;
	}
}

export const writing: Writing = $state(load());

export function trackWriting() {
	$effect(() => {
		const { focus: _focus, ...keep } = writing;
		try {
			localStorage.setItem(KEY, JSON.stringify(keep));
		} catch {
			// Not saved this time.
		}
	});
}
