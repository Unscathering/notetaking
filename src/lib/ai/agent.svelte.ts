// The conversation with Basalt's AI. Each turn: the AI may look around the
// cave (straight away) and propose changes (collected into a plan). When the
// turn ends, the plan waits for the user: only checked, approved changes are
// made, and the whole plan can be undone with one click.
//
// Chats are saved in .basalt/ai/chats/ (one file each, with a list in
// .basalt/ai/chats.json), so they can be reopened. A chat can belong to a
// project: a folder of the cave. Its chats share a small project memory
// (.basalt/ai/projects/), and the AI looks in that folder first.
//
// Memory: a note at .basalt/ai/memory.md inside the cave. It's hidden from
// the sidebar and search; only the user (through the memory button) and the
// AI read it. After a few messages, and when a chat ends, the AI updates it
// with what it learned and a line about the conversation.
import { ws } from "../workspace.svelte";
import type { IconName } from "../ui/icons";
import { CONTEXT, stream } from "./engine.svelte";
import { TOOLS, WRITES, apply, check, context, describe, look, toolsFor, type Change } from "./tools";
import { recall, type Found } from "./recall";
import { usingClaude } from "./claude.svelte";
import { noteTitle } from "../cave";
import { backUp } from "../backups.svelte";

export const MEMORY_PATH = ".basalt/ai/memory.md";
const CHATS = ".basalt/ai/chats.json";
const chatPath = (id: string) => `.basalt/ai/chats/${id}.json`;
const projectPath = (folder: string) => `.basalt/ai/projects/${folder.replace(/\//g, " » ")}.md`;
const MAX_ROUNDS = 10;
/** New memory notes allowed per message. */
const MAX_MEMORIES = 2;
/** Room kept for the AI's answer, in tokens. */
const ANSWER_ROOM = 2048;

interface ApiMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
	/** Claude's answer exactly as it came, sent back unchanged. */
	raw?: unknown[];
}

export interface Plan {
	changes: Change[];
	status: "waiting" | "doing" | "done" | "skipped" | "undone";
	undo: Array<() => Promise<unknown>>;
	note?: string;
	/** Reopened from a saved chat: its undo was left behind when Basalt closed. */
	reopened?: boolean;
}

/** A saved chat, as the list shows it. */
export interface ChatInfo {
	id: string;
	title: string;
	/** The project folder, or "". */
	project: string;
	updated: number;
}

/** One thing the AI did while working, like "Read “Garden plan”". The arrow shows `detail`. */
export interface Step {
	icon: IconName;
	label: string;
	detail?: string;
	/** Still happening. */
	active?: boolean;
}

export interface ChatMessage {
	id: number;
	role: "user" | "assistant";
	text: string;
	steps: Step[];
	plan?: Plan;
	error?: string;
	streaming?: boolean;
	/** Notes the answer came from, to open with a click. */
	sources?: string[];
}

let nextId = 1;
let history: ApiMessage[] = [];
let sinceMemory = 0;
/** Where the current message starts in `history`. */
let turnStart = 0;

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const chat = $state({
	id: newId(),
	/** The project folder this chat belongs to, or "". */
	project: "",
	projectMemory: "",
	messages: [] as ChatMessage[],
	busy: false,
	memory: "",
	memoryLoaded: false,
	/** Saved chats, newest first. */
	list: [] as ChatInfo[],
	/** The cave the chats and memory belong to. */
	caveId: "",
});

// ---- Memory ----

export async function loadMemory() {
	if (!ws.cave) return "";
	const text = (await ws.cave.exists(MEMORY_PATH)) ? await ws.cave.read(MEMORY_PATH) : "";
	chat.memory = tidy(text);
	chat.memoryLoaded = true;
	if (chat.memory !== text) await ws.cave.write(MEMORY_PATH, chat.memory);
	return chat.memory;
}

