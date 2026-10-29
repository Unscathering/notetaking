// Starts, stops and talks to Basalt's local AI engine (see src-tauri/src/ai.rs).
// The engine only runs while you use the AI and goes to sleep after a few
// quiet minutes, so it takes no memory the rest of the time.
import { inDesktopApp } from "../cave";
import { MODELS, cpuExperts, gpuLayers, recommended, type Hardware } from "./models";
import { claudeStream, stopClaude, usingClaude } from "./claude.svelte";

export interface ModelFile {
	file: string;
	path: string;
	sizeMb: number;
}

const KEY = "basalt.ai";
const HW_KEY = "basalt.ai-hardware";
const SLEEP_MINUTES = 5;
/** For trying the AI in a browser: the address of an engine running elsewhere. */
const devUrl = () => (inDesktopApp ? "" : (localStorage.getItem("basalt.ai-dev-url") ?? ""));

function saved(): { model: string; writerModel: string } {
	try {
		return { model: "", writerModel: "", ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as { model?: string; writerModel?: string }) };
	} catch {
		return { model: "", writerModel: "" };
	}
}

export const ai = $state({
	/** "unknown" until checked; "setup" until an engine and model are ready. */
	phase: "unknown" as "unknown" | "setup" | "ready" | "unavailable",
	engine: false,
	models: [] as ModelFile[],
	hardware: null as Hardware | null,
	/** The model file in use. */
	model: saved().model,
	/** A smaller model just for writing help ("" to use the main one). */
	writerModel: saved().writerModel,
	/** Whether the writing help model is loaded. */
	writerRunning: false,
	folder: "",
	download: null as { what: string; done: number; total: number } | null,
	running: false,
	starting: false,
	error: "",
});

const remember = () => localStorage.setItem(KEY, JSON.stringify({ model: ai.model, writerModel: ai.writerModel }));

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	const core = await import("@tauri-apps/api/core");
	return core.invoke<T>(cmd, args);
}

/** Looks at what's installed and what this computer can run. */
export async function refresh() {
	if (devUrl() === "setup") {
		// For previews: what setup looks like on a PC like yours.
		Object.assign(ai, { phase: "setup", engine: true, models: [], model: "", hardware: { vramMb: 5900, ramMb: 16000, gpuName: "NVIDIA GeForce RTX 4050 Laptop GPU" } });
		return;
	}
	if (devUrl()) {
		Object.assign(ai, { phase: "ready", engine: true, models: [{ file: "Test model", path: "", sizeMb: 0 }], model: "Test model", hardware: { vramMb: 6000, ramMb: 16000, gpuName: "Test" } });
		return;
	}
	if (!inDesktopApp) {
		ai.phase = "unavailable";
		return;
	}
	const s = await invoke<{ engine: boolean; models: ModelFile[]; ramMb: number; running: boolean; folder: string }>("ai_status");
	Object.assign(ai, { engine: s.engine, models: s.models, running: s.running, folder: s.folder });
	if (!s.models.some((m) => m.file === ai.model)) ai.model = s.models[0]?.file ?? "";
	if (!s.models.some((m) => m.file === ai.writerModel)) ai.writerModel = "";
	ai.phase = s.engine && ai.model ? "ready" : "setup";
	// Checking the graphics card takes a few seconds, so show what we found last
	// time straight away and check again quietly.
	try {
		ai.hardware = { ...(JSON.parse(localStorage.getItem(HW_KEY) ?? "null") as Hardware), ramMb: s.ramMb };
	} catch {
		ai.hardware = null;
	}
	// Not while a model is loaded: it takes graphics memory, so the card would look smaller than it is.
	if (s.engine && !ai.running && !ai.writerRunning) void checkHardware(s.ramMb);
	else ai.hardware ??= { vramMb: 0, ramMb: s.ramMb, gpuName: "" };
}

/** Finds the best graphics card: a real one beats graphics built into the processor. */
async function checkHardware(ramMb: number) {
	const devices = await invoke<Array<{ id: string; name: string; integrated: boolean; memoryMb: number; freeMb: number }>>("ai_devices").catch(() => []);
	const best = [...devices].sort((a, b) => Number(a.integrated) - Number(b.integrated) || b.freeMb - a.freeMb)[0];
	ai.hardware = best && !best.integrated ? { vramMb: best.freeMb, ramMb, gpuName: best.name, device: best.id } : { vramMb: 0, ramMb, gpuName: best?.name ?? "", device: best?.id };
	try {
		localStorage.setItem(HW_KEY, JSON.stringify(ai.hardware));
	} catch {
		// Fine; it checks again next time.
	}
}

