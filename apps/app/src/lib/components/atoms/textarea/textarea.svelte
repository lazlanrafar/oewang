<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	/*
	 * `prompt` is the old app's `PromptInputTextarea`: the field inside the
	 * chat composer, whose own surface draws the border and the background.
	 * One line tall (55px) with the old padding and placeholder colour. The
	 * look belongs here rather than to the caller (D81).
	 */
	let {
		ref = $bindable(null),
		value = $bindable(),
		variant = "default",
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> & {
		variant?: "default" | "prompt";
	} = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		variant === "prompt"
			? "flex h-[55px] max-h-[55px] min-h-[55px] w-full resize-none overflow-hidden border-none bg-transparent p-3 pt-4 text-sm whitespace-nowrap text-ellipsis shadow-none outline-none placeholder:text-[rgba(102,102,102,0.5)] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
			: "border-input dark:bg-input/30 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 disabled:bg-input/50 dark:disabled:bg-input/80 rounded-none border bg-transparent px-3 py-2 text-base transition-colors md:text-sm flex field-sizing-content min-h-16 w-full placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	bind:value
	{...restProps}></textarea>
