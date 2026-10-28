<script lang="ts">
	// A little picture of the app wearing a theme: wallpaper, glass, sidebar,
	// a note with a heading, text, a link and a card.
	import { themeVars, type Theme } from "../../theme/theme";

	interface Props {
		t: Theme;
	}
	let { t }: Props = $props();

	const style = $derived(
		Object.entries(themeVars(t))
			// The full-size light bending is too strong for a thumbnail.
			.map(([k, v]) => `${k}:${v.replace("url(#basalt-liquid)", "url(#basalt-liquid-mini)")}`)
			.join(";")
	);
</script>

<div class="mini" {style} data-h={t.headings.style} class:floating={t.glass.floating}>
	<div class="wall"></div>
	<div class="frame">
		<div class="rib glass"><i class="on"></i><i></i><i></i><i></i></div>
		<div class="side glass">
			<b></b>
			<span></span><span class="on"></span><span class="in"></span><span class="in"></span><span></span>
		</div>
		<div class="page">
			<div class="h"></div>
			<p></p>
			<p class="short"></p>
			<p class="mid"><em></em></p>
			<div class="cards">
				<div class="card"><i></i><s></s></div>
				<div class="card"><i class="alt"></i><s></s></div>
			</div>
		</div>
	</div>
</div>

<style>
	.mini {
		position: relative;
		overflow: hidden;
		aspect-ratio: 16 / 10;
		border-radius: 10px;
		background: var(--bg);
		font-size: 0;
		isolation: isolate;
	}
	.wall {
		position: absolute;
		inset: -10px;
		background: var(--wallpaper);
		filter: blur(calc(var(--wallpaper-blur) * 0.35));
	}
	.wall::after {
		content: "";
		position: absolute;
		inset: 0;
		background: var(--wallpaper-fade);
	}
	.frame {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 9% 27% 1fr;
	}
	.floating .frame {
		inset: 3%;
		gap: 2.5%;
	}
	.floating .rib,
	.floating .side,
	.floating .page {
		border-radius: 6px;
	}
	.glass {
		background-color: var(--surface-panel);
		background-image: var(--glass-grain);
		backdrop-filter: var(--glass-filter);
		box-shadow: var(--glass-edge);
	}
	.rib {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 9%;
		padding-top: 30%;
		border-right: 1px solid var(--border);
	}
	.rib i {
		width: 46%;
		aspect-ratio: 1;
		border-radius: 30%;
		background: color-mix(in srgb, var(--muted) 55%, transparent);
	}
	.rib i.on {
		background: var(--accent);
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 5%;
		padding: 11% 9%;
		border-right: 1px solid var(--border);
	}
	.side b {
		width: 60%;
		height: 6%;
		margin-bottom: 6%;
		border-radius: 3px;
		background: var(--text);
		opacity: 0.85;
	}
	.side span {
		height: 4.5%;
		width: 82%;
		border-radius: 3px;
		background: color-mix(in srgb, var(--muted) 60%, transparent);
	}
	.side span.in {
		width: 64%;
		margin-left: 14%;
	}
	.side span.on {
		background: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}
	.page {
		display: flex;
		flex-direction: column;
		gap: 5%;
		padding: 9% 10%;
		background: var(--surface-page);
	}
	.h {
		width: 58%;
		height: 9%;
		margin-bottom: 4%;
		border-radius: 3px;
		background: var(--heading);
	}
	[data-h="accent"] .h {
		background: var(--accent);
	}
	[data-h="gradient"] .h {
		background: linear-gradient(90deg, var(--accent), var(--link));
	}
	[data-h="bar"] .h {
		box-shadow: -7px 0 0 -2px var(--accent);
		margin-left: 6px;
	}
	[data-h="underline"] .h {
		box-shadow: 0 6px 0 -4.5px var(--border);
	}
	[data-h="caps"] .h {
		width: 44%;
		height: 7%;
	}
	p {
		width: 100%;
		height: 4.5%;
		margin: 0;
		border-radius: 3px;
		background: color-mix(in srgb, var(--text) 55%, transparent);
	}
	p.short {
		width: 74%;
	}
	p.mid {
		display: flex;
		gap: 4%;
		width: 88%;
	}
	p.mid em {
		width: 30%;
		margin-left: 40%;
		border-radius: 3px;
		background: var(--link);
	}
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6%;
		margin-top: auto;
		height: 26%;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 14%;
		padding: 9%;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 0.5);
		background: var(--surface-card);
	}
	.card i {
		width: 40%;
		height: 16%;
		border-radius: 3px;
		background: var(--accent);
	}
	.card i.alt {
		background: var(--link);
		opacity: 0.8;
	}
	.card s {
		width: 80%;
		height: 14%;
		border-radius: 3px;
		background: color-mix(in srgb, var(--muted) 60%, transparent);
	}
</style>
