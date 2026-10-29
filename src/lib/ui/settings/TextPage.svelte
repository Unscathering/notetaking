<script lang="ts">
	import { FONT_CHOICES, type HeadingStyle } from "../../theme/theme";
	import { theme } from "../../theme/store.svelte";
	import Slider from "./Slider.svelte";

	const FONTS = Object.entries(FONT_CHOICES);
	const STYLES: Array<[HeadingStyle, string]> = [
		["plain", "Plain"], ["underline", "Underlined"], ["bar", "Accent bar"], ["accent", "Accent color"], ["gradient", "Gradient"], ["caps", "Small caps"],
	];
	const WEIGHTS: Array<[number, string]> = [[500, "Light"], [600, "Medium"], [700, "Bold"], [800, "Heavy"]];
</script>

<section class="st-section">
	<div class="sample" style:font-family={theme.type.editorFont} style:font-size="{theme.type.size}px" style:line-height={theme.type.lineHeight}>
		<div class="sample-h" data-style={theme.headings.style} style:font-family={theme.headings.font || theme.type.editorFont} style:font-weight={theme.headings.weight} style:font-size="calc(1em * {theme.type.headingScale} * {theme.type.headingScale})">A walk by the sea</div>
		<p>The tide came in slowly while we talked about nothing much. <b>Gulls</b> argued over a chip, and the light went <em>soft and gold</em> before we noticed.</p>
	</div>
</section>

<section class="st-section">
	<h3 class="st-h">Note font</h3>
	<p class="st-sub">The letters you write and read in.</p>
	<div class="st-grid" style:--min="128px">
		{#each FONTS as [name, css] (name)}
			<button class="st-card font" class:is-on={theme.type.editorFont === css} onclick={() => (theme.type.editorFont = css)}>
				<span class="aa" style:font-family={css}>Aa</span>
				<span class="name">{name}</span>
			</button>
		{/each}
	</div>
</section>

<section class="st-section">
	<h3 class="st-h">Interface font</h3>
	<p class="st-sub">Menus, the sidebar and buttons.</p>
	<div class="st-chips">
		{#each FONTS as [name, css] (name)}
			<button class="st-chip" class:is-on={theme.type.uiFont === css} style:font-family={css} onclick={() => (theme.type.uiFont = css)}>{name}</button>
		{/each}
	</div>
</section>

<section class="st-section">
	<h3 class="st-h">Size and spacing</h3>
	<div class="st-two">
		<Slider label="Text size" bind:value={theme.type.size} min={12} max={26} format={(v) => `${v}px`} ends={["Small", "Large"]} />
		<Slider label="Line spacing" bind:value={theme.type.lineHeight} min={1.2} max={2.2} step={0.05} format={(v) => v.toFixed(2)} ends={["Tight", "Airy"]} />
		<Slider label="Text width" bind:value={theme.type.width} min={0} max={120} step={2} format={(v) => (v === 0 ? "Full" : `${v} letters`)} ends={["Full width", "Wide"]} />
	</div>
</section>

<section class="st-section">
	<h3 class="st-h">Headings</h3>
	<p class="st-sub">How titles in your notes stand out.</p>
	<div class="st-grid" style:--min="150px">
		{#each STYLES as [id, name] (id)}
			<button class="st-card heading" class:is-on={theme.headings.style === id} onclick={() => (theme.headings.style = id)}>
				<span class="h-demo"><span class="sample-h" data-style={id} style:font-family={theme.headings.font || theme.type.editorFont} style:font-weight={theme.headings.weight}>Heading</span></span>
				<span class="name">{name}</span>
			</button>
		{/each}
	</div>
	<div class="row">
		<span class="label">Font</span>
		<div class="st-chips">
			<button class="st-chip" class:is-on={!theme.headings.font} onclick={() => (theme.headings.font = "")}>Same as notes</button>
			{#each FONTS as [name, css] (name)}
				<button class="st-chip" class:is-on={theme.headings.font === css} style:font-family={css} onclick={() => (theme.headings.font = css)}>{name}</button>
			{/each}
		</div>
	</div>
	<div class="row">
		<span class="label">Position</span>
		<div class="st-chips">
			{#each [["left", "Left"], ["title", "Title and top headings centered"], ["all", "All centered"]] as [id, name] (id)}
				<button class="st-chip" class:is-on={(theme.headings.align ?? "left") === id} onclick={() => (theme.headings.align = id as "left" | "title" | "all")}>{name}</button>
			{/each}
		</div>
	</div>
	<p class="st-sub tip">To center one line anywhere, write it as <code>-&gt; like this &lt;-</code> (works on headings too).</p>
	<div class="row">
		<span class="label">Weight</span>
		<div class="st-chips">
			{#each WEIGHTS as [w, name] (w)}
				<button class="st-chip" class:is-on={theme.headings.weight === w} style:font-weight={w} onclick={() => (theme.headings.weight = w)}>{name}</button>
			{/each}
		</div>
	</div>
	<div class="st-two">
		<Slider label="Heading size" bind:value={theme.type.headingScale} min={1} max={1.5} step={0.01} format={(v) => `${v.toFixed(2)}×`} ends={["Close to text", "Big"]} />
	</div>
</section>

<style>
	.sample {
		padding: 22px 26px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.4);
		background: var(--bg);
		color: var(--text);
	}
	.sample p {
		margin: 10px 0 0;
	}
	.sample-h {
		color: var(--heading);
		line-height: 1.25;
	}
	.sample-h[data-style="underline"] {
		padding-bottom: 0.15em;
		border-bottom: 1px solid var(--border);
	}
	.sample-h[data-style="bar"] {
		padding-left: 14px;
		background: linear-gradient(var(--accent), var(--accent)) left center / 4px 0.9em no-repeat;
	}
	.sample-h[data-style="accent"] {
		color: var(--accent);
	}
	.sample-h[data-style="gradient"] {
		background: linear-gradient(90deg, var(--accent), var(--link), var(--heading));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.sample-h[data-style="caps"] {
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.85em;
	}
	.font {
		align-items: center;
		padding: 14px 8px 10px;
	}
	.aa {
		font-size: 34px;
		line-height: 1.1;
		color: var(--heading);
	}
	.heading {
		padding: 10px;
	}
	.h-demo {
		display: grid;
		place-items: center start;
		height: 64px;
		padding: 0 12px;
		border-radius: var(--radius);
		background: var(--bg);
		font-size: 22px;
	}
	.row {
		display: flex;
		gap: 14px;
		align-items: baseline;
		margin: 16px 0;
	}
	.label {
		flex: none;
		width: 54px;
		font-size: 12.5px;
		color: var(--muted);
	}
</style>
