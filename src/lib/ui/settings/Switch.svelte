<script lang="ts">
	// An on/off card: an icon, a title, one line about it and a switch.
	import { icon, type IconName } from "../icons";

	interface Props {
		title: string;
		about: string;
		ico: IconName;
		checked: boolean;
		hint?: string;
		/** Called with the new value when it's flipped. */
		onchange?: (on: boolean) => void;
	}
	let { title, about, ico, checked = $bindable(), hint, onchange }: Props = $props();
</script>

<label class="switch-card" class:is-on={checked}>
	<span class="ico">{@html icon(ico, 18)}</span>
	<span class="words"><b>{title}</b><span>{about}</span>{#if hint}<kbd>{hint}</kbd>{/if}</span>
	<input type="checkbox" bind:checked onchange={() => onchange?.(checked)} />
	<span class="switch" aria-hidden="true"><i></i></span>
</label>

<style>
	.switch-card {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: calc(var(--radius) * 1.3);
		background: color-mix(in srgb, var(--raised) 55%, transparent);
		cursor: pointer;
		transition: border-color var(--dur) var(--ease), background-color var(--dur) var(--ease);
	}
	.switch-card:hover {
		border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
	}
	.ico {
		display: grid;
		place-items: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: var(--radius);
		background: var(--hover);
		color: var(--muted);
		transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
	}
	.is-on .ico {
		background: var(--accent-soft);
		color: var(--accent);
	}
	.words {
		flex: 1;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--muted);
	}
	.words b {
		display: block;
		font-size: 14px;
		font-weight: 600;
		color: var(--text);
	}
	kbd {
		display: inline-block;
		margin-top: 5px;
		padding: 1px 7px;
		border: 1px solid var(--border);
		border-radius: 5px;
		font: 11px var(--font-ui);
		color: var(--muted);
	}
	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.switch {
		position: relative;
		flex: none;
		width: 40px;
		height: 24px;
		border-radius: 24px;
		background: color-mix(in srgb, var(--muted) 35%, transparent);
		transition: background-color var(--dur) var(--ease);
	}
	.switch i {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
		transition: transform var(--dur) var(--ease);
	}
	.is-on .switch {
		background: var(--accent);
	}
	.is-on .switch i {
		transform: translateX(16px);
	}
	input:focus-visible + .switch {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
