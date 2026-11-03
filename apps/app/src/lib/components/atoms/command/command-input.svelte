<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	/**
	 * The search line, which is a line rather than a field.
	 *
	 * The old app's pickers put the placeholder straight on the panel, with
	 * nothing between it and the first row. A bordered box with a magnifier
	 * inside a panel that is already a box reads as a control within a
	 * control, and it is the only thing in the panel that is not a row.
	 */
	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps = $props();
</script>

<CommandPrimitive.Input
	bind:ref
	bind:value
	data-slot="command-input"
	class={cn(
		"placeholder:text-muted-foreground flex h-11 w-full bg-transparent px-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...restProps}
/>
