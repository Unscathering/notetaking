<script lang="ts">
	import { writing } from "../../writing.svelte";
	import Switch from "./Switch.svelte";
</script>

<section class="st-section list">
	<Switch title="Focus mode" about="Hides everything but the note you're writing." ico="focus" hint="Ctrl+Shift+Enter · Esc to leave" bind:checked={writing.focus} />
	<Switch title="Typewriter scrolling" about="Keeps the line you're typing on in the middle of the screen." ico="type" bind:checked={writing.typewriter} />
	<Switch title="Dim other paragraphs" about="Fades everything except the paragraph you're in." ico="eye" bind:checked={writing.dimOthers} />
	<Switch title="Spell check" about="Underlines words that might be misspelled." ico="check" bind:checked={writing.spellcheck} />
</section>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
</style>
