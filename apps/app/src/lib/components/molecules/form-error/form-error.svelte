<script lang="ts">
	let { message }: { message?: string } = $props();
</script>

{#if message}
	<!-- Announced, so a failure is not silent for a screen reader. -->
	<p
		role="alert"
		class="border-destructive/30 bg-destructive/10 text-destructive mb-4 border px-3 py-2 text-sm"
	>
		{message}
	</p>
{/if}
