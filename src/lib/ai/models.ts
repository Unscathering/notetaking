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
	/** 1 to 5, for the little bars. */
	speed: number;
	smarts: number;
}

const hf = (repo: string, file: string) => `https://huggingface.co/${repo}/resolve/main/${file}`;

export const MODELS: ModelChoice[] = [
	{ id: "tiny", name: "Tiny", about: "Qwen 2.5, 1.5B. Quick answers on any computer, but simple.", file: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf", url: hf("bartowski/Qwen2.5-1.5B-Instruct-GGUF", "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"), sizeGb: 1.0, needsMb: 1800, layers: 28, speed: 5, smarts: 1 },
	{ id: "fast", name: "Fast", about: "Llama 3.2, 3B. Snappy and good at short writing jobs.", file: "Llama-3.2-3B-Instruct-Q4_K_M.gguf", url: hf("bartowski/Llama-3.2-3B-Instruct-GGUF", "Llama-3.2-3B-Instruct-Q4_K_M.gguf"), sizeGb: 2.0, needsMb: 3000, layers: 28, speed: 4, smarts: 2 },
	{ id: "balanced", name: "Balanced", about: "Qwen 2.5, 7B. Good writer and reliable at organizing your cave.", file: "Qwen2.5-7B-Instruct-Q4_K_M.gguf", url: hf("bartowski/Qwen2.5-7B-Instruct-GGUF", "Qwen2.5-7B-Instruct-Q4_K_M.gguf"), sizeGb: 4.7, needsMb: 5600, layers: 28, speed: 3, smarts: 4 },
	{ id: "smart", name: "Smart", about: "Qwen 2.5, 14B. The most thoughtful, for big plans. Needs a strong graphics card.", file: "Qwen2.5-14B-Instruct-Q4_K_M.gguf", url: hf("bartowski/Qwen2.5-14B-Instruct-GGUF", "Qwen2.5-14B-Instruct-Q4_K_M.gguf"), sizeGb: 9.0, needsMb: 10500, layers: 48, speed: 2, smarts: 5 },
];

export interface Hardware {
	/** Free graphics memory on the best card, in MB (0 without one). */
	vramMb: number;
	ramMb: number;
	gpuName: string;
}

/** The model that suits this computer best. */
export function recommended(hw: Hardware): ModelChoice {
	if (hw.vramMb >= 10500) return MODELS[3];
	if (hw.vramMb >= 5000) return MODELS[2];
	if (hw.vramMb >= 2800 || hw.ramMb >= 12000) return MODELS[1];
	return MODELS[0];
}

/** How well a model will run here, in plain words. */
export function fit(m: ModelChoice, hw: Hardware): "great" | "ok" | "slow" {
	if (hw.vramMb >= m.needsMb) return "great";
	if (hw.vramMb + hw.ramMb * 0.5 >= m.needsMb * 1.2) return "ok";
	return "slow";
}

/** How many layers go on the graphics card: all if it fits, else a share. */
export function gpuLayers(m: ModelChoice | undefined, hw: Hardware): number {
	if (!m) return hw.vramMb > 2000 ? 99 : 0;
	if (hw.vramMb >= m.needsMb) return 99;
	return Math.max(0, Math.floor((m.layers * (hw.vramMb - 700)) / (m.needsMb - 700)));
}
