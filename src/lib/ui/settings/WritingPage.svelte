<script lang="ts">
	import { writing } from "../../writing.svelte";
	import Switch from "./Switch.svelte";
</script>

<section class="st-section list">
	<Switch title="Focus mode" about="Hides everything but the note you're writing." ico="focus" hint="Ctrl+Shift+Enter · Esc to leave" bind:checked={writing.focus} />
	<Switch title="Show the title above each note" about="The note's name, big, at the top. Click it to rename the note. New notes open with it selected." ico="pencil" bind:checked={writing.inlineTitle} />
	<Switch title="Typewriter scrolling" about="Keeps the line you're typing on in the middle of the screen." ico="type" bind:checked={writing.typewriter} />
	<Switch title="Dim other paragraphs" about="Fades everything except the paragraph you're in." ico="eye" bind:checked={writing.dimOthers} />
	<Switch title="Spell check" about="Underlines words that might be misspelled." ico="check" bind:checked={writing.spellcheck} />
	<Switch title="Check grammar as I write" about="Your AI checks each paragraph once you move on from it, and underlines mistakes. Only spelling, grammar and punctuation; it never rewords. Uses your graphics card while you write." ico="sparkles" bind:checked={writing.aiCheck} />
</section>

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
</style>
