// Voice typing: record from the mic, turn it into text on this PC
// (src-tauri/src/speech.rs runs whisper.cpp), and hand the text back.
// Nothing is sent anywhere; the recording is deleted once it's text.
import { inDesktopApp } from "./cave";

export const VOICES = [
	{ id: "base", name: "Quick", about: "150 MB. Fast and good for everyday dictation.", sizeMb: 148 },
	{ id: "small", name: "Accurate", about: "490 MB. Better with accents, names and noisy rooms; a bit slower.", sizeMb: 488 },
] as const;

const KEY = "basalt.voice";

export const speech = $state({
	phase: (inDesktopApp ? "unknown" : "unavailable") as "unknown" | "setup" | "ready" | "unavailable",
	models: [] as string[],
	model: localStorage.getItem(KEY) ?? "base",
	recording: false,
	seconds: 0,
	/** Turning the recording into text. */
	busy: false,
	download: null as { done: number; total: number } | null,
	error: "",
	/** How loud it is right now, 0 to 1, for the little meter. */
	level: 0,
});

async function invoke<T>(cmd: string, args?: Record<string, unknown>) {
	const core = await import("@tauri-apps/api/core");
	return core.invoke<T>(cmd, args);
}

export async function refreshSpeech() {
	if (!inDesktopApp) return;
	const s = await invoke<{ engine: boolean; models: string[] }>("speech_status");
	speech.models = s.models;
	const have = (id: string) => s.models.includes(`ggml-${id}.bin`);
	if (!have(speech.model)) speech.model = VOICES.find((v) => have(v.id))?.id ?? speech.model;
	speech.phase = s.engine && have(speech.model) ? "ready" : "setup";
}

/** Downloads the speech engine and a voice, once. */
export async function installSpeech(model: string) {
	speech.error = "";
	speech.download = { done: 0, total: 0 };
	const { listen } = await import("@tauri-apps/api/event");
	const stop = await listen<{ what: string; done: number; total: number }>("ai-progress", (e) => {
		if (e.payload.what.startsWith("speech")) speech.download = { done: e.payload.done, total: e.payload.total };
	});
	try {
		await invoke("speech_install", { model });
		speech.model = model;
		localStorage.setItem(KEY, model);
		await refreshSpeech();
	} catch (e) {
		speech.error = String(e);
	} finally {
		stop();
		speech.download = null;
	}
}

// ---- Recording ----

let rec: { stream: MediaStream; ctx: AudioContext; node: ScriptProcessorNode; chunks: Float32Array[]; timer: ReturnType<typeof setInterval> } | null = null;
const MAX_SECONDS = 600;

export async function startRecording() {
	if (rec) return;
	speech.error = "";
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
		// Whisper listens at 16 kHz; the browser converts for us.
		const ctx = new AudioContext({ sampleRate: 16000 });
		const source = ctx.createMediaStreamSource(stream);
		const node = ctx.createScriptProcessor(4096, 1, 1);
		const chunks: Float32Array[] = [];
		node.onaudioprocess = (e) => {
			const data = e.inputBuffer.getChannelData(0);
			chunks.push(new Float32Array(data));
			let peak = 0;
			for (let i = 0; i < data.length; i += 16) peak = Math.max(peak, Math.abs(data[i]));
			speech.level = Math.min(1, peak * 2);
		};
		source.connect(node);
		node.connect(ctx.destination);
		speech.seconds = 0;
		const timer = setInterval(() => {
			speech.seconds++;
			if (speech.seconds >= MAX_SECONDS) void stopRecording();
		}, 1000);
		rec = { stream, ctx, node, chunks, timer };
		speech.recording = true;
	} catch (e) {
		speech.error = e instanceof DOMException && e.name === "NotAllowedError" ? "Basalt isn't allowed to use the microphone. Allow it in Windows Settings → Privacy → Microphone." : `Couldn't start the microphone: ${String(e)}`;
	}
}

/** 16-bit mono WAV, which whisper reads directly. */
export function wav(chunks: Float32Array[], rate: number): Uint8Array {
	const length = chunks.reduce((n, c) => n + c.length, 0);
	const buf = new DataView(new ArrayBuffer(44 + length * 2));
	const text = (at: number, s: string) => [...s].forEach((ch, i) => buf.setUint8(at + i, ch.charCodeAt(0)));
	text(0, "RIFF");
	buf.setUint32(4, 36 + length * 2, true);
	text(8, "WAVE");
	text(12, "fmt ");
	buf.setUint32(16, 16, true);
	buf.setUint16(20, 1, true);
	buf.setUint16(22, 1, true);
	buf.setUint32(24, rate, true);
	buf.setUint32(28, rate * 2, true);
	buf.setUint16(32, 2, true);
	buf.setUint16(34, 16, true);
	text(36, "data");
	buf.setUint32(40, length * 2, true);
	let at = 44;
	for (const c of chunks) for (const s of c) buf.setInt16((at += 2) - 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true);
	return new Uint8Array(buf.buffer);
}

/** Stops and returns what was said, as text ("" if nothing). */
export async function stopRecording(): Promise<string> {
	const r = rec;
	if (!r) return "";
	rec = null;
	clearInterval(r.timer);
	r.node.disconnect();
	for (const t of r.stream.getTracks()) t.stop();
	const rate = r.ctx.sampleRate;
	await r.ctx.close();
	speech.recording = false;
	speech.level = 0;
	if (speech.seconds < 1 && r.chunks.length < 4) return "";
	speech.busy = true;
	try {
		const fs = await import("@tauri-apps/plugin-fs");
		const { appLocalDataDir } = await import("@tauri-apps/api/path");
		const dir = `${(await appLocalDataDir()).replace(/[\\/]+$/, "")}/speech`;
		await fs.mkdir(dir, { recursive: true });
		const file = `${dir}/recording-${Date.now()}.wav`;
		await fs.writeFile(file, wav(r.chunks, rate));
		return await invoke<string>("speech_transcribe", { wav: file, model: speech.model, language: null });
	} catch (e) {
		speech.error = String(e);
		return "";
	} finally {
		speech.busy = false;
	}
}

export function cancelRecording() {
	const r = rec;
	if (!r) return;
	rec = null;
	clearInterval(r.timer);
	r.node.disconnect();
	for (const t of r.stream.getTracks()) t.stop();
	void r.ctx.close();
	speech.recording = false;
	speech.level = 0;
}
