<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	/*
	 * Ported from the old app's atoms/input.tsx.
	 *
	 * Square, a plain border, no ring. The old class string ended with
	 * `focus-visible:outline-none`; that is dropped so the global
	 * `:focus-visible` outline in app.css can show (UI-7).
	 *
	 * The autofill overrides are carried across verbatim: without them Chrome
	 * paints its own pale yellow background over a transparent input, which
	 * looks broken in dark mode.
	 */

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();

	const base =
		'flex h-9 w-full border bg-transparent px-3 py-1 text-sm transition-colors ' +
		'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ' +
		'file:border-0 file:bg-transparent file:text-sm file:font-medium ' +
		'[&:-webkit-autofill]:bg-transparent! [&:-webkit-autofill]:bg-none! ' +
		'[&:-webkit-autofill]:shadow-none!';
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(base, className)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(base, className)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
