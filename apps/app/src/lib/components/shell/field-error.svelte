<script lang="ts">
	let { message }: { message?: string } = $props();
</script>

{#if message}
	<p class="text-destructive mt-1 text-xs">{message}</p>
{/if}
