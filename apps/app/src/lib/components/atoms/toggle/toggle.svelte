<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	// Ported from the old app's atoms/toggle.tsx.
	export const toggleVariants = tv({
		base: "inline-flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: { default: 'bg-transparent', outline: 'border bg-transparent' },
			size: { default: 'h-9 min-w-9 px-2', sm: 'h-8 min-w-8 px-1.5', lg: 'h-10 min-w-10 px-2.5' }
		},
		defaultVariants: { variant: 'default', size: 'default' }
	});

	export type ToggleVariant = VariantProps<typeof toggleVariants>['variant'];
	export type ToggleSize = VariantProps<typeof toggleVariants>['size'];
</script>

<script lang="ts">
	import { Toggle as TogglePrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		pressed = $bindable(false),
		class: className,
		variant = 'default',
		size = 'default',
		...restProps
	}: TogglePrimitive.RootProps & { variant?: ToggleVariant; size?: ToggleSize } = $props();
</script>

<TogglePrimitive.Root
	bind:ref
	bind:pressed
	data-slot="toggle"
	class={cn(toggleVariants({ variant, size }), className)}
	{...restProps}
/>
