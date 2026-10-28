<script lang="ts">
	// The calendar: a month at a glance. Each day shows its daily note, board
	// cards due and dated tasks. Click a day for its details and to open its
	// note; the ✨ beside a week writes that week's recap with the AI.
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { agenda, type Dated } from "../agenda";
	import { dateName, openDay } from "../templates";
	import { recap, recapPath, recapping } from "../recap.svelte";
	import { ws } from "../workspace.svelte";
	import { icon } from "./icons";

	let { ms }: { ms: number } = $props();

	const today = dateName(new Date());
	let month = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
	let picked = $state<string>(today);
	let dir = $state(1);

	const items = $derived(agenda(ws.texts));
	const byDay = $derived.by(() => {
		const m = new Map<string, Dated[]>();
		for (const it of items) m.set(it.date, [...(m.get(it.date) ?? []), it]);
		return m;
	});

	/** The weeks shown: Monday to Sunday, covering the whole month. */
	const weeks = $derived.by(() => {
		const first = new Date(month);
		const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7));
		const out: Date[][] = [];
		for (let w = 0; w < 6; w++) {
			const week = Array.from({ length: 7 }, (_, d) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
			if (w > 3 && week[0].getMonth() !== month.getMonth()) break;
			out.push(week);
		}
		return out;
	});

	const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const title = $derived(month.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
	const go = (step: number) => {
		dir = step;
		month = new Date(month.getFullYear(), month.getMonth() + step, 1);
	};
	const goToday = () => {
		dir = 0;
		month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
		picked = today;
	};

	const pickedDate = $derived(new Date(`${picked}T12:00:00`));
	const pickedItems = $derived(byDay.get(picked) ?? []);
	const daily = $derived(pickedItems.find((i) => i.kind === "daily"));
	const weekNumber = (d: Date) => {
		const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)));
		const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
		return 1 + Math.round(((t.getTime() - y.getTime()) / 86_400_000 - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
	};

	function keys(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest("input,textarea")) return;
		if (e.key === "ArrowLeft") go(-1);
		else if (e.key === "ArrowRight") go(1);
	}
</script>

<svelte:window onkeydown={keys} />

