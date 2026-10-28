// The conversation with Basalt's AI. Each turn: the AI may look around the
// cave (straight away) and propose changes (collected into a plan). When the
// turn ends, the plan waits for the user: only checked, approved changes are
// made, and the whole plan can be undone with one click.
//
// Memory: a note at .basalt/ai/memory.md inside the cave. It's hidden from
// the sidebar and search; only the user (through the memory button) and the
// AI read it. After a few messages, and when a chat ends, the AI updates it
// with what it learned and a line about the conversation.
import { ws } from "../workspace.svelte";
import { stream } from "./engine.svelte";
import { TOOLS, WRITES, apply, context, describe, look, type Change } from "./tools";

export const MEMORY_PATH = ".basalt/ai/memory.md";
const MAX_ROUNDS = 10;

interface ApiMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
}

export interface Plan {
	changes: Change[];
	status: "waiting" | "doing" | "done" | "skipped" | "undone";
	undo: Array<() => Promise<unknown>>;
	note?: string;
}

export interface ChatMessage {
	id: number;
	role: "user" | "assistant";
	text: string;
	/** Short notes about what the AI looked at, like "Read Garden plan". */
	activity: string[];
	plan?: Plan;
	error?: string;
	streaming?: boolean;
}

let nextId = 1;
let history: ApiMessage[] = [];
let sinceMemory = 0;

export const chat = $state({
	messages: [] as ChatMessage[],
	busy: false,
	memory: "",
	memoryLoaded: false,
});

// ---- Memory ----

export async function loadMemory() {
	if (!ws.cave) return "";
	chat.memory = (await ws.cave.exists(MEMORY_PATH)) ? await ws.cave.read(MEMORY_PATH) : "";
	chat.memoryLoaded = true;
	return chat.memory;
}

export async function saveMemory(text: string) {
	chat.memory = text;
	await ws.cave?.write(MEMORY_PATH, text);
}

async function remember(fact: string) {
	const now = chat.memory || (await loadMemory());
	const lines = now.trim() ? now.trimEnd().split("\n") : ["# What I know about you", ""];
	lines.push(`- ${fact}`);
	await saveMemory(`${lines.join("\n")}\n`);
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
			},
			(d) => (text += ((d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? ""))
		);
		if (text.trim().length > 20) await saveMemory(`${text.trim()}\n`);
		sinceMemory = 0;
	} catch {
		// Not important enough to bother the user; it will try again later.
	}
}

// ---- Talking ----

function system(memory: string): string {
	return `You are the AI helper built into Basalt, a note-taking app. You run entirely on the user's own computer: nothing they write ever leaves it. Be warm, clear and brief; plain words, short paragraphs, Markdown when it helps.

How Basalt works:
- A "cave" is a folder of notes. Notes are Markdown files; folders organize them and can have a color and an icon in the sidebar.
- Notes can link to each other with [[Note name]], and have tags like #idea.
- Boards are Trello-style notes with lists and cards (use create_board and add_card for them).
- The app's look (theme, colors, glass, wallpaper, fonts) can be changed with change_appearance.

How you work:
- Use list_cave, read_note, search_notes, list_tags and get_appearance freely to understand things before answering. Don't guess what's in a note: read it.
- Every change (making, editing, moving, renaming, deleting, looks, appearance) is only proposed. The user sees all your proposed changes as one plan and approves them. So never say you "did" something: say what you've planned, and that they can approve it below.
- For big or open-ended requests (like "set up my cave" or "organize everything"), first ask 2 to 4 short questions in a single message, then wait for the answers before planning. Then propose the whole thing at once: folders (with fitting colors and icons), starter notes with useful content, boards, a home page that links to the main notes.
- Put notes inside the folders you create by using paths like "School/Math/Homework".
- Only delete things when the user clearly asks.
- When you learn something lasting about the user (projects, likes, how they want you to talk), save it with remember.

${context()}
Today is ${new Date().toDateString()}.

Your memory of this person:
${memory.trim() || "(Nothing yet. This may be your first conversation.)"}`;
}

