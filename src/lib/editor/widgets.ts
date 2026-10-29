// Dashboard widgets: the parts of a ```basalt block that aren't lists of notes.
// A header with a clock, picture tiles, today's goal, quick actions, a small
// calendar, the focus timer and a quick-capture box. Each is drawn here from
// its spec (see query.ts) and gets classes (basalt-header, basalt-tile, …) for
// snippets to style. Anything that ticks (the clock, the timer) stops when the
// block is taken off the page: `later` collects what to stop.
import type { Spec } from "../query";
import { FOLDER_ICONS, icon, type IconName } from "../ui/icons";

export interface WidgetHooks {
	open(path: string): void;
	/** Opens what a tile points to: a note, or a folder (its dashboard, or the folder as a table). */
	openTarget(name: string): void;
	/** A picture in the cave, as something an <img> can show. */
	imageUrl(src: string): Promise<string | null>;
	/** Runs one of Basalt's commands (commands.ts). */
	run(command: string): void;
	stats(): { notes: number; open: number; done: number };
	/** The dates (YYYY-MM-DD) that have a daily note. */
	dailyDates(): Set<string>;
	openDay(date: string): void;
	timer: {
		state(): { phase: string; left: number; paused: boolean; minutes: number; count: number };
		start(minutes: number): void;
		pause(): void;
		stop(): void;
	};
	/** Adds a few lines to the end of a note, making it if needed. */
	capture(note: string, text: string): Promise<void>;
	/** The note can be edited: titles and texts can be changed in place. */
	editable?: boolean;
}

/**
 * Lets you change a piece of text right where it shows (a header's title, a
 * goal), without opening the block's code. The change goes to the line
 * `key: value` in the block (liveBlocks.ts listens for "basalt-set").
 */
export function editInPlace(e: HTMLElement, key: string, value: string, hooks: { editable?: boolean }) {
	if (!hooks.editable) return;
	e.contentEditable = "plaintext-only";
	e.spellcheck = false;
	e.classList.add("basalt-editable");
	e.title = "Click to change";
	let settled = true;
	e.addEventListener("focus", () => (settled = false));
	const done = (keep: boolean) => {
		if (settled) return;
		settled = true;
		const next = (e.textContent ?? "").replace(/\s+/g, " ").trim();
		if (keep && next !== value) e.dispatchEvent(new CustomEvent("basalt-set", { bubbles: true, detail: { key, old: value, value: next } }));
		else e.textContent = value;
	};
	e.addEventListener("keydown", (ev) => {
		ev.stopPropagation();
		// Select all: just this text, not the whole note.
		if (ev.key.toLowerCase() === "a" && (ev.ctrlKey || ev.metaKey)) {
			ev.preventDefault();
			getSelection()?.selectAllChildren(e);
		} else if (ev.key === "Enter" || ev.key === "Escape") {
			ev.preventDefault();
			done(ev.key === "Enter");
			e.blur();
		}
	});
	e.addEventListener("blur", () => done(true));
	e.addEventListener("paste", (ev) => {
		ev.preventDefault();
		document.execCommand("insertText", false, (ev.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " "));
	});
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text?: string) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text != null) e.textContent = text;
	return e;
};

/** A click that does something instead of moving the cursor into the block. */
function press(e: HTMLElement, fn: () => void) {
	e.addEventListener("mousedown", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
	});
	e.addEventListener("click", (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		fn();
	});
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const GREETINGS: Array<[number, string]> = [
	[5, "Still going?"],
	[9, "New day, new flow."],
	[13, "Peak focus. Engage."],
	[18, "Stay in the flow."],
	[21, "Review your progress."],
	[24, "Wind down. Reflect."],
];

/** Shows a picture, from the web or from the cave. */
function picture(img: HTMLImageElement, src: string, hooks: WidgetHooks) {
	if (/^(https?:|data:)/.test(src)) img.src = src;
	else void hooks.imageUrl(decodeURI(src)).then((url) => url && (img.src = url));
}

