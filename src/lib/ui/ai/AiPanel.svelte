<script lang="ts">
	// The AI panel on the right: setup the first time, then the chat, the
	// memory note and the model settings.
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { addModelFile, ai, installEngine, refresh, stopAnswer } from "../../ai/engine.svelte";
	import { SvelteSet } from "svelte/reactivity";
	import { THINKING, chat, loadMemory, newChat, saveMemory, send, updateMemory } from "../../ai/agent.svelte";
	import { aiPanel } from "../../ai/panel.svelte";
	import { markdown } from "../../ai/markdown";
	import { MODELS } from "../../ai/models";
	import { ws } from "../../workspace.svelte";
	import { icon } from "../icons";
	import ModelPicker from "./ModelPicker.svelte";
	import PlanCard from "./PlanCard.svelte";
	import Privacy from "./Privacy.svelte";
	import Progress from "./Progress.svelte";

	let { ms }: { ms: number } = $props();

	let draft = $state("");
	let input: HTMLTextAreaElement | undefined = $state();
	let scroller: HTMLElement | undefined = $state();
	let memoryDraft = $state("");
	let memorySaved = $state(false);
	let checked = false;
	/** Steps whose details are showing, as "message:step". */
	const opened = new SvelteSet<string>();
	const toggle = (key: string) => (opened.has(key) ? opened.delete(key) : opened.add(key));

	// A new playful word every couple of seconds while the AI thinks.
	let word = $state(0);
	$effect(() => {
		if (!chat.busy) return;
		word = Math.floor(Math.random() * THINKING.length);
		const timer = setInterval(() => (word = (word + 1 + Math.floor(Math.random() * (THINKING.length - 1))) % THINKING.length), 2400);
		return () => clearInterval(timer);
	});

	$effect(() => {
		if (aiPanel.open && !checked) {
			checked = true;
			void refresh().catch((e) => (ai.error = String(e)));
		}
	});

	// Keep the newest message in view while it streams in.
	$effect(() => {
		void chat.messages.length;
		void chat.messages.at(-1)?.text;
		void chat.messages.at(-1)?.steps.length;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	});

	const modelName = $derived(MODELS.find((m) => m.file === ai.model)?.name ?? (ai.model ? ai.model.replace(/\.gguf$/, "") : "No model"));
	const status = $derived(ai.starting ? "Waking up…" : chat.busy ? "Thinking…" : ai.running ? "Ready" : "Sleeping");

	const SUGGESTIONS = [
		{ text: "Set up my cave for me", ico: "sparkles" },
		{ text: "Summarize the note I have open", ico: "file" },
		{ text: "What have I written about lately?", ico: "search" },
		{ text: "Give my folders fitting colors and icons", ico: "palette" },
	] as const;

	function grow() {
		if (!input) return;
		input.style.height = "auto";
		input.style.height = `${Math.min(160, input.scrollHeight)}px`;
	}

	async function submit(text = draft) {
		if (!text.trim() || chat.busy) return;
		draft = "";
		requestAnimationFrame(grow);
		await send(text.trim());
	}

	function keys(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void submit();
		}
	}

	/** [[links]] in replies open the note. */
	function clickReply(e: MouseEvent) {
		const a = (e.target as HTMLElement).closest("a[data-note]");
		if (a) void ws.follow(a.getAttribute("data-note") ?? "");
	}

	async function openMemory() {
		aiPanel.view = "memory";
		memoryDraft = await loadMemory();
		memorySaved = false;
	}
</script>

