<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export type Side = 'top' | 'right' | 'bottom' | 'left';

	/*
	 * Ported from the old app's atoms/sheet.tsx, including its two layers:
	 * the fixed panel, which carries `md:p-4` so the sheet floats 16px off the
	 * viewport edges on a desktop, and an inner div that holds the border, the
	 * background and whatever class the caller passes.
	 *
	 * That gap is the look. Fighting it with `rounded-none` or a left-only
	 * border, as the first port did, is what made the sheet look broken.
	 */
	export const sheetVariants = tv({
		base: 'fixed z-50 gap-4 transition ease-in-out data-open:animate-in data-closed:animate-out data-closed:duration-200 data-open:duration-300 md:p-4',
		variants: {
			side: {
				top: 'inset-x-0 top-0 data-open:slide-in-from-top data-closed:slide-out-to-top',
				bottom:
					'inset-x-0 bottom-0 data-open:slide-in-from-bottom data-closed:slide-out-to-bottom',
				left: 'inset-y-0 left-0 h-full w-3/4 data-open:slide-in-from-left data-closed:slide-out-to-left sm:max-w-sm',
				right:
					'inset-y-0 right-0 h-full w-3/4 data-open:slide-in-from-right data-closed:slide-out-to-right sm:max-w-[520px]'
			}
		},
		defaultVariants: { side: 'right' }
	});

	export type SheetSide = VariantProps<typeof sheetVariants>['side'];
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
	import SheetOverlay from './sheet-overlay.svelte';
	import SheetPortal from './sheet-portal.svelte';

	let {
		ref = $bindable(null),
		class: className,
		side = 'right',
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		side?: Side;
		children: Snippet;
	} = $props();
</script>

<SheetPortal>
	<SheetOverlay />
	<SheetPrimitive.Content bind:ref data-slot="sheet-content" class={sheetVariants({ side })} {...restProps}>
		<div
			data-slot="sheet-panel"
			class={cn('bg-background relative flex h-full w-full flex-col overflow-visible border p-6', className)}
		>
			{@render children?.()}
		</div>
	</SheetPrimitive.Content>
</SheetPortal>
