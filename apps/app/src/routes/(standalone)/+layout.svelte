<script lang="ts">
	import { Toaster } from '$lib/components/atoms/sonner';

	let { children } = $props();
</script>

<Toaster />
{@render children()}
