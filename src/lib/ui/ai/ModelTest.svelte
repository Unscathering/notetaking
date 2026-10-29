<script lang="ts">
	// The model test: run Basalt's jobs on a model (or every model on this PC)
	// and compare the scores. See ai/bench.svelte.ts.
	import { AREAS, AREA_COUNT, JOB_COUNT, LONG_COUNT, bench, cancelTest, forgetRun, progress, runTest, type Area, type TestRun } from "../../ai/bench.svelte";
	import { ai } from "../../ai/engine.svelte";
	import { MODELS } from "../../ai/models";
	import { usingClaude } from "../../ai/claude.svelte";
	import { icon } from "../icons";

	const label = (file: string) => MODELS.find((m) => m.file === file)?.name ?? file.replace(/\.gguf$/i, "");
	const minutes = (n: number) => (n < 1.5 ? "about a minute" : `about ${Math.round(n)} minutes`);
	let open = $state<string | null>(null);
	/** The long run (about 150 tests a model) instead of the quick one. */
	let long = $state(false);
	/** Which models "Test the picked models" runs (all of them until you untick some). */
	let skipped = $state<string[]>([]);
	const picked = $derived(ai.models.map((m) => m.file).filter((f) => !skipped.includes(f)));
	const count = $derived(long ? LONG_COUNT : JOB_COUNT);
	const best = $derived(bench.runs[0]);
	const tone = (n: number) => (n >= 80 ? "good" : n >= 55 ? "ok" : "bad");
	const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
	const pick = (r: TestRun) => (open = open === r.model ? null : r.model);
	/** Ticks once a second while a test runs, for the clock. */
	let now = $state(Date.now());
	$effect(() => {
		if (!bench.running) return;
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	const clock = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);
</script>

<section class="test">
	<h3>How good is each model at Basalt?</h3>
	<p class="hint"><b>{JOB_COUNT} tests in {AREA_COUNT} areas</b>: organizing, dashboards, customizing, grammar fixes, answering from notes, care, and knowing its limits. Questions are picked fresh each run, some with typos. They run in a practice cave and are scored; your own notes are never touched.</p>

	{#if bench.running}
		{@const p = progress(now)}
		<div class="progress">
			<div class="line">
				<span class="spin"></span>
				<span class="what">{bench.models > 1 ? `Model ${bench.modelIndex} of ${bench.models}: ` : ""}<b>{label(bench.model)}</b></span>
				<button class="ghost" onclick={cancelTest}>Stop</button>
			</div>
			<div class="bar"><i style="width: {p.percent}%"></i></div>
			<div class="count">
				<span><b>{p.percent}%</b> · test {p.doneOverall + 1 > p.total ? p.total : p.doneOverall + 1} of {p.total}</span>
				<span>{clock(p.elapsed)} so far · {p.left ? `about ${clock(p.left)} left` : "working out how long…"}</span>
			</div>
			<p class="now">Now: {bench.current}</p>
			<div class="stats">
				<div><b class="score-{tone(p.score)}">{p.finished ? p.score : "–"}</b><span>score so far</span></div>
				<div><b class="good">{p.passed}</b><span>passed</span></div>
				<div><b class="ok">{p.partly}</b><span>partly</span></div>
				<div><b class="bad">{p.failed}</b><span>failed</span></div>
			</div>
		</div>
	{:else}
		<div class="length" role="radiogroup" aria-label="How long a test">
			<button role="radio" aria-checked={!long} class:on={!long} onclick={() => (long = false)}>Quick · {JOB_COUNT} tests</button>
			<button role="radio" aria-checked={long} class:on={long} onclick={() => (long = true)}>Long · {LONG_COUNT} tests</button>
		</div>
		{#if ai.models.length > 1}
			<div class="pickers">
				{#each ai.models as m (m.file)}
					<label><input type="checkbox" checked={!skipped.includes(m.file)} onchange={(e) => (skipped = (e.target as HTMLInputElement).checked ? skipped.filter((f) => f !== m.file) : [...skipped, m.file])} /> {label(m.file)}</label>
				{/each}
			</div>
		{/if}
		<div class="buttons">
			<button class="ghost" disabled={usingClaude() || !ai.model} onclick={() => runTest([ai.model], long)}>{@html icon("zap", 13)} Test {label(ai.model)}</button>
			{#if ai.models.length > 1}
				<button class="ghost" disabled={usingClaude() || !picked.length} onclick={() => runTest(picked, long)}>{@html icon("layers", 13)} Test the {picked.length} ticked {picked.length === 1 ? "model" : "models"}</button>
			{/if}
		</div>
		{#if usingClaude()}<p class="hint">Turn off Claude above to test the models on this PC.</p>{/if}
		<p class="hint small">{count} tests take {minutes(count * 0.05)} for a small model, longer for big ones{long ? " (an hour or more for Smart)" : ""}. Only downloaded models are tested.{long ? " The long test asks every test several times, worded differently, so the score is steadier." : ""}</p>
	{/if}
	{#if bench.error}<p class="problem">{bench.error}</p>{/if}

	{#if bench.runs.length}
		<div class="runs">
			{#each bench.runs as r (r.model)}
				<div class="run" class:is-open={open === r.model}>
					<button class="head" onclick={() => pick(r)}>
						<b>{label(r.model)}</b>
						{#if r === best && bench.runs.length > 1}<span class="badge">Best here</span>{/if}
						<span class="score score-{tone(r.score)}">{r.score}</span>
						<span class="meta">{r.seconds.toFixed(r.seconds < 10 ? 1 : 0)} s a job{r.wordsPerSecond ? ` · ${Math.round(r.wordsPerSecond)} words/s` : ""}</span>
						<span class="chev" class:down={open === r.model}>{@html icon("chevron", 12)}</span>
					</button>
					{#if r.setup || r.readsPerSecond}
						<p class="setup">{@html icon("cpu", 11)} {[r.setup, r.readsPerSecond ? `reads ${Math.round(r.readsPerSecond)} words/s` : ""].filter(Boolean).join(" · ")}</p>
					{/if}
					{#if r.servedBy && r.servedBy !== r.model}
						<p class="wrong">{@html icon("alert", 12)} The engine had {label(r.servedBy)} loaded, not {label(r.model)}, so this result is really about {label(r.servedBy)}. Test it again.</p>
					{/if}
					<div class="areas">
						{#each Object.entries(r.byArea) as [a, n] (a)}
							<span title={AREAS[a as Area]}><em class="score-{tone(n ?? 0)}" style="width: {n}%"></em><i>{AREAS[a as Area]}</i><b>{n}</b></span>
						{/each}
					</div>
					{#if open === r.model}
						<ul class="jobs">
							{#each r.jobs as j (j.id)}
								<li class:is-miss={j.score < 1}>
									<span class="mark">{@html icon(j.score >= 1 ? "check" : j.score > 0 ? "alert" : "x", 12)}</span>
									<div>
										<span class="ask">{j.ask}</span>
										<span class="sec">{j.seconds.toFixed(j.seconds < 10 ? 1 : 0)} s</span>
										{#each j.notes as n, i (i)}<small>{n}</small>{/each}
										{#if j.did}<code class="did">{j.did}</code>{/if}
									</div>
								</li>
							{/each}
						</ul>
						<div class="foot">
							<span>Tested {day(r.when)}</span>
							<button class="ghost danger" onclick={() => forgetRun(r.model)}>Forget this result</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.test h3 {
		margin: 0 0 6px;
	}
	.hint {
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.45;
		color: var(--muted);
	}
	.hint.small {
		font-size: 11.5px;
		margin-top: 8px;
	}
	.problem {
		color: #e05d5d;
		font-size: 12px;
	}
	.length {
		display: inline-flex;
		margin-bottom: 8px;
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	.length button {
		padding: 3px 10px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--muted);
		font-size: 11.5px;
	}
	.length button.on {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.pickers {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		margin-bottom: 8px;
		font-size: 12px;
		color: var(--text);
	}
	.pickers label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	button {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: inherit;
		cursor: pointer;
	}
	.ghost {
		padding: 6px 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--text);
		font-size: 12px;
		font-weight: 600;
	}
	.ghost:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ghost.danger {
		color: var(--muted);
	}
	.ghost.danger:hover {
		color: #e05d5d;
	}
	.progress .line {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
	}
	.progress .what {
		flex: 1;
		min-width: 0;
	}
	.count {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 4px 10px;
		margin-top: 6px;
		font-size: 11.5px;
		color: var(--muted);
	}
	.count b {
		color: var(--text);
	}
	.now {
		margin: 8px 0 0;
		font-size: 12px;
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		margin-top: 10px;
	}
	.stats div {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 6px 4px;
		border-radius: var(--radius);
		background: color-mix(in srgb, var(--muted) 10%, transparent);
	}
	.stats b {
		font-size: 17px;
		background: none;
	}
	.stats span {
		font-size: 10.5px;
		color: var(--muted);
	}
	.stats .good {
		color: #5fb878;
	}
	.stats .ok {
		color: #e5a84b;
	}
	.stats .bad {
		color: #e05d5d;
	}
	.spin {
		width: 12px;
		height: 12px;
		border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.bar {
		height: 4px;
		margin-top: 8px;
		border-radius: 2px;
		background: color-mix(in srgb, var(--muted) 25%, transparent);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width var(--dur) var(--ease);
	}
	.runs {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 14px;
	}
	.run {
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.2);
		padding: 8px 10px 10px;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text);
		text-align: left;
	}
	.head b {
		font-size: 13px;
		color: var(--heading);
	}
	.badge {
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--accent);
		color: var(--on-accent);
		font-size: 10.5px;
		font-weight: 650;
	}
	.score {
		margin-left: auto;
		font-size: 15px;
		font-weight: 700;
	}
	.meta {
		font-size: 11px;
		color: var(--muted);
	}
	.chev {
		display: inline-flex;
		color: var(--muted);
		transition: transform var(--dur) var(--ease);
	}
	.chev.down {
		transform: rotate(90deg);
	}
	.score-good {
		color: #5fb878;
		background: #5fb878;
	}
	.score-ok {
		color: #e5a84b;
		background: #e5a84b;
	}
	.score-bad {
		color: #e05d5d;
		background: #e05d5d;
	}
	.score.score-good,
	.score.score-ok,
	.score.score-bad {
		background: none;
	}
	.areas {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 4px 10px;
		margin-top: 8px;
	}
	.areas span {
		position: relative;
		padding: 2px 6px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--muted) 12%, transparent);
		font-size: 10.5px;
		color: var(--text);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.areas span {
		display: flex;
		gap: 6px;
	}
	.areas i,
	.areas b {
		position: relative;
		font-style: normal;
	}
	.areas i {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.areas b {
		font-weight: 650;
	}
	.areas em {
		position: absolute;
		inset: 0 auto 0 0;
		opacity: 0.22;
		z-index: 0;
	}
	.jobs {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.jobs li {
		display: flex;
		gap: 7px;
		font-size: 12px;
	}
	.mark {
		display: inline-flex;
		margin-top: 2px;
		color: #5fb878;
	}
	.is-miss .mark {
		color: #e5a84b;
	}
	.jobs div {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 8px;
		min-width: 0;
	}
	.ask {
		flex: 1;
		min-width: 0;
	}
	.sec {
		color: var(--muted);
		font-size: 11px;
	}
	.jobs small {
		flex-basis: 100%;
		color: var(--muted);
		font-size: 11px;
		line-height: 1.4;
	}
	.did {
		flex-basis: 100%;
		margin-top: 2px;
		padding: 5px 7px;
		border-radius: 5px;
		background: color-mix(in srgb, var(--muted) 10%, transparent);
		color: var(--muted);
		font-family: var(--font-code);
		font-size: 10.5px;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.setup {
		display: flex;
		gap: 6px;
		margin: 6px 0 0;
		color: var(--muted);
		font-size: 11px;
		line-height: 1.4;
	}
	.wrong {
		display: flex;
		gap: 6px;
		margin: 8px 0 0;
		color: #e5a84b;
		font-size: 11.5px;
		line-height: 1.4;
	}
	.foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 10px;
		font-size: 11px;
		color: var(--muted);
	}
</style>
