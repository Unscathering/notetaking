// Sends text to the engine for writing help (see proofread.ts for the modes)
// and brings back each line's new version. One request at a time, so the
// chat and the editor never fight over the engine.
import type { WritingHelpHooks } from "../editor/writingHelp";
import { writing } from "../writing.svelte";
import { ai, refresh, stream, wake } from "./engine.svelte";
import { clean, request, type Mode } from "./proofread";

let queue: Promise<unknown> = Promise.resolve();

/** Runs jobs one after another. */
function inTurn<T>(job: () => Promise<T>): Promise<T> {
	const next = queue.then(job, job);
	queue = next.catch(() => {});
	return next;
}

async function ask(mode: Mode, lines: string[]): Promise<string> {
	let text = "";
	await stream(request(mode, lines), (d) => (text += ((d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "")));
	return clean(text, lines.join("\n"));
}

/**
 * New versions of `lines`, in order. For a rewrite, the lines go as one piece of
 * text and come back as one. If the AI loses track of which line is which, each
 * line is asked about on its own.
 */
export function improve(mode: Mode, lines: string[]): Promise<string[]> {
	return inTurn(async () => {
		if (mode === "rewrite") return [await ask(mode, lines)];
		if (lines.length === 1) return [(await ask(mode, lines)).split("\n").join(" ")];
		const got = (await ask(mode, lines)).split("\n").filter((l) => l.trim());
		if (got.length === lines.length) return got;
		const out: string[] = [];
		for (const line of lines) out.push((await ask(mode, [line])).split("\n").join(" "));
		return out;
	});
}

let checked = false;
/** Whether writing help can run right now (an engine and a model are set up). */
export function helperReady(): boolean {
	if (!checked) {
		checked = true;
		void refresh().catch(() => {});
	}
	return ai.phase === "ready";
}

/** Starts waking the engine early, so the first answer comes sooner. */
export function warmUp() {
	if (ai.phase === "ready" && !ai.running && !ai.starting) void wake().catch(() => {});
}

/** What the editor's writing help needs from the AI. */
export const helpHooks: WritingHelpHooks = { helperReady, warmUp, improve, checkAsYouWrite: () => writing.aiCheck };