async function withProgress(job: () => Promise<void>) {
	const { listen } = await import("@tauri-apps/api/event");
	const stop = await listen<{ what: string; done: number; total: number }>("ai-progress", (e) => (ai.download = e.payload));
	ai.error = "";
	try {
		await job();
	} catch (e) {
		ai.error = String(e);
	} finally {
		stop();
		ai.download = null;
	}
}

export const installEngine = () =>
	withProgress(async () => {
		ai.download = { what: "engine", done: 0, total: 0 };
		await invoke("ai_install_engine");
		await refresh();
	});

export const downloadModel = (id: string) =>
	withProgress(async () => {
		const m = MODELS.find((x) => x.id === id)!;
		ai.download = { what: m.file, done: 0, total: m.sizeGb * 1e9 };
		// Look the file up in its repository first, in case it was renamed; the link we know is the backup.
		const url = m.repo && m.quant ? await invoke<string>("ai_find_model", { repo: m.repo, quant: m.quant }).catch(() => m.url) : m.url;
		await invoke("ai_download_model", { url, file: m.file });
		ai.model = m.file;
		remember();
		await refresh();
	});

export const cancelDownload = () => invoke("ai_cancel_download");

/** Uses a model file the user already downloaded (copied into Basalt's folder). */
export const addModelFile = () =>
	withProgress(async () => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const path = await open({ multiple: false, directory: false, filters: [{ name: "AI model", extensions: ["gguf"] }] });
		if (typeof path !== "string") return;
		const file = await invoke<string>("ai_add_model", { path });
		ai.model = file;
		remember();
		await refresh();
	});

export async function useModel(file: string) {
	await stop();
	ai.model = file;
	remember();
}

/** The model file the main engine really has loaded ("" if it's asleep, or outside the desktop app). */
export async function loadedModel(): Promise<string> {
	if (!inDesktopApp) return ai.model;
	return (await invoke<{ loaded?: string }>("ai_status")).loaded ?? "";
}

/** Picks the model for writing help ("" for the main one). */
export async function useWriterModel(file: string) {
	await stop();
	ai.writerModel = file === ai.model ? "" : file;
	remember();
}

/** Whether writing help has its own model loaded separately. */
const ownWriter = () => !!ai.writerModel && ai.writerModel !== ai.model && ai.models.some((m) => m.file === ai.writerModel);

export async function deleteModel(file: string) {
	if (ai.model === file || ai.writerModel === file) await stop();
	await invoke("ai_delete_model", { file });
	await refresh();
}

let sleepTimer: ReturnType<typeof setTimeout> | undefined;
/** Puts the engine to sleep after a few quiet minutes. */
function rest() {
	clearTimeout(sleepTimer);
	sleepTimer = setTimeout(() => void stop(), SLEEP_MINUTES * 60_000);
}

export async function stop() {
	clearTimeout(sleepTimer);
	if (inDesktopApp) await invoke("ai_stop").catch(() => {});
	ai.running = false;
	ai.writerRunning = false;
}

/** How much text, in tokens, the AI can keep in mind at once. */
export const CONTEXT = 16384;

/** Models that wouldn't start with the speed-ups on, this session. */
const plainStart = new Set<string>();
const cacheFile = (model: string) => `${model.replace(/\.gguf$/i, "").replace(/[^\w.-]+/g, "_")}.bin`;
let cacheSaved = false;

/**
 * Saves the main engine's chat slot (the instructions, tools and chat so far) to
 * disk, once per wake, so after a nap the next chat starts without working
 * through them again.
 */
export async function saveCache() {
	if (cacheSaved || !inDesktopApp || !ai.running || usingClaude() || plainStart.has(ai.model)) return;
	cacheSaved = true;
	await invoke("ai_cache", { action: "save", file: cacheFile(ai.model) }).catch(() => {});
}

/** The writing help model's smaller memory: it only ever sees a few paragraphs. */
const WRITER_CONTEXT = 4096;

type Slot = "main" | "writer";
const waking: Record<Slot, Promise<void> | null> = { main: null, writer: null };

/** Wakes an engine up if it's asleep. Calls while it's waking up wait for the same start. */
export function wake(slot: Slot = "main"): Promise<void> {
	if (slot === "writer" && !ownWriter()) slot = "main";
	const s = slot;
	return (waking[s] ??= start(s).finally(() => (waking[s] = null)));
}

/** Graphics memory the writing help model takes, in MB, when it runs alongside the main one. */
function writerMb(): number {
	const file = ownWriter() ? ai.models.find((m) => m.file === ai.writerModel) : undefined;
	const mb = file ? Math.round(file.sizeMb * 1.05) + 700 : 0;
	// Too little room for both: it runs on the processor instead, and takes none.
	return mb && (ai.hardware?.vramMb ?? 0) >= mb + 1500 ? mb : 0;
}

