// Sends text to the engine for writing help (see proofread.ts for the modes)
// and brings back each line's new version. One request at a time, so the
// chat and the editor never fight over the engine.
import type { WritingHelpHooks } from "../editor/writingHelp";
import { writing } from "../writing.svelte";
import { ai, refresh, stream, wake, writerAwake } from "./engine.svelte";
import { clean, request, type Mode } from "./proofread";
import { usingClaude } from "./claude.svelte";

let queue: Promise<unknown> = Promise.resolve();

/** Runs jobs one after another. */
function inTurn<T>(job: () => Promise<T>): Promise<T> {
	const next = queue.then(job, job);
	queue = next.catch(() => {});
	return next;
}

async function ask(mode: Mode, lines: string[]): Promise<string> {
	let text = "";
	await stream(request(mode, lines), (d) => (text += ((d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "")), "writer");
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
	return ai.phase === "ready" || usingClaude();
}

/** Starts waking the engine early, so the first answer comes sooner. */
export function warmUp() {
	if (!usingClaude() && ai.phase === "ready" && !writerAwake() && !ai.starting) void wake("writer").catch(() => {});
}

/** What the editor's writing help needs from the AI. */
export const helpHooks: WritingHelpHooks = { helperReady, warmUp, improve, checkAsYouWrite: () => writing.aiCheck };

// ---- How fast is it on this PC? ----

const SAMPLE = "yesterday me and my freind goes to the libary to study for are test, but it was closed so we just walked around the park instead and talked about the the project we has to finish by friday.";

export interface SpeedResult {
	/** Seconds to wake the engine (0 if it was already awake). */
	wake: number;
	/** Seconds for one paragraph's grammar check, start to finish. */
	paragraph: number;
	/** Words written per second. */
	wordsPerSecond: number;
	/** How it went, in plain words. */
	verdict: string;
}

/**
 * Times a grammar check of one paragraph, the way writing help does it. With
 * `slot` "main", it times the chat model instead (when writing help has its own).
 */
export async function speedTest(slot: "writer" | "main" = "writer"): Promise<SpeedResult> {
	const t0 = performance.now();
	const asleep = !(slot === "writer" ? writerAwake() : ai.running) && !usingClaude();
	if (!usingClaude()) await wake(slot);
	const wakeS = asleep ? (performance.now() - t0) / 1000 : 0;
	const t1 = performance.now();
	let text = "";
	let perSecond = 0;
	await stream(request("grammar", [SAMPLE]), (d) => {
		text += (d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "";
		// The engine reports its own speed at the end, in tokens (about ¾ of a word each).
		const timings = d.timings as { predicted_per_second?: number } | undefined;
		if (timings?.predicted_per_second) perSecond = timings.predicted_per_second * 0.75;
	}, slot);
	const paragraph = (performance.now() - t1) / 1000;
	const words = text.split(/\s+/).filter(Boolean).length;
	const wordsPerSecond = perSecond || words / Math.max(paragraph, 0.1);
	const verdict =
		slot === "main"
			? wordsPerSecond >= 18
				? "Fast. Chats and big jobs like setting up folders move along quickly."
				: wordsPerSecond >= 7
					? "Fine. Big jobs take a few minutes, and you can watch each step."
					: "Slow on this PC. Big jobs will take a long time; try a smaller model under AI models."
			: paragraph <= 4
			? "Fast. Grammar checks feel quick, and checking as you write works well."
			: paragraph <= 10
				? "Fine for checking a selection. A long note takes a while, so check it in parts."
				: "Slow on this PC with this model. For writing help, try a smaller model (Fast or Tiny) under AI models.";
	return { wake: wakeS, paragraph, wordsPerSecond, verdict };
}
