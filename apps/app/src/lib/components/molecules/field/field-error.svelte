<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	// The error is announced, not just coloured: colour is never the only
	// carrier of meaning (UI-7).
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
	bind:this={ref}
	data-slot="field-error"
	role="alert"
	class={cn('text-destructive text-small font-normal', className)}
	{...restProps}
>
	{@render children?.()}
</p>