const same = (a: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Notes about the cave itself, which the AI can see anyway. */
const aboutCave = (fact: string) => /\b(the user'?s|their|your) (cave|notes?|folders?|boards?|home ?page)\b/i.test(fact);

/** Drops repeated lines and notes about the cave (an older version could fill the note with them). */
function tidy(text: string) {
	const seen = new Set<string>();
	const lines = text.split("\n").filter((line) => {
		if (!line.startsWith("- ")) return true;
		const key = same(line);
		if (seen.has(key) || aboutCave(line)) return false;
		seen.add(key);
		return true;
	});
	return lines.join("\n");
}

export async function saveMemory(text: string) {
	chat.memory = text;
	await ws.cave?.write(MEMORY_PATH, text);
}

async function loadProjectMemory() {
	chat.projectMemory = chat.project && ws.cave && (await ws.cave.exists(projectPath(chat.project))) ? await ws.cave.read(projectPath(chat.project)) : "";
	return chat.projectMemory;
}

async function saveProjectMemory(text: string) {
	if (!chat.project) return;
	chat.projectMemory = text;
	await ws.cave?.write(projectPath(chat.project), text);
}

/** Saves a fact, unless it's already known or is about the cave. Returns what the AI is told. */
async function remember(fact: string, project = false): Promise<string> {
	if (!fact.trim()) return "Nothing to save.";
	if (project && chat.project) {
		const now = chat.projectMemory;
		if (now.split("\n").some((l) => same(l) === same(fact))) return "That's already in the project memory.";
		await saveProjectMemory(`${now.trim() ? now.trimEnd() : `# ${chat.project}`}\n- ${fact.trim()}\n`);
		return "Saved to the project memory.";
	}
	if (aboutCave(fact)) return "Not saved: only remember things about the person, not their cave.";
	const now = chat.memory || (await loadMemory());
	if (now.split("\n").some((l) => same(l) === same(fact) || (same(fact).length > 12 && same(l).includes(same(fact))))) return "You already remember that.";
	const lines = now.trim() ? now.trimEnd().split("\n") : ["# What I know about you", ""];
	lines.push(`- ${fact.trim()}`);
	await saveMemory(`${lines.join("\n")}\n`);
	return "Saved to your memory.";
}

/** Asks the AI to fold the conversation into its memory note. Runs quietly. */
export async function updateMemory(source: ApiMessage[] = history) {
	const said = source.filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim());
	if (said.length < 2) return;
	const old = chat.memory || (await loadMemory());
	const transcript = said.slice(-16).map((m) => `${m.role === "user" ? "User" : "You"}: ${m.content.slice(0, 800)}`).join("\n");
	let text = "";
	try {
		await stream(
			{
				messages: [
					{ role: "system", content: "You keep a short memory note about the person you help in their note-taking app. Reply with ONLY the updated note in Markdown, nothing else." },
					{
						role: "user",
						content: `Here is your memory note:\n\n${old || "(empty)"}\n\nHere is your latest conversation:\n\n${transcript}\n\nRewrite the memory note. Keep it under 300 words with three sections: "# What I know about you" (facts, likes, projects, how they like to work), "# How we talk" (tone and style they prefer), and "# Recent conversations" (one short dated line per conversation, newest first, at most 10). Today is ${new Date().toISOString().slice(0, 10)}. Keep what still matters from the old note.`,
					},
				],
				temperature: 0.3,
				effort: "low",
			},
			(d) => (text += ((d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? ""))
		);
		if (text.trim().length > 20) await saveMemory(`${text.trim()}\n`);
		sinceMemory = 0;
		if (chat.project) await updateProjectMemory(transcript);
	} catch {
		// Not important enough to bother the user; it will try again later.
	}
}

/** Folds what a project's chat decided into the project's memory. */
async function updateProjectMemory(transcript: string) {
	let text = "";
	await stream(
		{
			messages: [
				{ role: "system", content: "You keep a short memory note about one project in a note-taking app. Reply with ONLY the updated note in Markdown, nothing else." },
				{ role: "user", content: `The project is the folder "${chat.project}". Here is its memory note:\n\n${chat.projectMemory || "(empty)"}\n\nHere is the latest conversation about it:\n\n${transcript}\n\nRewrite the note in under 200 words: what the project is, decisions made, names and facts to keep straight, and what's next. Keep what still matters from the old note.` },
			],
			temperature: 0.3,
			effort: "low",
		},
		(d) => (text += ((d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? ""))
	);
	if (text.trim().length > 20) await saveProjectMemory(`${text.trim()}\n`);
}

// ---- Saved chats ----

/** Forgets the open chat and the memory when the cave changes. */
function sameCave() {
	const id = ws.cave?.id ?? "";
	if (chat.caveId === id) return;
	Object.assign(chat, { caveId: id, id: newId(), project: "", projectMemory: "", messages: [], memory: "", memoryLoaded: false, list: [] });
	history = [];
	turnStart = 0;
}

export async function loadChats() {
	sameCave();
	try {
		chat.list = ws.cave && (await ws.cave.exists(CHATS)) ? (JSON.parse(await ws.cave.read(CHATS)) as ChatInfo[]) : [];
	} catch {
		chat.list = [];
	}
	return chat.list;
}

async function saveList() {
	chat.list.sort((a, b) => b.updated - a.updated);
	await ws.cave?.write(CHATS, JSON.stringify(chat.list, null, 1));
}

/** Saves the open chat (nothing until something has been said). */
async function saveChat() {
	if (!ws.cave || !chat.messages.length) return;
	const first = chat.messages.find((m) => m.role === "user")?.text ?? "Chat";
	const old = chat.list.find((c) => c.id === chat.id);
	const info: ChatInfo = { id: chat.id, title: old?.title ?? (first.length > 48 ? `${first.slice(0, 46).trimEnd()}…` : first), project: chat.project, updated: Date.now() };
	// Undo can't be saved, so a reopened plan just says what happened.
	const messages = chat.messages.map((m) => ({ ...m, plan: m.plan && { ...m.plan, undo: [], status: m.plan.status === "doing" ? "done" : m.plan.status } }));
	await ws.cave.write(chatPath(chat.id), JSON.stringify({ ...info, history, messages }));
	chat.list = [info, ...chat.list.filter((c) => c.id !== chat.id)];
	await saveList();
}

export async function openChat(id: string) {
	if (chat.busy || !ws.cave || id === chat.id) return;
	await newChat();
	const saved = JSON.parse(await ws.cave.read(chatPath(id))) as ChatInfo & { history: ApiMessage[]; messages: ChatMessage[] };
	history = saved.history;
	turnStart = history.length;
	nextId = Math.max(nextId, ...saved.messages.map((m) => m.id + 1));
	Object.assign(chat, { id, project: saved.project, messages: saved.messages.map((m) => ({ ...m, plan: m.plan && { ...m.plan, undo: [], reopened: m.plan.status === "done" } })) });
	await loadProjectMemory();
}

export async function renameChat(id: string, title: string) {
	const c = chat.list.find((x) => x.id === id);
	if (!c || !title.trim()) return;
	c.title = title.trim();
	await saveList();
}

export async function deleteChat(id: string) {
	if (id === chat.id) await newChat();
	await ws.cave?.remove(chatPath(id)).catch(() => {});
	chat.list = chat.list.filter((c) => c.id !== id);
	await saveList();
}

/** Puts the open chat in a project folder ("" for none). */
export async function setProject(folder: string) {
	chat.project = folder;
	await loadProjectMemory();
	if (chat.messages.length) await saveChat();
}

// ---- Talking ----

function system(memory: string, found: Found[] = []): string {
	const notes = found.length
		? `\n\nNotes that may help with the latest message (found by searching the cave; read_note gives the whole note):\n${found.map((f) => `--- [[${noteTitle(f.path)}]] (${f.path}) ---\n${f.excerpt}`).join("\n\n")}`
		: "";
	const project = chat.project
		? `\n\nThis chat is part of the project "${chat.project}" (a folder in the cave). Look in that folder first, put new notes for it there, and save lasting facts about the project with remember (about: "project").\nWhat you know about this project:\n${chat.projectMemory.trim().slice(0, 1200) || "(Nothing yet.)"}`
		: "";
	return `You are the AI helper built into Basalt, a note-taking app. ${usingClaude() ? "You are Claude, made by Anthropic, running on Anthropic's servers: the user chose this, so what they share with you is sent there." : "You run entirely on the user's own computer: nothing they write ever leaves it."} Be warm, clear and brief; plain words, short paragraphs, Markdown when it helps.

How Basalt works:
- A "cave" is a folder of notes. Notes are Markdown files; folders organize them and can have a color and an icon in the sidebar.
- Notes can link to each other with [[Note name]], and have tags like #idea.
- Boards are Trello-style notes with lists and cards (use create_board and add_card for them).
- The app's look (theme, colors, glass, wallpaper, fonts) can be changed with change_appearance.

How you work:
- When you answer from the user's notes, name each note you used as a link, like [[Garden plan]]. Say only what the notes say; if they don't cover it, say so instead of guessing.
- Use list_cave, read_note, search_notes and list_tags freely to understand things before answering. Don't guess what's in a note: read it. Use the exact names list_cave shows.
- Every change (making, editing, moving, renaming, deleting) is only proposed. All your proposed changes appear below your reply as one plan, and the user presses "Do it" once. That plan IS the confirmation: never ask "should I go ahead?", "are you sure?" or "do you want me to?" in the chat. Just propose the changes and say in a sentence or two what the plan does. Never say something is already done.
- When the user tells you what to do, plan it straight away. Only ask questions first when you truly can't tell what they want (like a vague "set up my cave"); then ask 2 to 4 short questions in one message and wait.
- To delete everything in the cave, use clear_cave (never delete_item with an empty name). Delete only when the user clearly asks.
- Put each folder's notes and boards inside that folder, with paths like "Writing/Writing board", never at the top level unless asked.
- For folders with dashboards, a "second brain" or "set up my cave": use create_space once for each area (Basalt writes each dashboard) and create_home once at the end. Don't write dashboards or a home page yourself with create_note: it takes far too long.
- To make a home page some other way, write the note with create_note first (like "Home"), then set_home on it.
- Change the app's look (theme, colors, fonts) only when the user asks about the look.
- If a tool says a change won't work, fix it or leave it out. Never repeat a tool call you already made.
- When you learn something new and lasting about the person (their projects, likes, how they want you to talk), save it with remember: at most twice per message, and never about the cave.

${context()}
Today is ${new Date().toDateString()}.

Your memory of this person:
${memory.trim().slice(0, 1500) || "(Nothing yet. This may be your first conversation.)"}${project}${notes}`;
}

// ---- Staying inside the AI's limit ----
// The engine can only keep so much text in mind at once (CONTEXT tokens). Before
// each request, older messages lose their tool details, then the oldest ones
// are dropped, so a long chat never goes over.

/** A rough token count: about 3 characters per token, erring on the high side. */
const tokens = (v: unknown) => Math.ceil(JSON.stringify(v).length / 3);

/** Older messages as plain text: what was said, without the looking around. */
function plain(list: ApiMessage[]): ApiMessage[] {
	const out: ApiMessage[] = [];
	for (const m of list) {
		if (m.role === "tool" || !m.content.trim()) continue;
		const last = out.at(-1);
		if (last?.role === m.role) last.content += `\n\n${m.content}`;
		else out.push({ role: m.role, content: m.content });
	}
	return out;
}

function fit(sys: string, tools: object[], budget: number): ApiMessage[] {
	// Claude keeps a whole conversation in mind, and its history must stay exactly as it was.
	if (usingClaude()) return [{ role: "system", content: sys }, ...history];
	const room = budget - ANSWER_ROOM - tokens(sys) - tokens(tools);
	let older = plain(history.slice(0, turnStart));
	let now = history.slice(turnStart).map((m) => ({ ...m }));
	const size = () => tokens(older) + tokens(now);
	while (older.length && size() > room) older = older.slice(older[0].role === "user" && older[1]?.role === "assistant" ? 2 : 1);
	// Still too big: shorten what the tools said this message, oldest first.
	for (let i = 0; i < now.length && size() > room; i++) {
		if (now[i].role === "tool" && now[i].content.length > 300) now[i].content = `${now[i].content.slice(0, 300)}… (shortened)`;
	}
	if (size() > room) now = now.filter((m, i) => i === 0 || m.role !== "tool" || i > now.length - 4);
	return [{ role: "system", content: sys }, ...older, ...now];
}

const tooLong = (e: unknown) => /exceed_context_size|context size|context length|too long/i.test(String(e));

/** A playful word for while the AI is thinking. */
export const THINKING = ["Pondering", "Mulling it over", "Rummaging", "Noodling", "Brewing ideas", "Puzzling", "Daydreaming", "Scheming", "Connecting dots", "Chewing on it", "Doodling", "Tinkering"];

const say = (m: ChatMessage, patch: Partial<ChatMessage>) => Object.assign(chat.messages.find((x) => x.id === m.id) ?? m, patch);

export async function send(text: string) {
	if (chat.busy || !text.trim()) return;
	chat.busy = true;
	sameCave();
	const memory = chat.memoryLoaded ? chat.memory : await loadMemory();
	if (chat.project && !chat.projectMemory) await loadProjectMemory();
	chat.messages.push({ id: nextId++, role: "user", text, steps: [] });
	turnStart = history.length;
	history.push({ role: "user", content: text });
	chat.messages.push({ id: nextId++, role: "assistant", text: "", steps: [], streaming: true });
	const reply = chat.messages[chat.messages.length - 1];
	const plan: Change[] = [];
	const tools = usingClaude() ? TOOLS : toolsFor(text);
	const done = new Set<string>();
	let changeId = 1;
	let memories = 0;
	const step = (s: Step) => {
		reply.steps.push(s);
		return reply.steps[reply.steps.length - 1];
	};
	/** One line that grows as changes are planned, instead of one line each. */
	let planStep: Step | undefined;
	let fixStep: Step | undefined;
	let memoryStep: Step | undefined;
	// The notes that best match the message, handed to the AI up front.
	const found = recall(ws.texts, text, noteTitle, 3, chat.project);
	if (found.length) step({ icon: "search", label: `Found ${found.length} ${found.length === 1 ? "note" : "notes"} that may help`, detail: found.map((f) => `• ${noteTitle(f.path)}`).join("\n") });
	const read = new Set<string>();
	/** While the AI writes a long change (a note's whole text), a line saying what and how far along. */
	let writeStep: Step | undefined;
	let lastShown = 0;
	const writing = (call: { name: string; args: string }) => {
		if (!WRITES.has(call.name) || call.args.length < 200 || Date.now() - lastShown < 400) return;
		lastShown = Date.now();
		const target = /"(?:path|name|title|board)"\s*:\s*"([^"]+)"/.exec(call.args)?.[1] ?? "a change";
		const words = Math.round(call.args.length / 6);
		writeStep ??= step({ icon: "pencil", label: "", active: true });
		writeStep.label = `Writing “${target.split("/").pop()}”… about ${words} words so far`;
		writeStep.active = true;
	};
	try {
		for (let round = 0; round < MAX_ROUNDS; round++) {
			let content = "";
			let raw: unknown[] | undefined;
			const calls: Array<{ id: string; name: string; args: string }> = [];
			// dry_multiplier: the engine's guard against saying the same thing over and over.
			const ask = (budget: number) =>
				stream({ messages: fit(system(memory, found), tools, budget), tools, temperature: 0.5, dry_multiplier: 0.8, cache_prompt: true, effort: "medium" }, (d) => {
					if (d.basalt_raw) raw = d.basalt_raw as unknown[];
				const delta = (d.choices as Array<{ delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> } }> | undefined)?.[0]?.delta;
				if (!delta) return;
				if (delta.content) {
					content += delta.content;
					say(reply, { text: reply.text + delta.content });
				}
				for (const t of delta.tool_calls ?? []) {
					const i = t.index ?? calls.length;
					calls[i] ??= { id: t.id ?? `call_${round}_${i}`, name: "", args: "" };
					if (t.id) calls[i].id = t.id;
					if (t.function?.name) calls[i].name += t.function.name;
					if (t.function?.arguments) calls[i].args += t.function.arguments;
					writing(calls[i]);
				}
			});
			let stopped: boolean;
			try {
				stopped = await ask(CONTEXT);
			} catch (e) {
				// Over the limit anyway (the count above is a guess): try again with much less.
				if (!tooLong(e) || content || calls.length) throw e;
				stopped = await ask(Math.floor(CONTEXT * 0.6));
			}
			const real = calls.filter(Boolean);
			if (writeStep) {
				reply.steps.splice(reply.steps.indexOf(writeStep), 1);
				writeStep = undefined;
			}
			if (stopped || !real.length) {
				history.push({ role: "assistant", content, raw });
				break;
			}
			history.push({ role: "assistant", content, raw, tool_calls: real.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
			if (content.trim()) say(reply, { text: `${reply.text}\n\n` });
			let fresh = 0;
			for (const call of real) {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(call.args || "{}") as Record<string, unknown>;
				} catch {
					history.push({ role: "tool", tool_call_id: call.id, content: "Those arguments weren't valid JSON. Try again." });
					continue;
				}
				const key = `${call.name} ${JSON.stringify(args)}`;
				let result: string;
				/** Turned down, so trying it again later (once fixed) isn't a repeat. */
				let refused = false;
				if (done.has(key)) {
					result = "You already did exactly that. Don't repeat it: answer the user now.";
				} else if (call.name === "remember") {
					const fact = String(args.fact ?? "").trim();
					result = memories >= MAX_MEMORIES ? "That's enough remembering for this message." : await remember(fact, args.about === "project");
					if (result.startsWith("Saved")) {
						memories++;
						memoryStep ??= step({ icon: "brain", label: "" });
						memoryStep.detail = [memoryStep.detail, `• ${fact}`].filter(Boolean).join("\n");
						memoryStep.label = memories === 1 ? "Remembered something about you" : `Remembered ${memories} things about you`;
					}
				} else if (!tools.some((t) => t.function.name === call.name)) {
					// Made up, or not offered this time (like the look, when the user didn't ask about it).
					result = call.name === "change_appearance" ? "The user didn't ask about the app's look, so leave it as it is." : `There's no tool called ${call.name}.`;
					refused = true;
				} else if (WRITES.has(call.name)) {
					const problem = check(call.name, args, plan);
					if (problem) {
						result = `Not added to the plan: ${problem}`;
						refused = true;
						fixStep ??= step({ icon: "alert", label: "" });
						const n = (fixStep.detail?.split("\n").length ?? 0) + 1;
						fixStep.label = n === 1 ? "Caught a change that wouldn't work" : `Caught ${n} changes that wouldn't work`;
						fixStep.detail = [fixStep.detail, `• ${describe(call.name, args).summary}: ${problem}`].filter(Boolean).join("\n");
					} else {
						const change: Change = { id: changeId++, tool: call.name, args, checked: true, ...describe(call.name, args) };
						plan.push(change);
						planStep ??= step({ icon: "layers", label: "", active: true });
						planStep.label = `Planning changes (${plan.length})`;
						planStep.detail = plan.map((c) => `• ${c.summary}`).join("\n");
						result = "Added to the plan. The user approves the whole plan with one click after your reply; don't ask them to confirm and don't say it's done.";
					}
				} else {
					const s = step({ icon: stepIcon(call.name), label: `${stepLabel(call.name, args, true)}…`, active: true });
					result = look(call.name, args);
					if (call.name === "read_note" && !result.startsWith("There's no note")) read.add(result.slice(0, result.indexOf(":\n")));
					Object.assign(s, { label: stepLabel(call.name, args, false), detail: result.length > 600 ? `${result.slice(0, 600)}…` : result, active: false });
				}
				if (!done.has(key)) fresh++;
				if (!refused) done.add(key);
				history.push({ role: "tool", tool_call_id: call.id, content: result });
			}
			// Going round in circles: stop asking.
			if (!fresh) break;
		}
		// Sources: notes it read, and notes it linked to in its answer.
		const linked = [...reply.text.matchAll(/\[\[([^\]|#]+)/g)].map((m) => ws.resolve(m[1].trim())).filter((p): p is string => !!p);
		const sources = [...new Set([...read, ...linked])].filter((p) => ws.files.includes(p));
		if (sources.length) say(reply, { sources });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		say(reply, { error: tooLong(message) ? "This chat got too long for the AI to keep in mind. Start a new chat (the + button above) and ask again." : plan.length ? `${message} What it planned before stopping is below.` : message });
	} finally {
		// Even if the answer was cut off, what was planned so far is kept.
		if (planStep) Object.assign(planStep, { label: `Planned ${plan.length} ${plan.length === 1 ? "change" : "changes"}`, active: false });
		if (plan.length) say(reply, { plan: { changes: plan, status: "waiting", undo: [] } });
		if (!reply.text.trim() && !reply.error) say(reply, { text: plan.length ? "Here's what I'd like to do:" : "…" });
		if (writeStep) reply.steps.splice(reply.steps.indexOf(writeStep), 1);
		for (const s of reply.steps) s.active = false;
		void saveChat().catch(() => {});
		say(reply, { streaming: false });
		chat.busy = false;
	}
	if (++sinceMemory >= 4) void updateMemory();
}

function stepLabel(tool: string, a: Record<string, unknown>, now: boolean): string {
	switch (tool) {
		case "list_cave":
			return now ? "Looking through your cave" : "Looked through your cave";
		case "read_note":
			return `${now ? "Reading" : "Read"} “${String(a.path ?? "")}”`;
		case "search_notes":
			return `${now ? "Searching" : "Searched"} for “${String(a.query ?? "")}”`;
		case "list_tags":
			return now ? "Checking your tags" : "Checked your tags";
		case "get_appearance":
			return now ? "Checking the app's look" : "Checked the app's look";
	}
	return tool;
}

const stepIcon = (tool: string): IconName => (tool === "search_notes" ? "search" : tool === "list_cave" ? "folder" : tool === "list_tags" ? "tag" : tool === "get_appearance" ? "palette" : "file");

/** Makes the checked changes of a plan, in order. */
export async function approve(m: ChatMessage) {
	const plan = m.plan;
	if (!plan || plan.status !== "waiting") return;
	plan.status = "doing";
	// A safety copy first, so even a plan's mistakes can be taken back from Backups.
	await backUp("Before the AI's changes").catch(() => {});
	let done = 0, failed = 0;
	// Clearing the cave goes first and the home page last, so the note it points to is made first.
	const rank = (c: Change) => (c.tool === "clear_cave" ? 0 : c.tool === "set_home" || c.tool === "create_home" ? 2 : 1);
	const order = [...plan.changes].sort((a, b) => rank(a) - rank(b));
	for (const c of order) {
		if (!c.checked) continue;
		try {
			plan.undo.push(await apply(c));
			done++;
		} catch (e) {
			c.problem = e instanceof Error ? e.message : String(e);
			failed++;
		}
	}
	plan.status = "done";
	const skipped = plan.changes.filter((c) => !c.checked).length;
	plan.note = [`${done} done`, skipped && `${skipped} skipped`, failed && `${failed} couldn't be done`].filter(Boolean).join(" · ");
	history.push({ role: "user", content: `(I approved your plan: ${plan.note}.${plan.changes.filter((c) => !c.checked).map((c) => ` I left out: ${c.summary}.`).join("")})` });
	await saveChat();
}

export function skip(m: ChatMessage) {
	if (!m.plan || m.plan.status !== "waiting") return;
	m.plan.status = "skipped";
	history.push({ role: "user", content: "(I decided not to make those changes.)" });
	void saveChat();
}

/** Takes back everything a plan did, newest first. */
export async function undo(m: ChatMessage) {
	if (!m.plan || m.plan.status !== "done") return;
	for (const u of [...m.plan.undo].reverse()) await u().catch(() => {});
	m.plan.status = "undone";
	history.push({ role: "user", content: "(I undid those changes.)" });
	await saveChat();
}

/** Starts over, saving what was learned to memory first. */
export async function newChat(project = chat.project) {
	const old = history;
	if (chat.messages.length) await saveChat();
	history = [];
	turnStart = 0;
	if (old.length > 1 && sinceMemory > 0) void updateMemory(old);
	Object.assign(chat, { id: newId(), messages: [], project });
	sinceMemory = 0;
	await loadProjectMemory();
}
