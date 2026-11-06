<script lang="ts" module>
	import type { Component } from 'svelte';

	/**
	 * One option. `value` is what the control holds and submits; `label` is
	 * what a reader sees, and it arrives already resolved through the
	 * dictionary (UI-1) — this component never builds a user-facing string
	 * from a value.
	 *
	 * A row may carry a mark before its label: an icon, or a small colour
	 * square. An item's own mark wins; `mark` on the component is the
	 * fallback for rows that carry none, and for the create row.
	 */
	export type SelectItem = {
		value: string;
		label: string;
		/** A colour square before the label, e.g. a category's colour. */
		colorClass?: string;
		/** An icon before the label. Wins over `colorClass`. */
		icon?: Component;
		/**
		 * A quiet figure at the row's right edge, such as a currency's rate.
		 * In the list only: the trigger shows the label alone, and search
		 * matches the label, never this.
		 */
		detail?: string;
	};

	/** The fallback mark, used by a row without one and by the create row. */
	export type SelectMark = { icon?: Component; colorClass?: string };

	/**
	 * `outline` is the ordinary field. `in-cell` is the borderless variant a
	 * data table cell takes: it fills the cell, drops the border and the
	 * hover fill, and caps its width, which is what the old transaction
	 * columns passed as a class string at every call site.
	 */
	export type SelectVariant = 'outline' | 'in-cell';
</script>

<script lang="ts">
	/**
	 * The app's select: options in, markup out.
	 *
	 * It exists so a call site writes `<Select {items} bind:value />` rather
	 * than assembling a trigger, a panel and a row, each with the class
	 * string that makes it look like this app's. The classes live here once;
	 * a caller passes data and, at most, a variant.
	 *
	 * Two engines, one API. `searchable` (the default) is
	 * `molecules/combobox`, which is what the account and category pickers
	 * have always used: a button that opens a searchable list, with an
	 * optional row that makes a new entry from what was typed.
	 * `searchable={false}` is `atoms/select`, the plain chevron control the
	 * grouping picker uses, where a search box over four fixed options would
	 * be furniture. Both looks are the ones those controls already had
	 * (D52, D66); the second engine exists so the three hand-assembled
	 * trigger-panel-row blocks could stop repeating their classes.
	 *
	 * `name` renders the hidden input that posts the value, because the
	 * trigger is a button and a button submits nothing. The control still
	 * needs script to produce a value, so a form that must work without it
	 * keeps a native `<select>` instead.
	 */
	import { Combobox, type ComboboxItem } from '../combobox/index.js';
	import * as SelectPrimitive from '../../atoms/select/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { cn } from '$lib/utils.js';

	let {
		items,
		value = $bindable(),
		onChange,
		onCreate,
		createLabel = (typed: string) => `Create "${typed}"`,
		placeholder,
		searchPlaceholder,
		mark,
		searchable = true,
		ariaLabel,
		variant = 'outline',
		disabled = false,
		updating = false,
		name,
		id,
		class: className
	}: {
		items: SelectItem[];
		value?: string;
		/** Called with the chosen value, after `value` has moved. */
		onChange?: (value: string) => void;
		/** Offers a row that makes a new entry from what was typed. */
		onCreate?: (label: string) => void;
		/** The create row's text. Passed in, never invented here (UI-1). */
		createLabel?: (typed: string) => string;
		placeholder?: string;
		searchPlaceholder?: string;
		mark?: SelectMark;
		/** `false` drops the search box and the create row: a plain select. */
		searchable?: boolean;
		/**
		 * The accessible name. A `role="combobox"` is not named by its
		 * contents the way a button is, so a trigger that shows only a value
		 * needs one (UI-6).
		 */
		ariaLabel?: string;
		variant?: SelectVariant;
		disabled?: boolean;
		/** Shows the spinner a cell shows while a change is in flight. */
		updating?: boolean;
		/** Posts the value as a hidden input, for a SvelteKit form action. */
		name?: string;
		id?: string;
		/** Extra classes for the trigger. The variant does the shaping. */
		class?: string;
	} = $props();

	const inCell = $derived(variant === 'in-cell');

	/** The combobox keys its rows by `id`; the public shape says `value`. */
	const options: ComboboxItem[] = $derived(
		items.map((item) => ({ id: item.value, label: item.label }))
	);

	const byValue = $derived(new Map(items.map((item) => [item.value, item])));

	function markFor(item?: SelectItem): SelectMark {
		if (item?.icon) return { icon: item.icon };
		if (item?.colorClass) return { colorClass: item.colorClass };
		return mark ?? {};
	}
