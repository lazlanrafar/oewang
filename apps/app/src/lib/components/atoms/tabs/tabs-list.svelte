<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/*
	 * Ported from the old app's atoms/tabs.tsx, variants and all.
	 *
	 * `default` is a filled bar, `line` a bare row, `segmented` the joined
	 * pill row the old settings pages use. Square, like everything else (D52).
	 */
	export const tabsListVariants = tv({
		base: 'bg-accent text-subtle inline-flex h-10 items-center justify-center p-1 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
		variants: {
			variant: {
				default: '',
				line: 'h-auto gap-1 bg-transparent p-0',
				segmented: 'h-auto w-fit items-stretch bg-[#f7f7f7] p-0 dark:bg-[#131313]'
			}
		},
		defaultVariants: { variant: 'default' }
	});

	export type TabsListVariant = VariantProps<typeof tabsListVariants>['variant'];
</script>

<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		...restProps
	}: TabsPrimitive.ListProps & { variant?: TabsListVariant } = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={cn(tabsListVariants({ variant }), className)}
	{...restProps}
/>
