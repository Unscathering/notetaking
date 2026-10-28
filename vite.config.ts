import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri expects a fixed port in development and plain files when built.
export default defineConfig({
	plugins: [svelte()],
	clearScreen: false,
	server: { port: 1420, strictPort: true },
	build: { target: "es2022", outDir: "dist" },
});
