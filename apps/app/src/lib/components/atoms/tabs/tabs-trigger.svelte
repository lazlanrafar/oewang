<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const tabsTriggerVariants = tv({
		base: 'inline-flex cursor-pointer items-center whitespace-nowrap transition-all outline-none disabled:pointer-events-none disabled:opacity-50',
		variants: {
			variant: {
				default:
					'text-body justify-center px-3 py-1.5 font-medium data-[state=active]:bg-background data-[state=active]:text-foreground',
				line: 'text-body relative justify-center px-1 py-1.5 font-medium data-[state=active]:text-foreground',
				segmented:
					'group relative z-1 mb-0 h-9 min-h-9 gap-1.5 border border-transparent bg-[#f7f7f7] px-3 py-1.5 text-[14px] text-[#707070] hover:text-black dark:bg-[#131313] dark:text-[#666666] dark:hover:text-white data-[state=active]:z-10 data-[state=active]:-mb-px data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
			}
		},
		defaultVariants: { variant: 'default' }
	});

	export type TabsTriggerVariant = VariantProps<typeof tabsTriggerVariants>['variant'];
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		...restProps
	}: TabsPrimitive.TriggerProps & { variant?: TabsTriggerVariant } = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(tabsTriggerVariants({ variant }), className)}
	{...restProps}
/>
