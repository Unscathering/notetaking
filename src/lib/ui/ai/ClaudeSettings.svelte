<script lang="ts">
	// Using Claude (online, with your own API key) instead of the AI on this PC.
	import { CLAUDE_MODELS, cloud, saveCloud, testClaude } from "../../ai/claude.svelte";
	import { icon } from "../icons";

	let testing = $state(false);
	let result = $state<{ ok: boolean; text: string } | null>(null);
	let show = $state(false);

	function change() {
		saveCloud();
		result = null;
	}

	async function test() {
		testing = true;
		result = null;
		try {
			const said = await testClaude();
			result = { ok: true, text: `Connected. Claude says “${said}”.` };
		} catch (e) {
			result = { ok: false, text: e instanceof Error ? e.message : String(e) };
		} finally {
			testing = false;
		}
	}

	const open = (url: string) => void import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank"));
</script>

<section class="claude" class:is-on={cloud.on}>
	<label class="switch-row">
		<span>
			<b>Use Claude instead</b>
			<small>Anthropic's AI, online. Far smarter than any AI that fits on a PC, for big plans and hard questions.</small>
		</span>
		<input type="checkbox" bind:checked={cloud.on} onchange={change} />
	</label>
	{#if cloud.on}
		<div class="warn">{@html icon("globe", 13)}<span><b>Not private like the AI on your PC.</b> While this is on, your messages and the notes the AI reads are sent to Anthropic. Writing help sends the text you check. Turn this off to go back to the AI on your PC.</span></div>
		<label class="field">
			<span>Your API key</span>
			<div class="key">
				{#if show}<input type="text" bind:value={cloud.key} oninput={change} onkeydown={(e) => e.stopPropagation()} placeholder="sk-ant-…" spellcheck="false" />{:else}<input type="password" bind:value={cloud.key} oninput={change} onkeydown={(e) => e.stopPropagation()} placeholder="sk-ant-…" />{/if}
				<button class="mini" onclick={() => (show = !show)} title={show ? "Hide" : "Show"}>{@html icon("eye", 13)}</button>
			</div>
			<small>Kept on this PC only, never in your notes. Get one at <a href="https://console.anthropic.com/settings/keys" onclick={(e) => { e.preventDefault(); open("https://console.anthropic.com/settings/keys"); }}>console.anthropic.com</a>; you pay Anthropic for what you use.</small>
		</label>
		<div class="models">
			{#each CLAUDE_MODELS as m (m.id)}
				<label class="model" class:is-on={cloud.model === m.id}>
					<input type="radio" name="claude-model" value={m.id} bind:group={cloud.model} onchange={change} />
					<span><b>{m.name}</b><small>{m.about}</small></span>
				</label>
			{/each}
		</div>
		<button class="ghost" disabled={testing || !cloud.key.trim()} onclick={test}>{@html icon("zap", 13)} {testing ? "Checking…" : "Check the key"}</button>
		{#if result}<p class:ok={result.ok} class:bad={!result.ok}>{result.text}</p>{/if}
	{/if}
</section>

<style>
	.claude {
		margin-top: 20px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		transition: border-color var(--dur) var(--ease);
	}
	.claude.is-on {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
	}
	.switch-row {
		display: flex;
		align-items: center;
		gap: 12px;
		cursor: pointer;
	}
	.switch-row span {
		flex: 1;
	}
	b {
		display: block;
		font-size: 13px;
		color: var(--heading);
	}
	small {
		display: block;
		margin-top: 2px;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--muted);
	}
	input[type="checkbox"],
	input[type="radio"] {
		flex: none;
		accent-color: var(--accent);
	}
	input[type="checkbox"] {
		width: 16px;
		height: 16px;
	}
	.warn {
		display: flex;
		gap: 8px;
		margin: 12px 0;
		padding: 9px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e5a84b 14%, transparent);
		font-size: 12px;
		line-height: 1.5;
		color: var(--text);
	}
	.warn :global(svg) {
		flex: none;
		margin-top: 2px;
		color: #e5a84b;
	}
	.warn b {
		display: inline;
		font-size: inherit;
		color: inherit;
	}
	.field > span {
		display: block;
		margin-bottom: 4px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text);
	}
	.key {
		display: flex;
		gap: 4px;
	}
	.key input {
		flex: 1;
		min-width: 0;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		outline: 0;
		background: color-mix(in srgb, var(--bg) 70%, transparent);
		color: var(--text);
		font: 12.5px var(--font-code);
	}
	.key input:focus {
		border-color: var(--accent);
	}
	.mini {
		display: inline-flex;
		align-items: center;
		padding: 0 9px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	a {
		color: var(--link);
	}
	.models {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 12px 0;
	}
	.model {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.model.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.model input {
		margin-top: 3px;
	}
	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.ghost:disabled {
		opacity: 0.45;
		cursor: default;
	}
	p {
		margin: 8px 0 0;
		font-size: 12px;
	}
	.ok {
		color: #5fb878;
	}
	.bad {
		color: #e05d5d;
	}
</style>
