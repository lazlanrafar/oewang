<script lang="ts">
	/**
	 * A plain `<select>`, styled like the rest of the fields.
	 *
	 * It exists because the rich select is a button, and a button submits
	 * nothing: every form that has to work before script does keeps a native
	 * control, and three of them had copied the same class string. The string
	 * lives here now, which is the whole point of an atom.
	 *
	 * Square, a plain border, the same height as `Input` (D52, D66).
	 */
	import type { HTMLSelectAttributes } from 'svelte/elements';

	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLSelectAttributes> = $props();
</script>

<select
	bind:this={ref}
	bind:value
	data-slot="native-select"
	class={cn('border-input bg-background h-9 w-full border px-3 text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</select>
