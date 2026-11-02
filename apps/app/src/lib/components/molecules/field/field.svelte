<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	/*
	 * Ported from the old app's molecules/field.tsx, trimmed to the parts this
	 * product uses: a label, a control, a description and an error, laid out
	 * vertically or horizontally.
	 */
	export const fieldVariants = tv({
		base: 'group/field flex w-full gap-3 data-[invalid=true]:text-destructive',
		variants: {
			orientation: {
				vertical: 'flex-col [&>*]:w-full',
				horizontal: 'flex-row items-center [&>[data-slot=field-label]]:flex-auto'
			}
		},
		defaultVariants: { orientation: 'vertical' }
	});

	export type FieldOrientation = VariantProps<typeof fieldVariants>['orientation'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		orientation = 'vertical',
		invalid = false,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		orientation?: FieldOrientation;
		invalid?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="field"
	data-orientation={orientation}
	data-invalid={invalid}
	role="group"
	class={cn(fieldVariants({ orientation }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
