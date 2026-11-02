<script lang="ts">
	/**
	 * No shell.
	 *
	 * The design system is about the primitives, so it renders on a bare
	 * page: a sidebar and a header around it would be two more things whose
	 * styles could be mistaken for the specimen's.
	 */
	let { children } = $props();
</script>

<div class="min-h-svh px-6 py-8">
	{@render children()}
</div>
