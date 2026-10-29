<script lang="ts">
	// "Clip a web page": paste a link, get the article as a clean note.
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { clip, saveClip } from "../clip";
	import { helperReady } from "../ai/writer";
	import { stream } from "../ai/engine.svelte";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();
	let url = $state("");
	let summarize = $state(false);
	let step = $state("");
	let error = $state("");
	let input: HTMLInputElement | undefined = $state();
	const canSummarize = helperReady();

	$effect(() => {
		input?.focus();
		// A link already on the clipboard fills itself in.
		void navigator.clipboard
			?.readText()
			.then((t) => {
				if (!url && /^https?:\/\/\S+$/.test(t.trim())) url = t.trim();
			})
			.catch(() => {});
	});

	async function go() {
		const link = url.trim();
		if (!/^https?:\/\/\S+$/.test(link)) {
			error = "Paste a whole web address, starting with http:// or https://";
			return;
		}
		error = "";
		try {
			step = "Fetching the page…";
			const c = await clip(link);
			let summary = "";
			if (summarize && canSummarize) {
				step = "Summarizing…";
				await stream(
					{
						messages: [
							{ role: "system", content: "Summarize the article in 3 to 5 short bullet points (Markdown, starting with -). Only what the article says. Reply with only the bullets." },
							{ role: "user", content: `${c.title}\n\n${c.markdown.slice(0, 12000)}` },
						],
						temperature: 0.3,
						effort: "low",
					},
					(d) => (summary += (d.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content ?? "")
				);
			}
			await saveClip(link, c, summary || undefined);
			ws.modal = null;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			step = "";
		}
	}
</script>

<div class="scrim" transition:fade={{ duration: ms }} onclick={() => (ws.modal = null)} role="presentation"></div>
<div class="box" transition:fly={{ y: 12, duration: ms, easing: cubicOut }} role="dialog" aria-label="Clip a web page">
	<h2>{@html icon("globe", 18)} Clip a web page</h2>
	<p>Paste a link. Basalt keeps just the article (no menus or ads) as a note in <b>Clippings</b>, with where it came from.</p>
	<input bind:this={input} bind:value={url} placeholder="https://…" onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") void go(); if (e.key === "Escape") ws.modal = null; }} disabled={!!step} />
	{#if canSummarize}
		<label><input type="checkbox" bind:checked={summarize} disabled={!!step} /> Add a short summary from the AI at the top</label>
	{/if}
	{#if error}<p class="problem">{error}</p>{/if}
	<div class="row">
		{#if step}<span class="step"><span class="spin"></span>{step}</span>{/if}
		<button class="ghost" onclick={() => (ws.modal = null)} disabled={!!step}>Cancel</button>
		<button class="primary" onclick={go} disabled={!!step || !url.trim()}>{@html icon("download", 14)} Clip it</button>
	</div>
</div>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 50;
		background: color-mix(in srgb, black 35%, transparent);
	}
	.box {
		position: fixed;
		top: 22%;
		left: 50%;
		z-index: 51;
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: min(540px, calc(100vw - 32px));
		translate: -50% 0;
		padding: 22px;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--glass-edge), 0 28px 70px rgba(0, 0, 0, 0.4);
		isolation: isolate;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--heading);
		font-size: 17px;
	}
	h2 :global(svg) {
		color: var(--accent);
	}
	p {
		margin: 0;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.5;
	}
	input:not([type="checkbox"]) {
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		outline: 0;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		color: var(--text);
		font: 13.5px var(--font-code);
	}
	input:focus {
		border-color: var(--accent);
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text);
		font-size: 13px;
		cursor: pointer;
	}
	label input {
		accent-color: var(--accent);
	}
	.problem {
		padding: 8px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 15%, transparent);
		color: var(--text);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}
	.step {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-right: auto;
		color: var(--muted);
		font-size: 12.5px;
	}
	.spin {
		width: 12px;
		height: 12px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.primary {
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
	.ghost {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
</style>
