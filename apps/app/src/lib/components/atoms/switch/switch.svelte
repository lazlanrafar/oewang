<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	/*
	 * Ported from the old app's atoms/switch.tsx, which is 44x24 with a 20px
	 * thumb and an off state of #e0e0e0, #666 in the dark. Square rather than
	 * `rounded-full` (D52), and the focus ring is gone with every other ring
	 * (D54).
	 */
	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: SwitchPrimitive.RootProps = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border-2 border-transparent transition-colors outline-none',
		'data-[state=checked]:bg-primary data-[state=unchecked]:bg-[#e0e0e0] dark:data-[state=unchecked]:bg-[#666]',
		'disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="bg-background pointer-events-none block size-5 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
	/>
</SwitchPrimitive.Root>
