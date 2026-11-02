<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/*
	 * Ported from the old app's molecules/item.tsx: a row with optional media,
	 * a title and description, and actions at the end. The list rows in
	 * settings and the wallet picker are built from it.
	 */
	export const itemVariants = tv({
		base: 'group/item flex flex-wrap items-center gap-4 text-sm transition-colors outline-none',
		variants: {
			variant: {
				default: 'bg-transparent',
				outline: 'border p-4',
				muted: 'bg-muted/50 p-4'
			},
			size: { default: 'p-4', sm: 'px-4 py-3' }
		},
		defaultVariants: { variant: 'default', size: 'default' }
	});

	export type ItemVariant = VariantProps<typeof itemVariants>['variant'];
	export type ItemSize = VariantProps<typeof itemVariants>['size'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		size = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		variant?: ItemVariant;
		size?: ItemSize;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="item"
	data-variant={variant}
	data-size={size}
	class={cn(itemVariants({ variant, size }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
