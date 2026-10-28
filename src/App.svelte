<script lang="ts">
	import { flip } from "svelte/animate";
	import { fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { SvelteMap } from "svelte/reactivity";
	import Editor from "./lib/editor/Editor.svelte";
	import FileTree from "./lib/ui/FileTree.svelte";
	import Settings from "./lib/ui/Settings.svelte";
	import { ICONS } from "./lib/ui/icons";
	import { theme, trackTheme } from "./lib/theme/store.svelte";
	import { motionMs } from "./lib/theme/theme";
	import { inDesktopApp, noteTitle, openStartingVault, pickVault, type Vault, type VaultEntry } from "./lib/vault";

	trackTheme();
	const ms = $derived(motionMs(theme));

	let vault: Vault | null = $state(openStartingVault());
	let tree: VaultEntry[] = $state([]);
	let openFolders = $state(new Set<string>());
	let tabs: string[] = $state([]);
	let active: string | null = $state(null);
	let texts = new SvelteMap<string, string>();
	let sidebarOpen = $state(true);
	let settingsOpen = $state(false);
	let filter = $state("");
	let saving = $state(false);
	let editorHost: HTMLElement | undefined = $state();
	const timers = new Map<string, number>();

	const allNotes = $derived.by(() => {
		const out: string[] = [];
		const walk = (list: VaultEntry[]) => list.forEach((e) => (e.kind === "file" ? out.push(e.path) : walk(e.children ?? [])));
		walk(tree);
		return out;
	});
	const filtered = $derived(filter.trim() ? allNotes.filter((p) => p.toLowerCase().includes(filter.trim().toLowerCase())) : null);
	const words = $derived(active ? (texts.get(active) ?? "").split(/\s+/).filter(Boolean).length : 0);

	async function refresh() {
		if (!vault) return;
		tree = await vault.list();
	}

	// A new vault: load its notes and open the first one.
	$effect(() => {
		const v = vault;
		if (!v) return;
		void (async () => {
			tree = await v.list();
			openFolders = new Set(tree.filter((e) => e.kind === "folder").map((e) => e.path));
			const first = allNotes.find((p) => /welcome/i.test(p)) ?? allNotes[0];
			if (first) await openNote(first);
		})();
	});

	async function openNote(path: string) {
		if (!vault) return;
		if (!texts.has(path)) texts.set(path, await vault.read(path));
		if (!tabs.includes(path)) tabs = active ? [...tabs.slice(0, tabs.indexOf(active) + 1), path, ...tabs.slice(tabs.indexOf(active) + 1)] : [...tabs, path];
		if (active !== path) {
			active = path;
			editorHost?.animate([{ opacity: 0.35, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: ms, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
		}
	}

	function closeTab(path: string) {
		const i = tabs.indexOf(path);
		tabs = tabs.filter((p) => p !== path);
		if (active === path) active = tabs[Math.min(i, tabs.length - 1)] ?? null;
	}

	function edited(path: string, text: string) {
		texts.set(path, text);
		saving = true;
		window.clearTimeout(timers.get(path));
		timers.set(path, window.setTimeout(async () => {
			await vault?.write(path, text);
			timers.delete(path);
			saving = timers.size > 0;
		}, 400));
	}

	/** Follows a [[link]]: finds the note by name, or makes it. */
	async function followLink(target: string) {
		if (!vault) return;
		const want = target.toLowerCase().replace(/\.md$/, "");
		const found = allNotes.find((p) => p.toLowerCase().replace(/\.md$/, "") === want) ?? allNotes.find((p) => noteTitle(p).toLowerCase() === want.split("/").pop());
		if (found) return openNote(found);
		const cut = target.lastIndexOf("/");
		const path = await vault.create(cut > 0 ? target.slice(0, cut) : "", target.slice(cut + 1), `# ${target.slice(cut + 1)}\n\n`);
		await refresh();
		await openNote(path);
	}

	async function newNote() {
		if (!vault) return;
		const path = await vault.create("", "Untitled", "# Untitled\n\n");
		await refresh();
		await openNote(path);
	}

	async function chooseVault() {
		const v = await pickVault();
		if (!v) return;
		tabs = [];
		active = null;
		texts.clear();
		vault = v;
	}

	function toggleFolder(path: string) {
		const next = new Set(openFolders);
		if (next.has(path)) next.delete(path);
		else next.add(path);
		openFolders = next;
	}

	function onkeydown(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey;
		if (e.key === "Escape" && settingsOpen) settingsOpen = false;
		else if (mod && e.key === ",") settingsOpen = !settingsOpen;
		else if (mod && e.key.toLowerCase() === "n") void newNote();
		else if (mod && e.key === "\\") sidebarOpen = !sidebarOpen;
		else if (mod && e.key.toLowerCase() === "w" && active) closeTab(active);
		else if (mod && e.key === "Tab" && tabs.length > 1 && active) {
			const i = tabs.indexOf(active);
			void openNote(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]);
		} else return;
		e.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

<div class="app" class:sidebar-closed={!sidebarOpen}>
	<aside class="sidebar">
		<div class="sidebar-inner">
			<header class="vault-head">
				<button class="vault-name" onclick={chooseVault} title={inDesktopApp ? "Open another folder" : "Sample notes"}>
					<span class="vault-icon">{@html ICONS.vault}</span>
					<span>{vault?.name ?? "No folder"}</span>
				</button>
				<button class="icon" onclick={newNote} title="New note (Ctrl+N)">{@html ICONS.plus}</button>
			</header>
			<label class="filter">
				<span>{@html ICONS.search}</span>
				<input placeholder="Find a note" bind:value={filter} />
			</label>
			<nav class="files">
				{#if filtered}
					{#each filtered as path (path)}
						<button class="found" class:is-active={active === path} onclick={() => openNote(path)}>
							<span>{noteTitle(path)}</span>
							<small>{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}</small>
						</button>
					{:else}
						<p class="empty">No notes match.</p>
					{/each}
				{:else}
					<FileTree entries={tree} {active} open={openFolders} {ms} onpick={openNote} ontoggle={toggleFolder} />
				{/if}
			</nav>
			<footer class="sidebar-foot">
				<button class="icon" onclick={() => (settingsOpen = true)} title="Appearance (Ctrl+,)">{@html ICONS.settings}</button>
			</footer>
		</div>
	</aside>

	<main class="main">
		<div class="tabbar">
			<button class="icon" onclick={() => (sidebarOpen = !sidebarOpen)} title="Show or hide the sidebar (Ctrl+\)">{@html ICONS.sidebar}</button>
			<div class="tabs" role="tablist">
				{#each tabs as path (path)}
					<div class="tab" class:is-active={active === path} animate:flip={{ duration: ms }} in:fly={{ y: 8, duration: ms, easing: cubicOut }} role="tab" aria-selected={active === path}>
						<button class="tab-label" onclick={() => openNote(path)} onauxclick={(e) => e.button === 1 && closeTab(path)}>{noteTitle(path)}</button>
						<button class="tab-close" onclick={() => closeTab(path)} title="Close (Ctrl+W)">{@html ICONS.x}</button>
					</div>
				{/each}
			</div>
		</div>

		<div class="editor-area" bind:this={editorHost}>
			{#if !vault}
				<div class="start">
					<h1>Basalt</h1>
					<p>Your notes, as plain Markdown files in a folder you choose.</p>
					<button class="primary" onclick={chooseVault}>Choose a notes folder</button>
				</div>
			{:else if active}
				<Editor path={active} text={texts.get(active) ?? ""} onchange={edited} onopenlink={followLink} />
			{:else}
				<div class="start">
					<p>No note open.</p>
					<button class="primary" onclick={newNote}>New note</button>
				</div>
			{/if}
		</div>

		<footer class="status">
			<span>{words} {words === 1 ? "word" : "words"}</span>
			<span class="saved" class:is-saving={saving}>{saving ? "Saving…" : "Saved"}</span>
		</footer>
	</main>
</div>

{#if settingsOpen}
	<Settings {ms} onclose={() => (settingsOpen = false)} />
{/if}

<style>
	.app {
		display: grid;
		grid-template-columns: var(--sidebar-width) 1fr;
		grid-template-rows: minmax(0, 1fr);
		height: 100vh;
		transition: grid-template-columns var(--dur) var(--ease);
	}
	.app.sidebar-closed {
		grid-template-columns: 0px 1fr;
	}
	.sidebar {
		min-height: 0;
		overflow: hidden;
		background: var(--panel);
		border-right: 1px solid var(--border);
	}
	.sidebar-closed .sidebar {
		border-right-color: transparent;
	}
	.sidebar-inner {
		display: flex;
		flex-direction: column;
		width: var(--sidebar-width);
		height: 100%;
		transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
	}
	.sidebar-closed .sidebar-inner {
		opacity: 0;
		transform: translateX(-16px);
	}
	.vault-head {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: calc(12px * var(--density)) 10px 6px 12px;
	}
	.vault-name {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 8px;
		min-width: 0;
		padding: 6px 8px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--heading);
		font: inherit;
		font-weight: 650;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--dur) var(--ease);
	}
	.vault-name:hover {
		background: var(--hover);
	}
	.vault-icon {
		display: inline-flex;
		color: var(--accent);
	}
	.filter {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 4px 12px 8px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--muted);
		transition: border-color var(--dur) var(--ease);
	}
	.filter:focus-within {
		border-color: var(--accent);
	}
	.filter span {
		display: inline-flex;
	}
	.filter input {
		flex: 1;
		min-width: 0;
		border: 0;
		outline: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
	}
	.files {
		flex: 1;
		overflow-y: auto;
		padding: 2px 8px 12px;
	}
	.found {
		display: flex;
		flex-direction: column;
		width: 100%;
		padding: 6px 10px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.found:hover,
	.found.is-active {
		background: var(--hover);
	}
	.found small {
		color: var(--muted);
		font-size: 12px;
	}
	.empty {
		padding: 8px 12px;
		color: var(--muted);
	}
	.sidebar-foot {
		display: flex;
		padding: 8px 10px 10px;
		border-top: 1px solid var(--border);
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--bg);
	}
	.tabbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px 0;
		border-bottom: 1px solid var(--border);
	}
	.tabs {
		display: flex;
		gap: 2px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tab {
		display: flex;
		align-items: center;
		max-width: 220px;
		border-radius: var(--radius) var(--radius) 0 0;
		color: var(--muted);
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.tab:hover {
		color: var(--text);
		background: var(--hover);
	}
	.tab.is-active {
		color: var(--heading);
		background: var(--raised);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.tab-label {
		overflow: hidden;
		padding: calc(8px * var(--density)) 4px calc(8px * var(--density)) 14px;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 13.5px;
		white-space: nowrap;
		text-overflow: ellipsis;
		cursor: pointer;
	}
	.tab-close {
		display: inline-flex;
		margin-right: 6px;
		padding: 3px;
		border: 0;
		border-radius: calc(var(--radius) * 0.5);
		background: transparent;
		color: inherit;
		opacity: 0;
		cursor: pointer;
		transition: opacity var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.tab:hover .tab-close,
	.tab.is-active .tab-close {
		opacity: 0.7;
	}
	.tab-close:hover {
		opacity: 1;
		background: var(--hover);
	}
	.editor-area {
		flex: 1;
		min-height: 0;
	}
	.status {
		display: flex;
		justify-content: flex-end;
		gap: 16px;
		padding: 5px 14px;
		color: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.saved {
		transition: color var(--dur) var(--ease);
	}
	.saved.is-saving {
		color: var(--accent);
	}
	.start {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 100%;
		color: var(--muted);
		text-align: center;
	}
	.start h1 {
		margin: 0;
		color: var(--heading);
		font-size: 42px;
		letter-spacing: -0.02em;
	}
	.primary {
		margin-top: 8px;
		padding: 10px 18px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		transition: transform var(--dur) var(--ease), filter var(--dur) var(--ease);
	}
	.primary:hover {
		transform: translateY(-1px);
		filter: brightness(1.08);
	}
	.icon {
		display: inline-flex;
		padding: 6px;
		border: 0;
		border-radius: calc(var(--radius) * 0.75);
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.icon:hover {
		background: var(--hover);
		color: var(--text);
	}
</style>
