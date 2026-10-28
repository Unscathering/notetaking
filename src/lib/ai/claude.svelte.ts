// Claude, through Anthropic's API, for when you'd rather have a much stronger
// AI than one that fits on your PC. Off unless you turn it on and add your own
// API key. While it's on, your messages and the notes it reads are sent to
// Anthropic (the panel says so); the key stays on this PC.
//
// The rest of Basalt's AI speaks the local engine's message format, so this
// file translates both ways: requests become Messages API calls through the
// official SDK, and Claude's streamed answer comes back as the same pieces the
// engine sends. Claude's own answers are kept exactly as they came (`raw`) and
// sent back unchanged, as its API requires.
import type Anthropic from "@anthropic-ai/sdk";

type Beta = Anthropic.Beta.Messages.BetaMessageParam;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;
type Effort = "low" | "medium" | "high";

const KEY = "basalt.claude";

export const CLAUDE_MODELS = [
	{ id: "claude-opus-5-5", name: "Claude Opus 5.5", about: "The smartest. About 1 to 5 cents a message.", fallbacks: true },
	{ id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", about: "Very capable and quicker. About half the price of Opus.", fallbacks: true },
	{ id: "claude-haiku-5-5", name: "Claude Haiku 5.5", about: "Fast and very cheap. Fine for grammar and quick questions.", fallbacks: false },
] as const;

function load() {
	try {
		return { on: false, key: "", model: "claude-opus-5-5", ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as object) };
	} catch {
		return { on: false, key: "", model: "claude-opus-5-5" };
	}
}

/** Whether Claude is in use, the API key and which model. Kept in this PC's app storage. */
export const cloud: { on: boolean; key: string; model: string } = $state(load());

export function saveCloud() {
	try {
		localStorage.setItem(KEY, JSON.stringify(cloud));
	} catch {
		// Not saved this time.
	}
}

/** Claude is on and has a key. */
export const usingClaude = () => cloud.on && cloud.key.trim().length > 0;

export const claudeName = () => CLAUDE_MODELS.find((m) => m.id === cloud.model)?.name ?? cloud.model;

// ---- The engine's format ----

interface EngineMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
	/** Claude's answer exactly as it came, to send back unchanged. */
	raw?: unknown[];
}

interface EngineRequest {
	messages: EngineMessage[];
	tools?: Array<{ function: { name: string; description: string; parameters: Record<string, unknown> } }>;
	/** How hard Claude thinks: low for quick jobs like grammar, medium for the chat. */
	effort?: Effort;
}

const parse = (s: string) => {
	try {
		return JSON.parse(s || "{}") as Record<string, unknown>;
	} catch {
		return {};
	}
};

/** The conversation in Claude's format: tool results go together in one user turn after the call. */
function convert(list: EngineMessage[]): { system: string; messages: Beta[] } {
	const system = list.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
	const messages: Beta[] = [];
	for (const m of list) {
		if (m.role === "system") continue;
		if (m.role === "tool") {
			const result: Block = { type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: m.content };
			const last = messages.at(-1);
			if (last?.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) last.content.push(result);
			else messages.push({ role: "user", content: [result] });
		} else if (m.role === "assistant") {
			const content: Block[] = m.raw
				? (m.raw as Block[])
				: [...(m.content.trim() ? [{ type: "text" as const, text: m.content }] : []), ...(m.tool_calls ?? []).map((c) => ({ type: "tool_use" as const, id: c.id, name: c.function.name, input: parse(c.function.arguments) }))];
			if (content.length) messages.push({ role: "assistant", content });
		} else messages.push({ role: "user", content: m.content });
	}
	return { system, messages };
}

/** For trying it in a browser preview against a stand-in server; never used in the desktop app. */
const devServer = () => {
	const url = !("__TAURI_INTERNALS__" in window) && localStorage.getItem("basalt.claude-dev-url");
	return url ? { baseURL: url } : {};
};