async function start(slot: Slot) {
	const running = slot === "writer" ? ai.writerRunning : ai.running;
	if (devUrl()) ai.running = true;
	if (devUrl() || running) return rest();
	const file = ai.models.find((m) => m.file === (slot === "writer" ? ai.writerModel : ai.model));
	if (!file) throw new Error("Pick a model first.");
	ai.starting = true;
	ai.error = "";
	try {
		const choice = MODELS.find((m) => m.file === file.file);
		const card = ai.hardware ?? { vramMb: 0, ramMb: 0, gpuName: "" };
		// The two share the graphics card: the writing model is small and goes first,
		// the main one plans around it.
		const writer = writerMb();
		const hw = slot === "writer" ? card : { ...card, vramMb: Math.max(0, card.vramMb - writer) };
		// Speed-ups (guessing ahead, a saved prompt cache) need a recent engine; if one won't start with them, it starts without.
		const speedups = !plainStart.has(file.file);
		const args = {
			speedups,
			mtp: /mtp/i.test(file.file),
			model: file.path,
			gpuLayers: slot === "writer" && !writer ? 0 : gpuLayers(choice, hw),
			cpuMoe: cpuExperts(choice, hw),
			context: slot === "writer" ? WRITER_CONTEXT : CONTEXT,
			slot,
		};
		const tries = [
			{ ...args, device: hw.device && hw.vramMb ? hw.device : null },
			// Older engines don't know how to pick a card, or the speed-ups.
			...(speedups ? [{ ...args, device: hw.device && hw.vramMb ? hw.device : null, speedups: false, mtp: false }] : []),
			{ ...args, device: null, speedups: false, mtp: false },
		];
		for (let i = 0; ; i++) {
			try {
				await invoke("ai_start", tries[i]);
				if (!tries[i].speedups) plainStart.add(file.file);
				break;
			} catch (e) {
				if (i === tries.length - 1) throw e;
			}
		}
		if (slot === "writer") ai.writerRunning = true;
		else {
			ai.running = true;
			cacheSaved = false;
			// Pick up where the last chat's start left off, if this model saved one.
			if (!plainStart.has(file.file)) await invoke("ai_cache", { action: "restore", file: cacheFile(file.file) }).catch(() => {});
		}
		rest();
	} finally {
		ai.starting = false;
	}
}

export const recommendedModel = () => recommended(ai.hardware ?? { vramMb: 0, ramMb: 8000, gpuName: "" });

let stopRequested = false;
/** Whether writing help's engine is awake (its own, or the main one it shares). */
export const writerAwake = () => (ownWriter() ? ai.writerRunning : ai.running);

export function stopAnswer() {
	stopRequested = true;
	stopClaude();
	if (inDesktopApp) void invoke("ai_stop_chat");
}

/**
 * Sends a chat request and calls `onEvent` with each streamed piece
 * (OpenAI-style "data:" lines from the engine).
 */
export async function stream(body: object, onEvent: (data: Record<string, unknown>) => void, slot: Slot = "main") {
	stopRequested = false;
	if (usingClaude()) {
		await claudeStream(body as Parameters<typeof claudeStream>[0], (d) => !stopRequested && onEvent(d));
		return stopRequested;
	}
	if (slot === "writer" && !ownWriter()) slot = "main";
	await wake(slot);
	let buffer = "";
	const feed = (text: string) => {
		buffer += text;
		let nl: number;
		while ((nl = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, nl).trim();
			buffer = buffer.slice(nl + 1);
			if (!line.startsWith("data:")) continue;
			const data = line.slice(5).trim();
			if (data === "[DONE]") continue;
			try {
				onEvent(JSON.parse(data) as Record<string, unknown>);
			} catch {
				// A broken line; skip it.
			}
		}
	};
	// Answer straight away rather than thinking out loud first (Qwen3), or think
	// briefly (gpt-oss, which always thinks; the thinking comes separately).
	const effort = (body as { effort?: string }).effort === "high" ? "high" : (body as { effort?: string }).effort === "medium" ? "medium" : "low";
	const json = JSON.stringify({ ...body, stream: true, chat_template_kwargs: { enable_thinking: false, reasoning_effort: effort } });
	const url = devUrl();
	if (url) {
		const res = await fetch(`${url}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: json });
		if (!res.ok || !res.body) throw new Error(`The AI engine said ${res.status}.`);
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		for (;;) {
			const { done, value } = await reader.read();
			if (done || stopRequested) break;
			feed(dec.decode(value, { stream: true }));
		}
	} else {
		const { Channel } = await import("@tauri-apps/api/core");
		const channel = new Channel<string>();
		channel.onmessage = (piece) => !stopRequested && feed(piece);
		await invoke("ai_chat", { body: json, onChunk: channel, slot });
	}
	feed("\n");
	rest();
	return stopRequested;
}