</script>

{#snippet markOf(item?: SelectItem)}
	{@const { icon, colorClass } = markFor(item)}
	{#if icon}
		{@const Icon = icon}
		<Icon class="text-subtle size-3 shrink-0" aria-hidden="true" />
	{:else if colorClass}
		<span class={cn('size-2 shrink-0', colorClass)} aria-hidden="true"></span>
	{/if}
{/snippet}

<div class={cn('relative', inCell && 'h-full w-full')}>
	{#if !searchable}
		<SelectPrimitive.Root
			type="single"
			{value}
			onValueChange={(chosen) => {
				value = chosen;
				onChange?.(chosen);
			}}
			{disabled}
		>
			<!-- `w-full` by default, as the searchable engine is: a field fills
			     its column unless the caller says otherwise, and `class` comes
			     after, so a width the caller states still wins. -->
			<SelectPrimitive.Trigger
				{id}
				aria-label={ariaLabel}
				class={cn(
					'w-full justify-between',
					inCell && 'h-full border-none px-3 hover:bg-transparent max-w-[280px]',
					className
				)}
			>
				<!-- The mark is the selector's own, drawn once on the trigger
				     rather than against every row, which is how the live app
				     draws this control. -->
				{@render markOf(byValue.get(value ?? ''))}
				{byValue.get(value ?? '')?.label ?? placeholder}
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Content>
				{#each items as item (item.value)}
					<SelectPrimitive.Item value={item.value}>
						{item.label}
						{#if item.detail}
							<span class="text-subtle ml-auto pl-3 text-xs tabular-nums">{item.detail}</span>
						{/if}
					</SelectPrimitive.Item>
				{/each}
			</SelectPrimitive.Content>
		</SelectPrimitive.Root>
	{:else}
	<Combobox
		{id}
		items={options}
		bind:value
		onSelect={onChange}
		{onCreate}
		{placeholder}
		{searchPlaceholder}
		disabled={disabled || updating}
		variant={inCell ? 'ghost' : 'outline'}
		triggerClass={cn(
			inCell && 'h-full w-full justify-start border-none px-3 hover:bg-transparent max-w-[280px]',
			className
		)}
	>
		{#snippet selected(entry)}
			<!-- `min-w-0` on the row and no percentage cap on the label: a
			     percentage max-width inside a shrink-to-fit flex item resolves
			     against a width the truncation itself decides, which clipped a
			     three-letter value to one letter when the row had no mark. -->
			<span class="flex min-w-0 items-center space-x-2">
				{@render markOf(byValue.get(entry.id))}
				<span class="text-body truncate text-left font-medium">{entry.label}</span>
			</span>
		{/snippet}
		{#snippet create(typed)}
			<span class="flex items-center space-x-2 py-1">
				{@render markOf(undefined)}
				<span class="text-body">{createLabel(typed)}</span>
			</span>
		{/snippet}
		{#snippet item(entry)}
			{@const detail = byValue.get(entry.id)?.detail}
			<span class="flex w-full min-w-0 items-center space-x-2 py-1">
				{@render markOf(byValue.get(entry.id))}
				<span class="text-body line-clamp-1 font-medium">{entry.label}</span>
				{#if detail}
					<span class="text-subtle ml-auto shrink-0 pl-3 text-xs font-normal tabular-nums">
						{detail}
					</span>
				{/if}
			</span>
		{/snippet}
	</Combobox>
	{/if}

	{#if name}
		<!-- The trigger is a button, so the value needs its own input to post. -->
		<input type="hidden" {name} value={value ?? ''} />
	{/if}

	{#if updating}
		<div class="bg-background/50 absolute inset-0 z-20 flex items-center justify-center">
			<Spinner size={12} />
		</div>
	{/if}
</div>
