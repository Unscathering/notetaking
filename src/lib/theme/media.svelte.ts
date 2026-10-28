// Moving backgrounds (GIFs and short videos) and pictures of your own are kept
// in the app's own storage on this computer, not inside the theme, so they can
// be big without slowing anything down. A theme only remembers their name.
import { SvelteMap } from "svelte/reactivity";

const DB = "basalt-media", STORE = "files";
/** Longest moving background allowed, in seconds. */
export const MAX_SECONDS = 15;
const MAX_BYTES = 120 * 1024 * 1024;

const urls = new SvelteMap<string, string>();
const loading = new Set<string>();

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const req = fn(db.transaction(STORE, mode).objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

/** A ready-to-use address for a stored file, or "" while it loads. */
export function mediaUrl(id: string): string {
	const url = urls.get(id);
	if (url) return url;
	if (!loading.has(id) && typeof indexedDB !== "undefined") {
		loading.add(id);
		void run<Blob | undefined>("readonly", (s) => s.get(id)).then((blob) => {
			if (blob) urls.set(id, URL.createObjectURL(blob));
		}).catch(() => {});
	}
	return "";
}

/** Total length of an animated GIF in seconds, read from its frame delays. */
function gifSeconds(bytes: Uint8Array): number {
	let i = 13, hundredths = 0;
	// Skip the header, and the color table if there is one.
	if (bytes[10] & 0x80) i += 3 * 2 ** ((bytes[10] & 7) + 1);
	const skipBlocks = () => {
		while (i < bytes.length && bytes[i] !== 0) i += bytes[i] + 1;
		i++;
	};
	while (i < bytes.length) {
		const kind = bytes[i];
		if (kind === 0x21) {
			// An extension. The timing one carries the frame's delay in hundredths of a second.
			if (bytes[i + 1] === 0xf9) {
				const delay = bytes[i + 4] | (bytes[i + 5] << 8);
				// Browsers play very short delays at 0.1 seconds.
				hundredths += delay < 2 ? 10 : delay;
			}
			i += 2;
			skipBlocks();
		} else if (kind === 0x2c) {
			// A frame: its description, maybe its own colors, then the picture data.
			const packed = bytes[i + 9];
			i += 10;
			if (packed & 0x80) i += 3 * 2 ** ((packed & 7) + 1);
			i++;
			skipBlocks();
		} else break;
	}
	return hundredths / 100;
}

function videoSeconds(file: Blob): Promise<number> {
	return new Promise((resolve, reject) => {
		const v = document.createElement("video");
		v.preload = "metadata";
		v.onloadedmetadata = () => {
			URL.revokeObjectURL(v.src);
			resolve(v.duration);
		};
		v.onerror = () => reject(new Error("This video can't be played here. Try an MP4 or WebM file."));
		v.src = URL.createObjectURL(file);
	});
}

/** Shrinks a still picture so it stays light. */
async function shrink(file: File): Promise<Blob> {
	const bmp = await createImageBitmap(file);
	const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
	if (scale === 1 && file.size < 3_000_000) return file;
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bmp.width * scale);
	canvas.height = Math.round(bmp.height * scale);
	canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
	return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.88));
}

/**
 * Checks and stores a background file. Returns its name and whether it's a
 * video or a picture (GIFs count as pictures; they animate on their own).
 * Throws an Error with a plain message when the file can't be used.
 */
export async function saveBackground(file: File): Promise<{ id: string; kind: "image" | "video" }> {
	if (file.size > MAX_BYTES) throw new Error("That file is too big. Try one under 120 MB.");
	let blob: Blob = file, kind: "image" | "video";
	if (file.type.startsWith("video/")) {
		const secs = await videoSeconds(file);
		if (secs > MAX_SECONDS + 0.5) throw new Error(`That video is ${Math.round(secs)} seconds long. Moving backgrounds can be up to ${MAX_SECONDS} seconds.`);
		kind = "video";
	} else if (file.type === "image/gif") {
		const secs = gifSeconds(new Uint8Array(await file.arrayBuffer()));
		if (secs > MAX_SECONDS + 0.5) throw new Error(`That GIF is ${Math.round(secs)} seconds long. Moving backgrounds can be up to ${MAX_SECONDS} seconds.`);
		kind = "image";
	} else if (file.type.startsWith("image/")) {
		blob = await shrink(file);
		kind = "image";
	} else throw new Error("Choose a picture, a GIF, or an MP4 or WebM video.");
	const id = `bg-${Date.now()}`;
	await run("readwrite", (s) => s.put(blob, id));
	urls.set(id, URL.createObjectURL(blob));
	return { id, kind };
}

/** Forgets a stored file that's no longer used. */
export async function removeMedia(id: string) {
	const url = urls.get(id);
	if (url) URL.revokeObjectURL(url);
	urls.delete(id);
	await run("readwrite", (s) => s.delete(id)).catch(() => {});
}