<aside class="ai" aria-label="AI">
	<header>
		{#if aiPanel.view !== "chat"}
			<button class="icon" onclick={() => (aiPanel.view = "chat")} title="Back">{@html icon("back", 16)}</button>
			<span class="title"><b>{aiPanel.view === "memory" ? "Memory" : "AI models"}</b></span>
		{:else}
			<span class="orb">{@html icon("sparkles", 15)}</span>
			<span class="title">
				<b>Basalt AI</b>
				{#if ai.phase === "ready"}<small><i class="dot" class:on={ai.running} class:busy={ai.starting || chat.busy}></i>{modelName} · {status}</small>{:else}<small>Private, on your PC</small>{/if}
			</span>
			{#if ai.phase === "ready"}
				<button class="icon" onclick={openMemory} title="Memory: what your AI remembers about you">{@html icon("brain", 16)}</button>
				<button class="icon" onclick={() => newChat()} title="New chat" disabled={chat.busy || !chat.messages.length}>{@html icon("plus", 16)}</button>
				<button class="icon" onclick={() => (aiPanel.view = "models")} title="AI models">{@html icon("settings", 16)}</button>
			{/if}
		{/if}
		<button class="icon" onclick={() => (aiPanel.open = false)} title="Close (Ctrl+J)">{@html icon("x", 16)}</button>
	</header>

	{#if ai.phase === "unknown"}
		<div class="center"><span class="spinner"></span></div>
	{:else if ai.phase === "unavailable"}
		<div class="scroll setup">
			<div class="hero"><span class="big-orb">{@html icon("sparkles", 26)}</span><h2>Your own AI, right on your PC</h2><p>The AI runs in the Basalt desktop app for Windows.</p></div>
			<Privacy />
		</div>
	{:else if ai.phase === "setup" || aiPanel.view === "models"}
		<div class="scroll setup" in:fade={{ duration: ms }}>
			{#if aiPanel.view !== "models"}
				<div class="hero">
					<span class="big-orb">{@html icon("sparkles", 26)}</span>
					<h2>Your own AI, right on your PC</h2>
					<p>It can write with you, answer questions about your notes and organize your whole cave, with your permission.</p>
				</div>
			{/if}
			<Privacy compact={aiPanel.view === "models"} />
			{#if !ai.engine}
				<section>
					<h3><span class="step">1</span> The AI engine</h3>
					<p class="hint">A small program (about 40 MB) that runs the AI on your graphics card. Basalt starts it only when you use the AI.</p>
					{#if ai.download}<Progress />{:else}<button class="primary wide" onclick={installEngine}>{@html icon("download", 14)} Download the engine</button>{/if}
				</section>
			{/if}
			<section class:dim={!ai.engine}>
				<h3>{#if aiPanel.view !== "models"}<span class="step">{ai.engine ? 1 : 2}</span>{/if} {aiPanel.view === "models" ? "Models" : "Pick a brain"}</h3>
				<p class="hint">Bigger models are smarter but slower. You can switch any time; each is a one-time download.</p>
				{#if ai.download && ai.download.what !== "engine"}<Progress />{/if}
				{#if ai.engine}
					<ModelPicker />
					<div class="own-model">
						<button class="ghost" disabled={!!ai.download} onclick={addModelFile}>{@html icon("upload", 13)} Use a model file I already have</button>
						<p class="hint">Downloads not working? Open a model's link in your browser, then pick the downloaded <code>.gguf</code> file here.</p>
						<div class="links">
							{#each MODELS as m (m.id)}<a href={m.url} onclick={(e) => { e.preventDefault(); void import("@tauri-apps/plugin-opener").then((o) => o.openUrl(m.url)); }}>{m.name} ({m.sizeGb} GB)</a>{/each}
						</div>
					</div>
				{/if}
			</section>
			{#if aiPanel.view === "models" && ai.folder}<p class="folder">Stored on this PC in {ai.folder}</p>{/if}
			{#if ai.error}<p class="problem">{ai.error}</p>{/if}
		</div>
	{:else if aiPanel.view === "memory"}
		<div class="scroll memory" in:fade={{ duration: ms }}>
			<p class="hint">What your AI remembers about you, so it gets to know you over time. It writes this itself after chats. Only you and your AI can see it: it's kept inside this cave, on this PC, hidden from your notes.</p>
			<textarea bind:value={memoryDraft} placeholder="Nothing yet. Chat a little and your AI will start remembering." oninput={() => (memorySaved = false)} onkeydown={(e) => e.stopPropagation()}></textarea>
			<div class="row">
				<button class="primary" onclick={async () => { await saveMemory(memoryDraft); memorySaved = true; }}>{memorySaved ? "Saved" : "Save"}</button>
				<button class="ghost" disabled={chat.messages.length < 2} onclick={async () => { await updateMemory(); memoryDraft = chat.memory; }}>Update from this chat</button>
				<button class="ghost danger" onclick={async () => { if (confirm("Make your AI forget everything it remembers about you?")) { await saveMemory(""); memoryDraft = ""; } }}>Forget all</button>
			</div>
		</div>
	{:else}
		<div class="scroll chat" bind:this={scroller} onclick={clickReply} role="presentation">
			{#if !chat.messages.length}
				<div class="empty" in:fade={{ duration: ms }}>
					<span class="big-orb">{@html icon("sparkles", 24)}</span>
					<h2>What can I help with?</h2>
					<p>I can read your notes, write with you, and set up or tidy your cave. I'll always show you a plan before changing anything.</p>
					<div class="private">{@html icon("lock", 12)} Private: I run only on this PC</div>
					<div class="suggestions">
						{#each SUGGESTIONS as s (s.text)}
							<button onclick={() => submit(s.text)}>{@html icon(s.ico, 14)}<span>{s.text}</span></button>
						{/each}
					</div>
				</div>
			{/if}
			{#each chat.messages as m (m.id)}
				<div class="msg {m.role}" in:fly={{ y: 8, duration: ms, easing: cubicOut }}>
					{#if m.role === "user"}
						<div class="bubble">{m.text}</div>
					{:else}
						{#if m.steps.length}
							<ul class="steps">
								{#each m.steps as st, i (i)}
									{@const key = `${m.id}:${i}`}
									<li class:active={st.active}>
										<button class="step-row" disabled={!st.detail} onclick={() => toggle(key)} aria-expanded={opened.has(key)}>
											<span class="s-ico">{#if st.active}<span class="mini-spin"></span>{:else}{@html icon(st.icon, 12)}{/if}</span>
											<span class="s-label">{st.label}</span>
											{#if st.detail}<span class="arrow" class:open={opened.has(key)}>{@html icon("chevron", 12)}</span>{/if}
										</button>
										{#if st.detail && opened.has(key)}<pre class="detail" transition:fade={{ duration: ms }}>{st.detail}</pre>{/if}
									</li>
								{/each}
							</ul>
						{/if}
						{#if m.text.trim()}
							<div class="reply" class:streaming={m.streaming}>{@html markdown(m.text)}</div>
						{:else if m.streaming}
							<div class="thinking">{@html icon("sparkles", 13)}{#key word}<span in:fade={{ duration: ms }}>{THINKING[word]}…</span>{/key}</div>
						{/if}
						{#if m.plan}<PlanCard {m} />{/if}
						{#if m.error}<p class="problem">{m.error}</p>{/if}
					{/if}
				</div>
			{/each}
		</div>

		<div class="composer">
			<div class="box">
				<textarea bind:this={input} bind:value={draft} rows="1" placeholder="Ask anything, or tell me what to do…" oninput={grow} onkeydown={keys}></textarea>
				{#if chat.busy}
					<button class="send stop" onclick={stopAnswer} title="Stop">{@html icon("stop", 14)}</button>
				{:else}
					<button class="send" disabled={!draft.trim()} onclick={() => submit()} title="Send (Enter)">{@html icon("send", 16)}</button>
				{/if}
			</div>
			<p class="foot">{@html icon("lock", 10)} Runs on this PC. Nothing leaves it.</p>
		</div>
	{/if}
</aside>

<style>
	.ai {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-width: 0;
		overflow: hidden;
		border-left: 1px solid var(--chrome-line);
		background-color: var(--surface-panel);
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		box-shadow: var(--glass-edge);
		border-radius: var(--float-radius);
	}
	header {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 50px;
		padding: 8px 10px 8px 14px;
		border-bottom: 1px solid var(--chrome-line);
	}
	.orb,
	.big-orb {
		display: grid;
		place-items: center;
		flex: none;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--accent), var(--link));
		color: var(--on-accent);
		box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 40%, transparent);
	}
	.big-orb {
		width: 52px;
		height: 52px;
		margin: 0 auto 12px;
	}
	.title {
		flex: 1;
		min-width: 0;
		line-height: 1.25;
	}
	.title b {
		display: block;
		font-size: 13.5px;
		color: var(--heading);
	}
	.title small {
		display: flex;
		align-items: center;
		gap: 5px;
		overflow: hidden;
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--muted);
	}
	.dot.on {
		background: #5fb878;
	}
	.dot.busy {
		background: var(--accent);
		animation: pulse 1s ease-in-out infinite;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	.icon {
		display: inline-flex;
		padding: 6px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.icon:hover:not(:disabled) {
		background: var(--hover);
		color: var(--text);
	}
	.icon:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 16px;
	}
	.center {
		flex: 1;
		display: grid;
		place-items: center;
	}
	.spinner {
		width: 22px;
		height: 22px;
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
	.hero,
	.empty {
		margin: 10px 0 18px;
		text-align: center;
	}
	h2 {
		margin: 0 0 6px;
		font-size: 17px;
		color: var(--heading);
	}
	.hero p,
	.empty p {
		margin: 0 auto;
		max-width: 300px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--muted);
	}
	section {
		margin-top: 20px;
		transition: opacity var(--dur) var(--ease);
	}
	section.dim {
		opacity: 0.5;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 4px;
		font-size: 13.5px;
		color: var(--heading);
	}
	.step {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 11px;
	}
	.hint {
		margin: 0 0 12px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--muted);
	}
	.own-model {
		margin-top: 14px;
	}
	.own-model .hint {
		margin: 8px 0 6px;
	}
	.own-model code {
		font: 11px var(--font-code);
	}
	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 12px;
	}
	.links a {
		color: var(--link);
		cursor: pointer;
	}
	.folder {
		margin: 16px 0 0;
		font-size: 11px;
		color: var(--muted);
		word-break: break-all;
	}
	.problem {
		margin: 10px 0 0;
		padding: 9px 12px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 15%, transparent);
		font-size: 12.5px;
		color: var(--text);
	}
	button.primary,
	button.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: var(--radius);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.primary {
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
	}
	.wide {
		width: 100%;
	}
	.ghost {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
	}
	.ghost.danger:hover {
		border-color: #e05d5d;
		color: #e05d5d;
	}
	.ghost:disabled {
		opacity: 0.45;
	}
	.private {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		margin: 12px 0 18px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--accent-soft);
		color: var(--text);
		font-size: 11.5px;
	}
	.suggestions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-align: left;
	}
	.suggestions button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		background: color-mix(in srgb, var(--raised) 50%, transparent);
		color: var(--text);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		transition: border-color var(--dur) var(--ease), transform var(--dur) var(--ease);
	}
	.suggestions button:hover {
		border-color: var(--accent);
		transform: translateX(2px);
	}
	.suggestions :global(svg) {
		flex: none;
		color: var(--accent);
	}
	.msg {
		margin-bottom: 16px;
	}
	.msg.user {
		display: flex;
		justify-content: flex-end;
	}
	.bubble {
		max-width: 85%;
		padding: 9px 13px;
		border-radius: 16px 16px 4px 16px;
		background: var(--accent-soft);
		color: var(--text);
		font-size: 13.5px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.steps {
		margin: 0 0 8px;
		padding: 0;
		list-style: none;
	}
	.step-row {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 3px 6px;
		border: 0;
		border-radius: calc(var(--radius) * 0.7);
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.step-row:hover:not(:disabled) {
		background: var(--hover);
		color: var(--text);
	}
	.step-row:disabled {
		cursor: default;
	}
	.active .step-row {
		color: var(--text);
	}
	.s-ico {
		display: inline-flex;
		flex: none;
		color: var(--accent);
	}
	.s-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.arrow {
		display: inline-flex;
		flex: none;
		transition: transform var(--dur) var(--ease);
	}
	.arrow.open {
		transform: rotate(90deg);
	}
	.mini-spin {
		width: 10px;
		height: 10px;
		border: 1.5px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	.detail {
		max-height: 180px;
		margin: 2px 0 6px 25px;
		padding: 8px 10px;
		overflow: auto;
		border-left: 2px solid var(--border);
		background: color-mix(in srgb, var(--hover) 60%, transparent);
		border-radius: 0 var(--radius) var(--radius) 0;
		color: var(--muted);
		font: 11.5px/1.5 var(--font-ui);
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.thinking {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 4px 6px;
		font-size: 12.5px;
		color: var(--muted);
	}
	.thinking :global(svg) {
		color: var(--accent);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.reply {
		font-size: 13.5px;
		line-height: 1.6;
		color: var(--text);
		word-wrap: break-word;
	}
	.reply :global(p) {
		margin: 0 0 8px;
	}
	.reply :global(p:last-child) {
		margin-bottom: 0;
	}
	.reply :global(ul),
	.reply :global(ol) {
		margin: 4px 0 8px;
		padding-left: 20px;
	}
	.reply :global(li) {
		margin: 2px 0;
	}
	.reply :global(h3),
	.reply :global(h4) {
		margin: 10px 0 4px;
		font-size: 13.5px;
		color: var(--heading);
	}
	.reply :global(code) {
		padding: 1px 5px;
		border-radius: 4px;
		background: var(--hover);
		font: 0.9em var(--font-code);
		color: var(--code);
	}
	.reply :global(pre) {
		padding: 10px;
		overflow-x: auto;
		border-radius: var(--radius);
		background: var(--hover);
	}
	.reply :global(pre code) {
		padding: 0;
		background: none;
	}
	.reply :global(.link) {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.reply.streaming :global(> :last-child)::after {
		content: "";
		display: inline-block;
		width: 7px;
		height: 1em;
		margin-left: 2px;
		vertical-align: -2px;
		border-radius: 2px;
		background: var(--accent);
		animation: pulse 0.9s ease-in-out infinite;
	}
	.composer {
		padding: 10px 12px 8px;
	}
	.box {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		padding: 6px 6px 6px 12px;
		border: 1px solid var(--border);
		border-radius: 18px;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
	}
	.box:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	textarea {
		flex: 1;
		resize: none;
		max-height: 160px;
		padding: 6px 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13.5px;
		line-height: 1.45;
	}
	.send {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 50%;
		background: var(--accent);
		color: var(--on-accent);
		cursor: pointer;
		transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease);
	}
	.send:hover:not(:disabled) {
		transform: scale(1.07);
	}
	.send:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.send.stop {
		background: var(--text);
		color: var(--bg);
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		margin: 6px 0 0;
		font-size: 10.5px;
		color: var(--muted);
	}
	.memory textarea {
		width: 100%;
		min-height: 320px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		font: 12.5px/1.55 var(--font-editor);
	}
	.memory textarea:focus {
		border-color: var(--accent);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
</style>