const say = (m: ChatMessage, patch: Partial<ChatMessage>) => Object.assign(chat.messages.find((x) => x.id === m.id) ?? m, patch);

export async function send(text: string) {
	if (chat.busy || !text.trim()) return;
	chat.busy = true;
	const memory = chat.memoryLoaded ? chat.memory : await loadMemory();
	chat.messages.push({ id: nextId++, role: "user", text, activity: [] });
	history.push({ role: "user", content: text });
	chat.messages.push({ id: nextId++, role: "assistant", text: "", activity: [], streaming: true });
	const reply = chat.messages[chat.messages.length - 1];
	const plan: Change[] = [];
	let changeId = 1;
	try {
		for (let round = 0; round < MAX_ROUNDS; round++) {
			let content = "";
			const calls: Array<{ id: string; name: string; args: string }> = [];
			const stopped = await stream({ messages: [{ role: "system", content: system(memory) }, ...history], tools: TOOLS, temperature: 0.5 }, (d) => {
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
				}
			});
			const real = calls.filter(Boolean);
			if (stopped || !real.length) {
				history.push({ role: "assistant", content });
				break;
			}
			history.push({ role: "assistant", content, tool_calls: real.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.args || "{}" } })) });
			if (content.trim()) say(reply, { text: `${reply.text}\n\n` });
			for (const call of real) {
				let args: Record<string, unknown> = {};
				try {
					args = JSON.parse(call.args || "{}") as Record<string, unknown>;
				} catch {
					history.push({ role: "tool", tool_call_id: call.id, content: "Those arguments weren't valid JSON. Try again." });
					continue;
				}
				let result: string;
				if (call.name === "remember") {
					await remember(String(args.fact ?? ""));
					reply.activity.push(`Remembered: ${String(args.fact ?? "")}`);
					result = "Saved to your memory.";
				} else if (WRITES.has(call.name)) {
					plan.push({ id: changeId++, tool: call.name, args, checked: true, ...describe(call.name, args) });
					result = "Added to the plan. The user will approve it after your reply; don't say it's done.";
				} else {
					result = look(call.name, args);
					reply.activity.push(activityLabel(call.name, args));
				}
				history.push({ role: "tool", tool_call_id: call.id, content: result });
			}
		}
		if (plan.length) say(reply, { plan: { changes: plan, status: "waiting", undo: [] } });
		if (!reply.text.trim()) say(reply, { text: plan.length ? "Here's what I'd like to do:" : "…" });
	} catch (e) {
		say(reply, { error: e instanceof Error ? e.message : String(e) });
	} finally {
		say(reply, { streaming: false });
		chat.busy = false;
	}
	if (++sinceMemory >= 4) void updateMemory();
}

function activityLabel(tool: string, a: Record<string, unknown>): string {
	switch (tool) {
		case "list_cave":
			return "Looked through your cave";
		case "read_note":
			return `Read “${String(a.path ?? "")}”`;
		case "search_notes":
			return `Searched for “${String(a.query ?? "")}”`;
		case "list_tags":
			return "Checked your tags";
		case "get_appearance":
			return "Checked the app's look";
	}
	return tool;
}

/** Makes the checked changes of a plan, in order. */
export async function approve(m: ChatMessage) {
	const plan = m.plan;
	if (!plan || plan.status !== "waiting") return;
	plan.status = "doing";
	let done = 0, failed = 0;
	for (const c of plan.changes) {
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
}

export function skip(m: ChatMessage) {
	if (!m.plan || m.plan.status !== "waiting") return;
	m.plan.status = "skipped";
	history.push({ role: "user", content: "(I decided not to make those changes.)" });
}

/** Takes back everything a plan did, newest first. */
export async function undo(m: ChatMessage) {
	if (!m.plan || m.plan.status !== "done") return;
	for (const u of [...m.plan.undo].reverse()) await u().catch(() => {});
	m.plan.status = "undone";
	history.push({ role: "user", content: "(I undid those changes.)" });
}

/** Starts over, saving what was learned to memory first. */
export async function newChat() {
	const old = history;
	history = [];
	if (old.length > 1) void updateMemory(old);
	chat.messages = [];
	sinceMemory = 0;
}