<div class="calendar">
	<div class="main">
		<header>
			<h1>{title}</h1>
			<div class="nav">
				<button onclick={() => go(-1)} title="Last month (←)">{@html icon("back", 16)}</button>
				<button class="today" onclick={goToday}>Today</button>
				<button class="flip" onclick={() => go(1)} title="Next month (→)">{@html icon("back", 16)}</button>
			</div>
		</header>
		<div class="head-row"><span></span>{#each DAYS as d (d)}<span>{d}</span>{/each}</div>
		{#key month.getTime()}
			<div class="grid" in:fly={{ x: 24 * dir, duration: ms, easing: cubicOut, opacity: 0 }}>
				{#each weeks as week (week[0].getTime())}
					{@const start = dateName(week[0])}
					<div class="week">
						<div class="wk">
							<span>W{weekNumber(week[0])}</span>
							<button class="spark" class:has={!!ws.resolve(recapPath(week[0]).replace(/\.md$/, ""))} disabled={recapping.week === start} onclick={() => recap(week[0])} title={ws.resolve(recapPath(week[0]).replace(/\.md$/, "")) ? "Open this week's recap" : "Write this week's recap with the AI"}>
								{#if recapping.week === start}<span class="mini-spin"></span>{:else}{@html icon("sparkles", 13)}{/if}
							</button>
						</div>
						{#each week as day (day.getTime())}
							{@const key = dateName(day)}
							{@const list = byDay.get(key) ?? []}
							{@const things = list.filter((i) => i.kind !== "daily")}
							<button class="day" class:out={day.getMonth() !== month.getMonth()} class:is-today={key === today} class:is-picked={key === picked} onclick={() => (picked = key)} ondblclick={() => openDay(day)}>
								<span class="num">{day.getDate()}{#if list.some((i) => i.kind === "daily")}<i class="dot" title="Has a daily note"></i>{/if}</span>
								{#each things.slice(0, 3) as it, i (i)}
									<span class="chip {it.kind}" class:done={it.done}>{it.title}</span>
								{/each}
								{#if things.length > 3}<span class="more">+{things.length - 3} more</span>{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		{/key}
	</div>

	<aside class="side">
		{#key picked}
			<div in:fade={{ duration: ms }}>
				<h2>{pickedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
				<button class="primary" onclick={() => openDay(pickedDate)}>{@html icon(daily ? "file" : "plus", 14)} {daily ? "Open the daily note" : "Start this day's note"}</button>
				{#if pickedItems.filter((i) => i.kind !== "daily").length}
					<h3>Due</h3>
					<ul>
						{#each pickedItems.filter((i) => i.kind !== "daily") as it, i (i)}
							<li><button class:done={it.done} onclick={() => ws.open(it.path)}><span class="k {it.kind}">{@html icon(it.kind === "card" ? "board" : "check", 12)}</span><span class="t">{it.title}<small>{it.path.replace(/\.md$/, "")}</small></span></button></li>
						{/each}
					</ul>
				{:else}
					<p class="muted">Nothing due. Add a date to a board card, or write <code>due:{picked}</code> on a checklist item.</p>
				{/if}
			</div>
		{/key}
		{#if recapping.error}<p class="problem">{recapping.error}</p>{/if}
		<p class="hint">Double-click a day to open its note. The ✨ beside a week writes a recap of it from that week's daily notes.</p>
	</aside>
</div>

<style>
	.calendar {
		display: grid;
		grid-template-columns: 1fr 280px;
		height: 100%;
		min-height: 0;
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		padding: 22px 24px;
		overflow: hidden;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
	}
	h1 {
		margin: 0;
		color: var(--heading);
		font-family: var(--font-heading);
		font-size: 24px;
		letter-spacing: -0.01em;
	}
	.nav {
		display: flex;
		gap: 4px;
	}
	.nav button {
		display: inline-flex;
		align-items: center;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
		transition: border-color var(--dur) var(--ease);
	}
	.nav button:hover {
		border-color: var(--accent);
	}
	.flip :global(svg) {
		transform: scaleX(-1);
	}
	.head-row,
	.week {
		display: grid;
		grid-template-columns: 34px repeat(7, 1fr);
		gap: 4px;
	}
	.head-row span {
		padding: 0 8px 6px;
		color: var(--muted);
		font-size: 11.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.grid {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 0;
	}
	.week {
		flex: 1;
		min-height: 0;
	}
	.wk {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding-top: 8px;
		color: var(--muted);
		font-size: 10.5px;
	}
	.spark {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--muted);
		cursor: pointer;
		opacity: 0.5;
		transition: opacity var(--dur) var(--ease), color var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.week:hover .spark,
	.spark.has {
		opacity: 1;
	}
	.spark.has {
		color: var(--accent);
	}
	.spark:hover {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 3px;
		min-width: 0;
		min-height: 0;
		padding: 6px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--raised) 40%, transparent);
		color: var(--text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.day:hover {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
	}
	.day.out {
		opacity: 0.4;
	}
	.day.is-picked {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.num {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12.5px;
		font-weight: 600;
	}
	.is-today .num {
		color: var(--accent);
	}
	.is-today .num::before {
		content: "";
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--muted);
	}
	.chip {
		overflow: hidden;
		padding: 1px 6px;
		border-left: 2px solid var(--accent);
		border-radius: 3px;
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		font-size: 11px;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.chip.task {
		border-left-color: var(--link);
		background: color-mix(in srgb, var(--link) 12%, transparent);
	}
	.chip.done {
		opacity: 0.5;
		text-decoration: line-through;
	}
	.more {
		color: var(--muted);
		font-size: 10.5px;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 22px 18px;
		overflow-y: auto;
		border-left: 1px solid var(--chrome-line);
	}
	h2 {
		margin: 0 0 12px;
		color: var(--heading);
		font-size: 16px;
	}
	h3 {
		margin: 18px 0 6px;
		color: var(--muted);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li button {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		width: 100%;
		padding: 6px;
		border: 0;
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}
	li button:hover {
		background: var(--hover);
	}
	li button.done .t {
		opacity: 0.55;
		text-decoration: line-through;
	}
	.k {
		display: inline-flex;
		margin-top: 2px;
		color: var(--accent);
	}
	.k.task {
		color: var(--link);
	}
	.t small {
		display: block;
		color: var(--muted);
		font-size: 11px;
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 8px 12px;
		border: 0;
		border-radius: var(--radius);
		background: var(--accent);
		color: var(--on-accent);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.muted,
	.hint {
		color: var(--muted);
		font-size: 12px;
		line-height: 1.5;
	}
	.hint {
		margin-top: auto;
	}
	code {
		font: 11.5px var(--font-code);
	}
	.problem {
		padding: 8px 10px;
		border-radius: var(--radius);
		background: color-mix(in srgb, #e05d5d 15%, transparent);
		font-size: 12px;
	}
	.mini-spin {
		width: 11px;
		height: 11px;
		border: 1.5px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
