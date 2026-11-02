<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	// Ported from the old app's atoms/alert.tsx, including the icon rules that
	// place an `svg` child in the top-left corner.
	export const alertVariants = tv({
		base: 'relative w-full border p-4 [&>svg]:absolute [&>svg]:top-4 [&>svg]:left-4 [&>svg]:text-foreground [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px]',
		variants: {
			variant: {
				default: 'bg-background text-foreground',
				destructive: 'border-destructive/50 text-destructive [&>svg]:text-destructive',
				warning: 'border-[#e5c07b] bg-[#fff8e6] dark:border-[#4a2800] dark:bg-[#1f1400]'
			}
		},
		defaultVariants: { variant: 'default' }
	});

	export type AlertVariant = VariantProps<typeof alertVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { variant?: AlertVariant } = $props();
</script>

<div
	bind:this={ref}
	data-slot="alert"
	role="alert"
	class={cn(alertVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
