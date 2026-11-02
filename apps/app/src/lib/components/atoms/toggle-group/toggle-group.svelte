<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import { setToggleGroupContext, type ToggleGroupVariantContext } from './context.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		variant = 'default',
		size = 'default',
		...restProps
	}: ToggleGroupPrimitive.RootProps & ToggleGroupVariantContext = $props();

	setToggleGroupContext({
		get variant() {
			return variant;
		},
		get size() {
			return size;
		}
	});
</script>

<ToggleGroupPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="toggle-group"
	data-variant={variant}
	data-size={size}
	class={cn('flex w-fit items-center', className)}
	{...restProps}
/>