/** Draws a widget into `box`. `later` gets anything to stop when the widget goes away. */
export function widget(box: HTMLElement, spec: Spec, hooks: WidgetHooks, later: Array<() => void>): HTMLElement {
	switch (spec.list) {
		case "header": {
			box.classList.add("basalt-header");
			if (spec.image) {
				const bg = el("img", "basalt-header-image") as HTMLImageElement;
				bg.alt = "";
				picture(bg, spec.image, hooks);
				box.prepend(bg);
				box.classList.add("has-image");
			}
			// The title shows big in the header's own place, not as a small label.
			box.querySelector(".basalt-title")?.remove();
			const brand = el("div", "basalt-brand");
			const title = el("div", "basalt-header-title", spec.title || "Home");
			editInPlace(title, "title", spec.title || "Home", hooks);
			brand.append(title);
			if (spec.text || hooks.editable) {
				const tagline = el("div", `basalt-tagline${spec.text ? "" : " is-empty"}`, spec.text);
				tagline.dataset.placeholder = "Add a tagline";
				editInPlace(tagline, "text", spec.text, hooks);
				brand.append(tagline);
			}
			const clock = el("div", "basalt-clock");
			const time = el("div", "basalt-time"), date = el("div", "basalt-date");
			clock.append(time, date);
			const tick = () => {
				const now = new Date();
				time.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
				date.textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
			};
			tick();
			const t = setInterval(tick, 1000);
			later.push(() => clearInterval(t));
			const right = el("div", "basalt-header-right");
			right.append(el("div", "basalt-greeting", GREETINGS.find(([h]) => new Date().getHours() < h)![1]));
			right.append(statPills(hooks));
			box.append(brand, clock, right);
			return box;
		}
		case "stats":
			box.classList.add("basalt-stats-block");
			box.append(statPills(hooks));
			return box;
		case "tiles": {
			const grid = el("div", "basalt-tiles");
			for (const t of spec.tiles) {
				const tile = el("div", "basalt-tile");
				const art = el("div", "basalt-tile-art");
				if (t.image && /^\p{Extended_Pictographic}/u.test(t.image)) art.textContent = t.image;
				// One of Basalt's own icons, by name ("lightbulb").
				else if (t.image && (FOLDER_ICONS as string[]).includes(t.image)) art.innerHTML = icon(t.image as IconName, 34);
				else if (t.image) {
					const img = el("img") as HTMLImageElement;
					img.alt = "";
					picture(img, t.image, hooks);
					art.append(img);
				} else art.textContent = t.name.slice(0, 1).toUpperCase();
				tile.append(art, el("div", "basalt-tile-name", t.name));
				if (t.about) tile.append(el("div", "basalt-tile-about", t.about));
				press(tile, () => hooks.openTarget(t.link ?? t.name));
				grid.append(tile);
			}
			if (!spec.tiles.length) grid.append(el("div", "basalt-empty", "Add tiles with lines like: tile: Writing | attachments/owl.jpg"));
			box.append(grid);
			return box;
		}
		case "goal": {
			const goal = el("div", "basalt-goal", spec.text || "What matters today?");
			editInPlace(goal, "text", spec.text, hooks);
			box.append(goal);
			return box;
		}
		case "actions": {
			const ACTIONS: Record<string, [string, IconName]> = {
				today: ["daily", "sun"],
				search: ["search", "search"],
				graph: ["graph", "graph"],
				"new-note": ["new", "plus"],
				template: ["template", "layers"],
				palette: ["cmds", "command"],
				calendar: ["calendar", "calendar"],
				ai: ["ask AI", "sparkles"],
				clip: ["clip", "globe"],
				backups: ["backups", "archive"],
				appearance: ["looks", "palette"],
				focus: ["focus", "focus"],
			};
			const grid = el("div", "basalt-actions");
			for (const id of spec.actions.length ? spec.actions : ["today", "search", "graph", "new-note", "template", "palette"]) {
				const [label, ico] = ACTIONS[id] ?? [id, "zap"];
				const b = el("button", "basalt-action");
				const i = el("span", "basalt-action-icon");
				i.innerHTML = icon(ico, 15);
				b.append(i, el("span", "basalt-action-label", label));
				press(b, () => hooks.run(id));
				grid.append(b);
			}
			box.append(grid);
			return box;
		}
		case "calendar": {
			let shown = new Date();
			shown.setDate(1);
			const head = el("div", "basalt-cal-head");
			const prev = el("button", "basalt-cal-nav", "‹"), next = el("button", "basalt-cal-nav", "›"), month = el("span", "basalt-cal-month");
			head.append(prev, month, next);
			const grid = el("div", "basalt-cal");
			const draw = () => {
				month.textContent = shown.toLocaleDateString(undefined, { month: "long", year: "numeric" });
				grid.replaceChildren(...["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => el("span", "basalt-cal-dow", d)));
				const have = hooks.dailyDates();
				const today = iso(new Date());
				for (let i = 0; i < shown.getDay(); i++) grid.append(el("span", "basalt-cal-day is-blank"));
				const days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
				for (let d = 1; d <= days; d++) {
					const date = iso(new Date(shown.getFullYear(), shown.getMonth(), d));
					const cell = el("button", `basalt-cal-day${date === today ? " is-today" : ""}${have.has(date) ? " has-note" : ""}`, String(d));
					cell.title = have.has(date) ? `${date} · open the daily note` : `${date} · make a daily note`;
					press(cell, () => hooks.openDay(date));
					grid.append(cell);
				}
			};
			press(prev, () => {
				shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1);
				draw();
			});
			press(next, () => {
				shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1);
				draw();
			});
			draw();
			box.append(head, grid);
			return box;
		}
		case "timer": {
			const minutes = Math.max(1, Math.min(180, parseInt(spec.text) || 25));
			const face = el("div", "basalt-timer-time");
			const status = el("div", "basalt-timer-status");
			const bar = el("div", "basalt-timer-bar");
			const fill = el("i");
			bar.append(fill);
			const controls = el("div", "basalt-timer-controls");
			const play = el("button", "basalt-timer-btn"), stop = el("button", "basalt-timer-btn");
			stop.innerHTML = icon("stop", 14);
			stop.title = "Stop";
			controls.append(play, stop);
			const count = el("div", "basalt-timer-count");
			const draw = () => {
				const s = hooks.timer.state();
				const idle = s.phase === "idle" || s.phase === "done";
				const left = idle ? minutes * 60 : s.left;
				face.textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
				status.textContent = idle ? (s.phase === "done" ? "done · nice work" : "ready") : s.paused ? "paused" : s.phase === "break" ? "break" : "focusing";
				fill.style.width = idle ? "0%" : `${100 - (s.left / (s.minutes * 60)) * 100}%`;
				play.innerHTML = icon(!idle && !s.paused ? "pause" : "play", 14);
				play.title = idle ? `Start ${minutes} minutes` : s.paused ? "Carry on" : "Pause";
				count.textContent = `today: ${s.count} ${s.count === 1 ? "session" : "sessions"}`;
			};
			press(play, () => {
				const s = hooks.timer.state();
				if (s.phase === "idle" || s.phase === "done") hooks.timer.start(minutes);
				else hooks.timer.pause();
				draw();
			});
			press(stop, () => {
				hooks.timer.stop();
				draw();
			});
			draw();
			const t = setInterval(draw, 1000);
			later.push(() => clearInterval(t));
			box.append(face, bar, status, controls, count);
			return box;
		}
		case "capture": {
			const note = spec.to || "Inbox";
			const input = el("textarea", "basalt-capture-input") as HTMLTextAreaElement;
			input.placeholder = spec.text || "Write down a thought before it disappears…";
			input.rows = 3;
			// Typing here is typing in the box, not in the note around it.
			for (const ev of ["mousedown", "keydown", "keyup", "input", "paste", "beforeinput"]) input.addEventListener(ev, (e) => e.stopPropagation());
			const row = el("div", "basalt-capture-row");
			const done = el("span", "basalt-capture-done");
			const go = el("button", "basalt-capture-btn", "capture →");
			const send = async () => {
				const text = input.value.trim();
				if (!text) return;
				await hooks.capture(note, text);
				input.value = "";
				done.textContent = `Added to ${note}`;
				setTimeout(() => (done.textContent = ""), 2500);
			};
			press(go, () => void send());
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
			});
			row.append(done, go);
			box.append(input, row);
			return box;
		}
	}
	return box;
}

function statPills(hooks: WidgetHooks) {
	const { notes, open, done } = hooks.stats();
	const row = el("div", "basalt-stats");
	for (const [n, label] of [[notes, "notes"], [open, "open"], [done, "done"]] as const) {
		const pill = el("div", "basalt-stat");
		pill.append(el("div", "basalt-stat-num", String(n)), el("div", "basalt-stat-label", label));
		row.append(pill);
	}
	return row;
}