let current: { abort(): void } | null = null;

/** Stops the answer Claude is writing. */
export function stopClaude() {
	current?.abort();
}

/**
 * Sends an engine-style request to Claude and calls `onEvent` with engine-style
 * pieces as the answer streams in, then once with `basalt_raw` (the answer as
 * Claude sent it, to keep in the history).
 */
export async function claudeStream(body: EngineRequest, onEvent: (data: Record<string, unknown>) => void) {
	const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
	// The key is the user's own and stays on this PC; Basalt talks to Anthropic directly.
	const client = new AnthropicClient({ apiKey: cloud.key.trim(), dangerouslyAllowBrowser: true, ...devServer() });
	const { system, messages } = convert(body.messages);
	const tools = (body.tools ?? []).map((t, i, all) => ({
		name: t.function.name,
		description: t.function.description,
		input_schema: t.function.parameters as Anthropic.Beta.Messages.BetaTool.InputSchema,
		// The tool list never changes, so it's cached between messages.
		...(i === all.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
	}));
	const model = CLAUDE_MODELS.find((m) => m.id === cloud.model) ?? CLAUDE_MODELS[0];
	const stream = client.beta.messages.stream({
		model: model.id,
		max_tokens: 32000,
		...(system ? { system } : {}),
		messages,
		...(tools.length ? { tools } : {}),
		output_config: { effort: body.effort ?? "medium" },
		// If Claude declines, Anthropic's server tries a fitting fallback model.
		...(model.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
	});
	current = stream;
	// Claude's tool calls, numbered the way the engine numbers them.
	const toolIndex = new Map<number, number>();
	try {
		for await (const event of stream) {
			if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
				const n = toolIndex.size;
				toolIndex.set(event.index, n);
				onEvent({ choices: [{ delta: { tool_calls: [{ index: n, id: event.content_block.id, function: { name: event.content_block.name, arguments: "" } }] } }] });
			} else if (event.type === "content_block_delta") {
				if (event.delta.type === "text_delta") onEvent({ choices: [{ delta: { content: event.delta.text } }] });
				else if (event.delta.type === "input_json_delta" && toolIndex.has(event.index)) onEvent({ choices: [{ delta: { tool_calls: [{ index: toolIndex.get(event.index), function: { arguments: event.delta.partial_json } }] } }] });
			}
		}
		const final = await stream.finalMessage();
		if (final.stop_reason === "refusal") throw new Error("Claude declined to help with this one. Try asking another way, or switch to the AI on your PC.");
		if (final.stop_reason === "max_tokens" && final.content.some((b) => b.type === "tool_use")) throw new Error("Claude's answer was too long and got cut off. Try asking for less at once.");
		onEvent({ basalt_raw: final.content });
	} catch (e) {
		if (stream.aborted) return;
		throw new Error(explain(e));
	} finally {
		current = null;
	}
}

/** The SDK's errors, in plain words. */
function explain(e: unknown): string {
	const err = e as { status?: number; message?: string };
	if (err.status === 401) return "Claude didn't accept the API key. Check it under AI models.";
	if (err.status === 403) return "This API key isn't allowed to use that model.";
	if (err.status === 429) return "Claude is getting too many requests from this key. Wait a minute and try again.";
	if (err.status === 529 || (err.status ?? 0) >= 500) return "Anthropic's servers are busy. Try again in a moment.";
	if (err.status === 400) return `Claude couldn't read the request: ${err.message ?? ""}`;
	if (!err.status) return `Couldn't reach Claude. Check your internet connection. (${err.message ?? String(e)})`;
	return err.message ?? String(e);
}

/** Checks the key with a tiny request. */
export async function testClaude(): Promise<string> {
	let text = "";
	await claudeStream({ messages: [{ role: "user", content: "Reply with just the word: ready" }], effort: "low" }, (d) => {
		text += (d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "";
	});
	return text.trim();
}
