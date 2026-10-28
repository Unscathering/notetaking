<script lang="ts">
	import type { Theme } from "../../theme/theme";
	import { theme } from "../../theme/store.svelte";
	import MiniApp from "./MiniApp.svelte";

	const ACCENTS = ["#e8794a", "#ff5c5c", "#ff6fb5", "#c792ea", "#7a5cf0", "#7c8cff", "#2f7de1", "#34c6e0", "#3fc1a5", "#7fc48b", "#b9d665", "#e5b84b", "#c9b59a", "#f2f2f2"];

	type Key = keyof Theme["colors"];
	const GROUPS: Array<{ title: string; about: string; roles: Array<[Key, string, string]> }> = [
		{
			title: "Surfaces",
			about: "The layers everything sits on, from back to front.",
			roles: [
				["bg", "Background", "Behind everything, and the note page"],
				["panel", "Sidebar", "The sidebar, command bar and board lists"],
				["raised", "Raised", "Menus, cards and the open tab"],
				["border", "Lines", "Edges and dividers"],
			],
		},
		{
			title: "Text",
			about: "How words look on those surfaces.",
			roles: [
				["text", "Text", "What you write"],
				["heading", "Headings", "Titles in your notes"],
				["muted", "Quiet text", "Hints, dates and labels"],
			],
		},
		{
			title: "Details",
			about: "Small touches of color in your notes.",
			roles: [
				["link", "Links", "Links between notes"],
				["code", "Code", "Code and numbers"],
				["onAccent", "On accent", "Text on accent-colored buttons"],
			],
		},
	];

	const light = (hex: string) => {
		const n = parseInt(hex.slice(1, 7), 16);
		return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255 > 0.6;
	};

	/** Picks the accent and the colors that go with it. */
	function setAccent(hex: string) {
		theme.colors.accent = hex;
		theme.colors.link = hex;
		theme.colors.onAccent = light(hex) ? "#141414" : "#ffffff";
	}
</script>

<section class="st-section st-top">
	<div class="st-preview"><MiniApp t={theme} /><span>Live preview</span></div>
	<div>
	<h3 class="st-h">Accent</h3>
	<p class="st-sub">The color that marks what's selected, buttons and highlights. Links follow it.</p>
	<div class="accents">
		{#each ACCENTS as a (a)}
			<button class="dot" class:is-on={theme.colors.accent.toLowerCase() === a} style:--c={a} onclick={() => setAccent(a)} title={a} aria-label="Accent {a}"></button>
		{/each}
		<label class="dot custom" title="Any color">
			<input type="color" value={theme.colors.accent} oninput={(e) => setAccent(e.currentTarget.value)} />
		</label>
	</div>
	</div>
</section>

{#each GROUPS as g (g.title)}
	<section class="st-section">
		<h3 class="st-h">{g.title}</h3>
		<p class="st-sub">{g.about}</p>
		<div class="st-grid" style:--min="190px">
			{#each g.roles as [key, name, about] (key)}
				<label class="role">
					<span class="swatch" style:background={theme.colors[key]}><input type="color" bind:value={theme.colors[key]} /></span>
					<span class="words"><b>{name}</b><span>{about}</span><code>{theme.colors[key]}</code></span>
				</label>
			{/each}
		</div>
	</section>
{/each}

<style>
	.accents {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.dot {
		position: relative;
		width: 34px;
		height: 34px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--c);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
		cursor: pointer;
		transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
	}
	.dot:hover {
		transform: scale(1.12);
	}
	.dot.is-on {
		box-shadow: 0 0 0 3px var(--panel), 0 0 0 5px var(--c);
	}
	.custom {
		background: conic-gradient(#ff5c5c, #e5b84b, #7fc48b, #34c6e0, #7c8cff, #c792ea, #ff5c5c);
	}
	.custom input,
	.swatch input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}
	.role {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background: color-mix(in srgb, var(--raised) 55%, transparent);
		cursor: pointer;
		transition: border-color var(--dur) var(--ease);
	}
	.role:hover {
		border-color: var(--accent);
	}
	.swatch {
		position: relative;
		flex: none;
		width: 44px;
		height: 44px;
		border-radius: calc(var(--radius) * 1.1);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 18%, transparent);
	}
	.words {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--muted);
	}
	.words b {
		font-size: 13px;
		font-weight: 600;
		color: var(--text);
	}
	code {
		font: 10.5px var(--font-code);
		opacity: 0.8;
	}
</style>
