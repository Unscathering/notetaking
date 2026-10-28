<script lang="ts">
	// What Basalt's AI does and doesn't do with your notes, in plain words.
	import { icon } from "../icons";
	let { compact = false }: { compact?: boolean } = $props();
	const POINTS = [
		["Runs only on this computer", "Your notes, chats and memory never leave it. Nothing is uploaded, ever."],
		["No account, no tracking", "Basalt doesn't collect anything about you or how you use the AI."],
		["Works offline", "After the one-time download it doesn't need the internet at all."],
		["Changes only with your yes", "It shows you a plan first. You can untick anything, and undo it all after."],
	];
</script>

<div class="privacy" class:compact>
	{#each POINTS as [title, about] (title)}
		<div class="point">
			<span class="tick">{@html icon(title.startsWith("Runs") ? "lock" : "check", 13)}</span>
			<span><b>{title}</b>{#if !compact}<small>{about}</small>{/if}</span>
		</div>
	{/each}
</div>

<style>
	.privacy {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background: color-mix(in srgb, var(--accent) 6%, transparent);
	}
	.compact {
		gap: 6px;
		padding: 10px 12px;
	}
	.point {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-size: 12.5px;
		line-height: 1.45;
	}
	.tick {
		display: grid;
		place-items: center;
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
	}
	b {
		display: block;
		color: var(--text);
		font-weight: 600;
	}
	small {
		display: block;
		color: var(--muted);
		font-size: 12px;
	}
</style>
