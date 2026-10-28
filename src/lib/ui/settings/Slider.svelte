<script lang="ts">
	// A labelled slider with a filled track and the value shown on the right.
	interface Props {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		/** Words at each end, like "Slower" and "Faster". */
		ends?: [string, string];
		format?: (v: number) => string;
		disabled?: boolean;
		oninput?: () => void;
	}
	let { label, value = $bindable(), min, max, step = 1, ends, format = String, disabled = false, oninput }: Props = $props();
	const fill = $derived(((value - min) / (max - min)) * 100);
</script>

<label class="slider" class:is-off={disabled}>
	<span class="top"><span>{label}</span><output>{format(value)}</output></span>
	<input type="range" {min} {max} {step} {disabled} bind:value {oninput} style:--fill="{fill}%" />
	{#if ends}<span class="ends"><span>{ends[0]}</span><span>{ends[1]}</span></span>{/if}
</label>

<style>
	.slider {
		display: block;
		margin: 4px 0 16px;
	}
	.slider.is-off {
		opacity: 0.45;
	}
	.top {
		display: flex;
		justify-content: space-between;
		margin-bottom: 8px;
		font-size: 13px;
		color: var(--text);
	}
	output {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	input {
		width: 100%;
		height: 6px;
		margin: 0;
		border-radius: 6px;
		background: linear-gradient(var(--accent), var(--accent)) 0 / var(--fill) 100% no-repeat, color-mix(in srgb, var(--muted) 28%, transparent);
		appearance: none;
		cursor: pointer;
	}
	input::-webkit-slider-thumb {
		width: 18px;
		height: 18px;
		border: 3px solid var(--accent);
		border-radius: 50%;
		background: var(--raised);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		appearance: none;
		transition: transform var(--dur) var(--ease);
	}
	input:hover::-webkit-slider-thumb,
	input:active::-webkit-slider-thumb {
		transform: scale(1.15);
	}
	.ends {
		display: flex;
		justify-content: space-between;
		margin-top: 6px;
		font-size: 11.5px;
		color: var(--muted);
	}
</style>
