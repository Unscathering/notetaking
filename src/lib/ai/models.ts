// The AI models Basalt offers. All are free to use, run fully on this
// computer, and come as single GGUF files from Hugging Face.

export interface ModelChoice {
	id: string;
	name: string;
	/** One plain line about what it's like. */
	about: string;
	file: string;
	url: string;
	sizeGb: number;
	/** Graphics memory it needs to run fully on the graphics card, in MB. */
	needsMb: number;
	/** Its layer count, to split it when it doesn't fully fit. */
	layers: number;
	/**
	 * Mixture-of-experts models: the MB of experts in each layer. Only a few
	 * experts work on each word, so when the model doesn't fit, experts move to
	 * normal memory first and the rest stays on the graphics card.
	 */
	expertMb?: number;
	/** Its Hugging Face repository and size name: the download looks the file up there first, in case it was renamed. */
	repo?: string;
	quant?: string;
	/** 1 to 5, for the little bars. */
	speed: number;
	smarts: number;
}

const hf = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`;
/** A model in a Hugging Face repository, as a 4-bit (Q4_K_M) file. */
const q4 = (repo: string, file: string) => ({ file, url: hf(repo, file), repo, quant: "Q4_K_M" });

// Sizes allow for the chat memory (16K tokens, stored at half size) and the engine's own needs.
export const MODELS: ModelChoice[] = [
	{ id: "tiny", name: "Tiny", about: "Qwen3, 1.7B. Instant spelling and grammar fixes on any computer, but simple.", ...q4("unsloth/Qwen3-1.7B-GGUF", "Qwen3-1.7B-Q4_K_M.gguf"), sizeGb: 1.1, needsMb: 2450, layers: 28, speed: 5, smarts: 1 },
	{ id: "fast", name: "Fast", about: "Qwen3 Instruct, 4B. The best for quick text fixes, and fine for simple folder jobs.", ...q4("unsloth/Qwen3-4B-Instruct-2507-GGUF", "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"), sizeGb: 2.5, needsMb: 4200, layers: 36, speed: 5, smarts: 2 },
	{ id: "balanced", name: "Balanced", about: "Qwen3, 8B. A good everyday helper for notes, folders and dashboards.", ...q4("unsloth/Qwen3-8B-GGUF", "Qwen3-8B-Q4_K_M.gguf"), sizeGb: 5.0, needsMb: 6700, layers: 36, speed: 4, smarts: 3 },
	{ id: "sharp", name: "Sharp", about: "Qwen3.5, 9B. Newer and a step up from Balanced, at nearly the same speed.", ...q4("unsloth/Qwen3.5-9B-MTP-GGUF", "Qwen3.5-9B-MTP-Q4_K_M.gguf"), sizeGb: 5.7, needsMb: 7700, layers: 32, speed: 4, smarts: 4 },
	{ id: "smart", name: "Smart", about: "Qwen3, 14B. Careful with big jobs like setting up a whole cave. Needs a strong graphics card.", ...q4("unsloth/Qwen3-14B-GGUF", "Qwen3-14B-Q4_K_M.gguf"), sizeGb: 9.0, needsMb: 10850, layers: 40, speed: 3, smarts: 4 },
	{ id: "thinker", name: "Deep thinker", about: "OpenAI's gpt-oss, 20B. Thinks before it answers, so it plans big jobs well. Needs 12 GB of graphics memory or 16 GB of memory to share.", ...q4("ggml-org/gpt-oss-20b-GGUF", "gpt-oss-20b-mxfp4.gguf"), quant: "mxfp4", sizeGb: 12.1, needsMb: 13400, layers: 24, expertMb: 440, speed: 2, smarts: 5 },
	{ id: "brilliant", name: "Brilliant", about: "Qwen3 Instruct, 30B. The cleverest here, and still quick: parts of it wait in normal memory. Needs 32 GB of memory.", ...q4("unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF", "Qwen3-30B-A3B-Instruct-2507-Q4_K_M.gguf"), sizeGb: 18.6, needsMb: 20500, layers: 48, expertMb: 356, speed: 3, smarts: 5 },
];

/** Graphics memory left free when a model is split, so Windows and Basalt stay smooth. */
const HEADROOM_MB = 1200;

export interface Hardware {
	/** Free graphics memory on the best card, in MB (0 without one). */
	vramMb: number;
	ramMb: number;
	gpuName: string;
	/** The engine's name for the card to use, like "Vulkan1". */
	device?: string;
}

/** The model that suits this computer best. */
export function recommended(hw: Hardware): ModelChoice {
	const by = (id: string) => MODELS.find((m) => m.id === id)!;
	if (hw.vramMb >= 10000) return by("smart");
	if (hw.vramMb >= 6500) return by("balanced");
	if (hw.vramMb >= 3500 || hw.ramMb >= 12000) return by("fast");
	return by("tiny");
}

/** Graphics memory a model needs when its experts all sit in normal memory. */
const coreMb = (m: ModelChoice) => m.needsMb - (m.expertMb ?? 0) * m.layers;

/** How well a model will run here, in plain words. */
export function fit(m: ModelChoice, hw: Hardware): "great" | "ok" | "slow" {
	if (hw.vramMb >= m.needsMb) return "great";
	// Experts in normal memory cost little speed, as long as there's room for them.
	if (m.expertMb && hw.vramMb >= coreMb(m) + HEADROOM_MB && hw.ramMb * 0.6 >= m.needsMb - hw.vramMb) return "ok";
	if (hw.vramMb + hw.ramMb * 0.5 >= m.needsMb * 1.2) return "ok";
	return "slow";
}

/** How many layers go on the graphics card: all if it fits, else a share. */
export function gpuLayers(m: ModelChoice | undefined, hw: Hardware): number {
	if (!m) return hw.vramMb > 2000 ? 99 : 0;
	if (hw.vramMb >= m.needsMb) return 99;
	// A mixture-of-experts model keeps all its layers on the card and moves experts out instead.
	if (m.expertMb && hw.vramMb >= coreMb(m) + HEADROOM_MB) return 99;
	return Math.max(0, Math.floor((m.layers * (hw.vramMb - 700)) / (m.needsMb - 700)));
}

/** For a mixture-of-experts model: how many layers keep their experts in normal memory. */
export function cpuExperts(m: ModelChoice | undefined, hw: Hardware): number {
	if (!m?.expertMb || hw.vramMb >= m.needsMb) return 0;
	if (hw.vramMb < coreMb(m) + HEADROOM_MB) return m.layers;
	return Math.min(m.layers, Math.ceil((m.needsMb - (hw.vramMb - HEADROOM_MB)) / m.expertMb));
}
