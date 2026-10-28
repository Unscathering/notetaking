// Starts, stops and talks to Basalt's local AI engine (see src-tauri/src/ai.rs).
// The engine only runs while you use the AI and goes to sleep after a few
// quiet minutes, so it takes no memory the rest of the time.
import { inDesktopApp } from "../cave";
import { MODELS, gpuLayers, recommended, type Hardware } from "./models";

export interface ModelFile {
	file: string;
	path: string;
	sizeMb: number;
}

const KEY = "basalt.ai";
const SLEEP_MINUTES = 5;
/** For trying the AI in a browser: the address of an engine running elsewhere. */
const devUrl = () => (inDesktopApp ? "" : (localStorage.getItem("basalt.ai-dev-url") ?? ""));

function saved(): { model: string } {
	try {
		return { model: "", ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as { model?: string }) };
	} catch {
		return { model: "" };
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
	folder: "",
	download: null as { what: string; done: number; total: number } | null,
	running: false,
	starting: false,
	error: "",
});

const remember = () => localStorage.setItem(KEY, JSON.stringify({ model: ai.model }));

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
	let vram = 0, gpu = "";
	if (s.engine) {
		const devices = await invoke<Array<{ name: string; memoryMb: number; freeMb: number }>>("ai_devices").catch(() => []);
		const best = devices.sort((a, b) => b.freeMb - a.freeMb)[0];
		if (best) (vram = best.freeMb), (gpu = best.name);
	}
	ai.hardware = { vramMb: vram, ramMb: s.ramMb, gpuName: gpu };
	if (!s.models.some((m) => m.file === ai.model)) ai.model = s.models[0]?.file ?? "";
	ai.phase = s.engine && ai.model ? "ready" : "setup";
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
		await invoke("ai_download_model", { url: m.url, file: m.file });
		ai.model = m.file;
		remember();
		await refresh();
	});

export const cancelDownload = () => invoke("ai_cancel_download");

export async function useModel(file: string) {
	await stop();
	ai.model = file;
	remember();
}

export async function deleteModel(file: string) {
	if (ai.model === file) await stop();
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
}

/** Wakes the engine up if it's asleep. */
export async function wake() {
	if (devUrl()) ai.running = true;
	if (devUrl() || ai.running) return rest();
	const file = ai.models.find((m) => m.file === ai.model);
	if (!file) throw new Error("Pick a model first.");
	ai.starting = true;
	ai.error = "";
	try {
		const choice = MODELS.find((m) => m.file === file.file);
		const layers = gpuLayers(choice, ai.hardware ?? { vramMb: 0, ramMb: 0, gpuName: "" });
		await invoke("ai_start", { model: file.path, gpuLayers: layers, context: 12288 });
		ai.running = true;
		rest();
	} finally {
		ai.starting = false;
	}
}

export const recommendedModel = () => recommended(ai.hardware ?? { vramMb: 0, ramMb: 8000, gpuName: "" });

let stopRequested = false;
export function stopAnswer() {
	stopRequested = true;
	if (inDesktopApp) void invoke("ai_stop_chat");
}

/**
 * Sends a chat request and calls `onEvent` with each streamed piece
 * (OpenAI-style "data:" lines from the engine).
 */
export async function stream(body: object, onEvent: (data: Record<string, unknown>) => void) {
	await wake();
	stopRequested = false;
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
	const json = JSON.stringify({ ...body, stream: true });
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
		await invoke("ai_chat", { body: json, onChunk: channel });
	}
	feed("\n");
	rest();
	return stopRequested;
}
