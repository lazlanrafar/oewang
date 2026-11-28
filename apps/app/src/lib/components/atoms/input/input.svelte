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
	 *
	 * `in-cell` is the borderless form a table cell takes, the input
	 * counterpart of the pickers' `inDataTable`: it fills the cell, which
	 * drops its own padding for it, and takes the table's text size.
	 * `in-cell-figure` is the same for a quantity or an amount: right
	 * aligned, mono, tabular, so a column of figures lines up (D81).
	 */

	type InputVariant = 'default' | 'in-cell' | 'in-cell-figure';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	> & { variant?: InputVariant };

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		variant = 'default',
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

	const inCell = 'h-full min-h-9 border-0 px-3 text-[length:inherit]';
	const variants: Record<InputVariant, string> = {
		default: '',
		'in-cell': inCell,
		'in-cell-figure': `${inCell} text-right font-mono tabular-nums`
	};

	const classes = $derived(cn(base, variants[variant], className));
	/** What the table cell keys its zero padding on. */
	const inCellAttr = $derived(variant === 'default' ? undefined : '');
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={classes}
		data-in-cell={inCellAttr}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={classes}
		data-in-cell={inCellAttr}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
