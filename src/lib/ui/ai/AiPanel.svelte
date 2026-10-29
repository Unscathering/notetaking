<script lang="ts">
	// The AI panel on the right: setup the first time, then the chat, the
	// memory note and the model settings.
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { addModelFile, ai, installEngine, refresh, stopAnswer } from "../../ai/engine.svelte";
	import { SvelteSet } from "svelte/reactivity";
	import { THINKING, chat, deleteChat, loadChats, loadMemory, newChat, openChat, renameChat, saveMemory, send, setAccess, setProject, updateMemory, type ChatInfo } from "../../ai/agent.svelte";
	import { aiPanel } from "../../ai/panel.svelte";
	import { speedTest, warmUp, type SpeedResult } from "../../ai/writer";
	import { markdown } from "../../ai/markdown";
	import { MODELS } from "../../ai/models";
	import ModelTest from "./ModelTest.svelte";
	import { ws } from "../../workspace.svelte";
	import { icon } from "../icons";
	import ModelPicker from "./ModelPicker.svelte";
	import ClaudeSettings from "./ClaudeSettings.svelte";
	import MicButton from "../MicButton.svelte";
	import { claudeName, usingClaude } from "../../ai/claude.svelte";
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
	let speed = $state<SpeedResult | null>(null);
	let timing = $state(false);
	let speedError = $state("");

	/** Which model the last speed test timed. */
	let tested = $state<"writer" | "main">("writer");
	async function runSpeedTest(slot: "writer" | "main" = "writer") {
		timing = true;
		speed = null;
		speedError = "";
		tested = slot;
		try {
			speed = await speedTest(slot);
		} catch (e) {
			speedError = e instanceof Error ? e.message : String(e);
		} finally {
			timing = false;
		}
	}
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

	// The saved chats of this cave.
	$effect(() => {
		void ws.cave?.id;
		if (aiPanel.open) void loadChats();
	});

	let renaming = $state("");
	let renameText = $state("");
	/** Saved chats by project, projects first. */
	const groups = $derived.by(() => {
		const by = new Map<string, ChatInfo[]>();
		for (const c of chat.list) by.set(c.project, [...(by.get(c.project) ?? []), c]);
		return [...by].sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
	});
	const when = (t: number) => {
		const days = Math.floor((Date.now() - t) / 86_400_000);
		return days < 1 ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : days < 7 ? new Date(t).toLocaleDateString([], { weekday: "short" }) : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
	};

	// Start waking the AI as soon as the panel opens, so the first answer comes sooner.
	$effect(() => {
		if (aiPanel.open && ai.phase === "ready") warmUp();
	});

	// Keep the newest message in view while it streams in.
	$effect(() => {
		void chat.messages.length;
		void chat.messages.at(-1)?.text;
		void chat.messages.at(-1)?.steps.length;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	});

	/** Claude is in use instead of the AI on this PC. */
	const online = $derived(usingClaude());
	/** The chat can be used: a model on this PC, or Claude. */
	const ready = $derived(ai.phase === "ready" || online);
	const separateWriter = $derived(!online && !!ai.writerModel && ai.writerModel !== ai.model);
	const modelName = $derived(online ? claudeName() : (MODELS.find((m) => m.file === ai.model)?.name ?? (ai.model ? ai.model.replace(/\.gguf$/, "") : "No model")));
	const status = $derived(chat.busy ? "Thinking…" : online ? "Online" : ai.starting ? "Waking up…" : ai.running ? "Ready" : "Sleeping");

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
			<span class="title"><b>{aiPanel.view === "memory" ? "Memory" : aiPanel.view === "chats" ? "Chats" : "AI models"}</b></span>
		{:else}
			<span class="orb">{@html icon("sparkles", 15)}</span>
			<span class="title">
				<b>Basalt AI</b>
				{#if ready}<small><i class="dot" class:on={ai.running || online} class:busy={ai.starting || chat.busy}></i>{modelName} · {status}</small>{:else}<small>Private, on your PC</small>{/if}
			</span>
			{#if ready}
				<button class="icon" onclick={() => (aiPanel.view = "chats")} title="Your chats and projects">{@html icon("clock", 16)}</button>
				<button class="icon" onclick={openMemory} title="Memory: what your AI remembers about you">{@html icon("brain", 16)}</button>
				<button class="icon" onclick={() => newChat()} title="New chat" disabled={chat.busy || !chat.messages.length}>{@html icon("plus", 16)}</button>
				<button class="icon" onclick={() => (aiPanel.view = "models")} title="AI models">{@html icon("settings", 16)}</button>
			{/if}
		{/if}
		<button class="icon" onclick={() => (aiPanel.open = false)} title="Close (Ctrl+J)">{@html icon("x", 16)}</button>
	</header>

	{#if ai.phase === "unknown" && !online}
		<div class="center"><span class="spinner"></span></div>
	{:else if ai.phase === "unavailable" && (!online || aiPanel.view === "models")}
		<div class="scroll setup">
			<div class="hero"><span class="big-orb">{@html icon("sparkles", 26)}</span><h2>Your own AI, right on your PC</h2><p>The AI runs in the Basalt desktop app for Windows.</p></div>
			<Privacy />
			<ClaudeSettings />
		</div>
	{:else if (ai.phase === "setup" && !online) || aiPanel.view === "models"}
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
			<ClaudeSettings />
			{#if aiPanel.view === "models" && ready}
				<section>
					<h3>Speed test</h3>
					{#if separateWriter}
						<p class="hint">Times a grammar check of one paragraph with each model: the writing help one, and the one for chats.</p>
						<div class="row-buttons">
							<button class="ghost" disabled={timing || chat.busy} onclick={() => runSpeedTest("writer")}>{@html icon("zap", 13)} {timing && tested === "writer" ? "Testing…" : "Test writing help"}</button>
							<button class="ghost" disabled={timing || chat.busy} onclick={() => runSpeedTest("main")}>{@html icon("zap", 13)} {timing && tested === "main" ? "Testing…" : "Test the chat model"}</button>
						</div>
					{:else}
						<p class="hint">Times a grammar check of one paragraph with {modelName}, the way writing help does it.</p>
						<button class="ghost" disabled={timing || chat.busy} onclick={() => runSpeedTest()}>{@html icon("zap", 13)} {timing ? "Testing…" : speed ? "Test again" : "Test the speed"}</button>
					{/if}
					{#if speed}
						<div class="speed">
							{#if speed.wake}<div><b>{speed.wake.toFixed(1)} s</b><span>to wake up (only the first time after a nap)</span></div>{/if}
							<div><b>{speed.paragraph.toFixed(1)} s</b><span>to check a paragraph</span></div>
							<div><b>{Math.round(speed.wordsPerSecond)}</b><span>words written per second</span></div>
							<p>{speed.verdict}</p>
						</div>
					{/if}
					{#if speedError}<p class="problem">{speedError}</p>{/if}
				</section>
			{/if}
			{#if aiPanel.view === "models" && ready}
				<section><ModelTest /></section>
			{/if}
			{#if aiPanel.view === "models" && ai.folder}<p class="folder">Stored on this PC in {ai.folder}</p>{/if}
			{#if ai.error}<p class="problem">{ai.error}</p>{/if}
		</div>
	{:else if aiPanel.view === "chats"}
		<div class="scroll chats" in:fade={{ duration: ms }}>
			<button class="primary wide" disabled={chat.busy} onclick={async () => { await newChat(""); aiPanel.view = "chat"; }}>{@html icon("plus", 14)} New chat</button>
			{#if !chat.list.length}<p class="hint center-text">Your chats will be saved here. Put a chat in a project (a folder) and its chats share what they learn about it.</p>{/if}
			{#each groups as [project, list] (project)}
				<div class="group">
					<div class="group-head">
						<span>{@html icon(project ? "folder" : "sparkles", 13)} {project || "Other chats"}</span>
						{#if project}<button class="mini" title="New chat in {project}" onclick={async () => { await newChat(project); aiPanel.view = "chat"; }}>{@html icon("plus", 13)}</button>{/if}
					</div>
					{#each list as c (c.id)}
						<div class="chat-row" class:is-on={c.id === chat.id}>
							{#if renaming === c.id}
								<input bind:value={renameText} onkeydown={(e) => { e.stopPropagation(); if (e.key === "Enter") { void renameChat(c.id, renameText); renaming = ""; } if (e.key === "Escape") renaming = ""; }} onblur={() => { void renameChat(c.id, renameText); renaming = ""; }} />
							{:else}
								<button class="open" onclick={async () => { await openChat(c.id); aiPanel.view = "chat"; }}><span class="t">{c.title}</span><small>{when(c.updated)}</small></button>
								<button class="mini" title="Rename" onclick={() => { renaming = c.id; renameText = c.title; }}>{@html icon("pencil", 12)}</button>
								<button class="mini" title="Delete" onclick={() => confirm(`Delete the chat “${c.title}”?`) && deleteChat(c.id)}>{@html icon("trash", 12)}</button>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
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
					{#if online}<div class="private">{@html icon("globe", 12)} Online: {modelName}, through Anthropic</div>{:else}<div class="private">{@html icon("lock", 12)} Private: I run only on this PC</div>{/if}
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
							<div class="reply" class:streaming={m.streaming && !m.thinking}>{@html markdown(m.text)}</div>
						{/if}
						{#if m.streaming && (m.thinking ?? !m.text.trim()) && !m.steps.some((s) => s.active)}
							<div class="thinking">{@html icon("sparkles", 13)}{#key m.stage || word}<span in:fade={{ duration: ms }}>{m.stage || THINKING[word]}…</span>{/key}</div>
						{/if}
						{#if m.sources?.length && !m.streaming}
							<div class="sources">
								<span>Sources</span>
								{#each m.sources as s (s)}<button onclick={() => ws.open(s)} title={s}>{@html icon("file", 11)}{s.split("/").pop()?.replace(/\.md$/i, "")}</button>{/each}
							</div>
						{/if}
						{#if m.unsure?.length && !m.streaming}
							<p class="unsure">{@html icon("alert", 12)} Double-check {m.unsure.join(", ")}: {m.unsure.length === 1 ? "it isn't" : "they aren't"} in the notes this answer used.</p>
						{/if}
						{#if m.plan}<PlanCard {m} />{/if}
						{#if m.error}<p class="problem">{m.error}</p>{/if}
					{/if}
				</div>
			{/each}
		</div>

		<div class="composer">
			<div class="above">
			<div class="access" role="radiogroup" aria-label="What the AI may do">
				<button role="radio" aria-checked={chat.access === "plan"} class:on={chat.access === "plan"} disabled={chat.busy} onclick={() => setAccess("plan")} title="Plan first: the AI shows its changes as a plan, and nothing happens until you press Do it">{@html icon("list", 11)} Plan first</button>
				<button role="radio" aria-checked={chat.access === "full"} class:on={chat.access === "full"} disabled={chat.busy} onclick={() => setAccess("full")} title="Full access: the AI makes its changes as soon as it's done answering (and asks when it's unsure). Everything can still be undone.">{@html icon("zap", 11)} Full access</button>
			</div>
			<label class="project" title="Put this chat in a project: a folder whose chats share what they learn">
				{@html icon("folder", 12)}
				<select value={chat.project} onchange={(e) => setProject((e.target as HTMLSelectElement).value)} disabled={chat.busy}>
					<option value="">No project</option>
					{#each ws.folders as f (f)}<option value={f}>{f}</option>{/each}
				</select>
			</label>
			</div>
			<div class="box">
				<textarea bind:this={input} bind:value={draft} rows="1" placeholder="Ask anything, or tell me what to do…" oninput={grow} onkeydown={keys}></textarea>
				<MicButton {ms} onText={(t) => { draft = draft ? `${draft.trimEnd()} ${t}` : t; requestAnimationFrame(grow); input?.focus(); }} />
				{#if chat.busy}
					<button class="send stop" onclick={stopAnswer} title="Stop">{@html icon("stop", 14)}</button>
				{:else}
					<button class="send" disabled={!draft.trim()} onclick={() => submit()} title="Send (Enter)">{@html icon("send", 16)}</button>
				{/if}
			</div>
			{#if online}<p class="foot">{@html icon("globe", 10)} Using Claude: messages and the notes it reads go to Anthropic.</p>{:else}<p class="foot">{@html icon("lock", 10)} Runs on this PC. Nothing leaves it.</p>{/if}
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
	.row-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
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
	.speed {
		display: grid;
		gap: 6px;
		margin-top: 12px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 12.5px;
		color: var(--muted);
	}
	.speed div {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.speed b {
		min-width: 52px;
		font-size: 15px;
		color: var(--heading);
	}
	.speed p {
		margin: 4px 0 0;
		color: var(--text);
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
	.sources {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
		margin-top: 8px;
		font-size: 11px;
		color: var(--muted);
	}
	.sources > span {
		margin-right: 2px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.sources button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		max-width: 180px;
		padding: 3px 9px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 11.5px;
		white-space: nowrap;
		text-overflow: ellipsis;
		cursor: pointer;
		transition: border-color var(--dur) var(--ease);
	}
	.sources button:hover {
		border-color: var(--accent);
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
	.unsure {
		display: flex;
		gap: 6px;
		margin: 6px 0 0;
		color: #e5a84b;
		font-size: 11.5px;
		line-height: 1.4;
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
	.chats .wide {
		margin-bottom: 14px;
	}
	.center-text {
		text-align: center;
	}
	.group {
		margin-bottom: 14px;
	}
	.group-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px 4px;
		font-size: 11.5px;
		font-weight: 600;
		color: var(--muted);
	}
	.group-head span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.chat-row {
		display: flex;
		align-items: center;
		gap: 2px;
		border-radius: var(--radius);
		transition: background-color var(--dur) var(--ease);
	}
	.chat-row:hover,
	.chat-row.is-on {
		background: var(--hover);
	}
	.chat-row .open {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 7px 8px;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	.chat-row .t {
		flex: 1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.chat-row small {
		flex: none;
		font-size: 11px;
		color: var(--muted);
	}
	.chat-row input {
		flex: 1;
		margin: 3px;
		padding: 5px 8px;
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
	}
	.mini {
		display: inline-flex;
		padding: 5px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		opacity: 0;
		transition: opacity var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.chat-row:hover .mini,
	.group-head .mini {
		opacity: 1;
	}
	.mini:hover {
		color: var(--text);
	}
	.above {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 10px;
		margin: 0 0 6px 4px;
	}
	.above .project {
		margin: 0;
	}
	.access {
		display: inline-flex;
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.access button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 11px;
		cursor: pointer;
		transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.access button.on {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.access button:disabled {
		cursor: default;
	}
	.project {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		max-width: 100%;
		margin: 0 0 6px 6px;
		color: var(--muted);
		font-size: 11.5px;
	}
	.project select {
		max-width: 220px;
		padding: 2px 4px;
		border: 0;
		border-radius: calc(var(--radius) * 0.6);
		outline: 0;
		background: transparent;
		color: var(--muted);
		font: inherit;
		cursor: pointer;
	}
	.project select:hover {
		background: var(--hover);
		color: var(--text);
	}
	.project select option {
		background: var(--panel);
		color: var(--text);
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
