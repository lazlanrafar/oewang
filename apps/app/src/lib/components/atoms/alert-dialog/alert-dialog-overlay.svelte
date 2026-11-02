<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	// The old overlay is the page colour at 60 per cent, not black.
	let { ref = $bindable(null), class: className, ...restProps }: AlertDialogPrimitive.OverlayProps =
		$props();
</script>

<AlertDialogPrimitive.Overlay
	bind:ref
	data-slot="alert-dialog-overlay"
	class={cn(
		'fixed inset-0 z-50 bg-[#f6f6f3]/60 dark:bg-[#0C0C0C]/80 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
		className
	)}
	{...restProps}
/>
