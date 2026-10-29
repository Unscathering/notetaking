// The focus timer: work on one thing for a set time, then take a break.
// Lives in the bottom bar. Each finished focus session is written into
// today's daily note, under "Focus", with what it was for.
import { ensureDay } from "./templates";
import { ws } from "./workspace.svelte";

export const focus = $state({
	phase: "idle" as "idle" | "focus" | "break" | "done",
	/** When the current stretch ends (ms since 1970), or how much was left when paused. */
	endsAt: 0,
	paused: 0,
	minutes: 25,
	task: "",
	/** Seconds left, updated every second. */
	left: 0,
	/** Finished today. */
	count: 0,
});

let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
	if (focus.paused) return;
	focus.left = Math.max(0, Math.round((focus.endsAt - Date.now()) / 1000));
	if (focus.left > 0) return;
	if (focus.phase === "focus") {
		chime();
		focus.count++;
		void log(focus.minutes, focus.task);
		focus.phase = "done";
	} else if (focus.phase === "break") {
		chime();
		stopFocus();
	}
}

export function startFocus(minutes = focus.minutes, task = focus.task) {
	Object.assign(focus, { phase: "focus", minutes, task: task.trim(), endsAt: Date.now() + minutes * 60_000, paused: 0, left: minutes * 60 });
	clearInterval(timer);
	timer = setInterval(tick, 1000);
}

export function startBreak(minutes = focus.minutes >= 50 ? 10 : 5) {
	Object.assign(focus, { phase: "break", endsAt: Date.now() + minutes * 60_000, paused: 0, left: minutes * 60 });
	clearInterval(timer);
	timer = setInterval(tick, 1000);
}

export function pauseFocus() {
	if (focus.paused) {
		focus.endsAt = Date.now() + focus.paused;
		focus.paused = 0;
	} else focus.paused = Math.max(1, focus.endsAt - Date.now());
}

export function addMinutes(n: number) {
	if (focus.paused) focus.paused += n * 60_000;
	else focus.endsAt += n * 60_000;
	focus.left += n * 60;
}

export function stopFocus() {
	clearInterval(timer);
	Object.assign(focus, { phase: "idle", paused: 0, left: 0 });
}

/** Writes a finished session into today's note, under "## Focus". */
async function log(minutes: number, task: string) {
	const path = await ensureDay(new Date());
	if (!path) return;
	const now = new Date();
	const line = `- ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} · ${minutes} min${task ? ` · ${task}` : ""}`;
	const text = ws.texts.get(path) ?? (await ws.cave!.read(path));
	const lines = text.replace(/\s+$/, "").split("\n");
	const at = lines.findIndex((l) => /^#{1,6}\s+focus\b/i.test(l));
	if (at < 0) lines.push("", "## Focus", line);
	else {
		let end = at + 1;
		while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;
		while (end > at + 1 && !lines[end - 1].trim()) end--;
		lines.splice(end, 0, line);
	}
	await ws.writeNote(path, `${lines.join("\n")}\n`);
}

/** A soft two-note chime (no sound file needed). */
function chime() {
	try {
		const ctx = new AudioContext();
		for (const [i, freq] of [660, 880].entries()) {
			const osc = ctx.createOscillator(), gain = ctx.createGain();
			osc.frequency.value = freq;
			osc.type = "sine";
			const t = ctx.currentTime + i * 0.18;
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 1);
		}
		setTimeout(() => void ctx.close(), 2000);
	} catch {
		// No sound available; the timer still shows it's done.
	}
}
