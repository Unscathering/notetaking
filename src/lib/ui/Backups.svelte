<script lang="ts">
	// The Backups window: pick a backup on the left, see what's different since
	// then on the right, and bring back single notes or the whole cave.
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { backUp, backups, compare, listBackups, restoreAll, restoreNote, type Difference } from "../backups.svelte";
	import { inDesktopApp, noteTitle } from "../cave";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();

	let picked = $state<string | null>(null);
	let diffs = $state<Difference[] | null>(null);
	let note = $state("");
	let working = $state(false);

	$effect(() => {
		void listBackups().then((l) => (picked ??= l[0]?.id ?? null));
	});

	$effect(() => {
		const id = picked;
		diffs = null;
		if (id) void compare(id).then((d) => picked === id && (diffs = d));
	});

	const when = (t: number) => new Date(t).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
	const current = $derived(backups.list.find((b) => b.id === picked));

	async function now() {
		working = true;
		const made = await backUp("Made by hand", true);
		picked = made?.id ?? picked;
		note = "Backed up.";
		working = false;
	}

	async function bringBack(path: string) {
		if (!picked) return;
		await restoreNote(picked, path);
		note = `Brought back “${noteTitle(path)}”.`;
		diffs = await compare(picked);
	}

	async function everything() {
		if (!picked || !current) return;
		if (!confirm(`Put the whole cave back the way it was on ${when(current.when)}?\n\nNotes made since then are removed. A backup of how things are now is made first, so you can undo this.`)) return;
		working = true;
		await restoreAll(picked);
		note = "The cave is back the way it was. A backup of how it was a moment ago is at the top of the list.";
		await listBackups();
		diffs = await compare(picked);
		working = false;
	}
</script>

<div class="scrim" transition:fade={{ duration: ms }} onclick={() => (ws.modal = null)} role="presentation"></div>
<div class="box" transition:fly={{ y: 12, duration: ms, easing: cubicOut }} role="dialog" aria-label="Backups">
	<header>
		<div>
			<h2>Backups</h2>
			<p>Basalt backs up every note on its own: when you open a cave, every half hour while you work, and before the AI changes anything. {inDesktopApp ? "They're kept on this PC, outside the cave's folder." : "In the browser they're kept in this page's storage."} Pictures aren't included.</p>
		</div>
		<button class="close" onclick={() => (ws.modal = null)} title="Close (Esc)">{@html icon("x", 18)}</button>
	</header>
	<div class="cols">
		<ul class="list">
			{#each backups.list as b (b.id)}
				<li>
					<button class:is-on={b.id === picked} onclick={() => (picked = b.id)}>
						<b>{when(b.when)}</b>
						<small>{b.reason} · {b.notes} notes</small>
					</button>
				</li>
			{:else}
				<li class="empty">No backups yet.</li>
			{/each}
		</ul>
		<div class="detail">
			{#if current}
				<h3>Since {when(current.when)}</h3>
				{#if diffs === null}
					<p class="muted">Comparing…</p>
				{:else if !diffs.length}
					<p class="muted">Nothing has changed since this backup.</p>
				{:else}
					<ul class="diffs">
						{#each diffs as d (d.path)}
							<li>
								<span class="kind {d.kind}">{d.kind === "deleted" ? "Deleted" : d.kind === "changed" ? "Changed" : "New"}</span>
								<span class="path" title={d.path}>{d.path.replace(/\.md$/i, "")}</span>
								{#if d.kind !== "new"}<button class="small" onclick={() => bringBack(d.path)}>{@html icon("undo", 12)} Bring back</button>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				<button class="ghost" disabled={working || !diffs?.length} onclick={everything}>{@html icon("archive", 14)} Restore the whole cave to this backup</button>
			{/if}
			{#if note}<p class="ok">{note}</p>{/if}
		</div>
	</div>
	<footer>
		<button class="primary" disabled={working} onclick={now}>{@html icon("download", 14)} Back up now</button>
	</footer>
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
		top: 50%;
		left: 50%;
		z-index: 51;
		display: flex;
		flex-direction: column;
		width: min(820px, calc(100vw - 32px));
		height: min(600px, calc(100vh - 48px));
		translate: -50% -50%;
		padding: 22px;
		background-color: var(--surface-float);
		background-image: var(--glass-grain);
		backdrop-filter: var(--float-filter);
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.5);
		box-shadow: var(--glass-edge), 0 28px 70px rgba(0, 0, 0, 0.4);
		isolation: isolate;
	}
	header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}
	h2 {
		margin: 0;
		color: var(--heading);
		font-size: 18px;
	}
	header p {
		margin: 6px 0 14px;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.5;
	}
	.close {
		display: inline-flex;
		margin-left: auto;
		padding: 7px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
	}
	.close:hover {
		background: var(--hover);
		color: var(--text);
	}
	.cols {
		flex: 1;
		display: grid;
		grid-template-columns: 250px 1fr;
		gap: 16px;
		min-height: 0;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.list {
		overflow-y: auto;
		padding-right: 4px;
		border-right: 1px solid var(--border);
	}
	.list button {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 8px 10px;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease);
	}
	.list button:hover {
		background: var(--hover);
	}
	.list button.is-on {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.list b {
		font-size: 13px;
		font-weight: 600;
	}
	small,
	.muted,
	.empty {
		color: var(--muted);
		font-size: 12px;
	}
	.empty {
		padding: 10px;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
		overflow-y: auto;
	}
	h3 {
		margin: 0;
		color: var(--heading);
		font-size: 14px;
	}
	.diffs li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 4px;
		border-bottom: 1px solid var(--border);
		font-size: 13px;
	}
	.kind {
		flex: none;
		width: 62px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.kind.deleted {
		color: #e05d5d;
	}
	.kind.changed {
		color: #e5a84b;
	}
	.kind.new {
		color: #5fb878;
	}
	.path {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	button.small,
	button.ghost,
	button.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border-radius: var(--radius);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	button.small {
		flex: none;
		padding: 4px 9px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font-size: 12px;
	}
	button.small:hover {
		border-color: var(--accent);
	}
	button.ghost {
		align-self: flex-start;
		padding: 8px 14px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text);
		font-size: 12.5px;
	}
	button.primary {
		padding: 8px 14px;
		border: 0;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 12.5px;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.ok {
		margin: 0;
		color: #5fb878;
		font-size: 12.5px;
	}
	footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 14px;
	}
</style>
