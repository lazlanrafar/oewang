<script lang="ts">
	import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import type { Component } from 'svelte';

	import { CountUp, type Count } from '../../atoms/count-up/index.js';
	import { Skeleton } from '../../atoms/skeleton/index.js';
	import { cn } from '$lib/utils.js';

	/*
	 * Ported from the old app's molecules/stat-card.tsx: a label, a value, and
	 * an optional change against the previous period.
	 *
	 * The change carries an arrow as well as a colour, so the direction reads
	 * without hue (UI-7), and the value is pre-formatted by the caller: this
	 * component never does arithmetic on money (D12, D27).
	 */
	/*
	 * A figure handed over as a `Count` counts up, as the old overview cards
	 * did (D108); a plain string, such as a category name, shows as given.
	 */
	/*
	 * Two additions for the overview's cards (D87): a footer line under the
	 * figure, and a click, which makes the whole card a button. `invert` is
	 * for a figure where up is the bad direction, such as expenses: the
	 * arrow still points up, the colour says it is not good news.
	 */
	let {
		label,
		value,
		change,
		changeLabel,
		hint,
		invert = false,
		icon,
		onclick,
		ariaLabel,
		loading = false,
		class: className
	}: {
		label: string;
		/** A `Count` animates; a string is shown as given. */
		value: string | Count;
		/** Signed percentage, already computed. */
		change?: number;
		changeLabel?: string;
		/** One line under the figure: the range, a count, what was left out. */
		hint?: string;
		invert?: boolean;
		icon?: Component<{ class?: string }>;
		onclick?: () => void;
		/** The accessible name when the card is a button, which is more than its label. */
		ariaLabel?: string;
		loading?: boolean;
		class?: string;
	} = $props();

	const up = $derived((change ?? 0) >= 0);
	const good = $derived(invert ? !up : up);
	const Icon = $derived(icon);
</script>

{#if onclick}
	<button
		type="button"
		{onclick}
		aria-label={ariaLabel}
		data-slot="stat-card"
		class={cn(
			'bg-background border-border hover:border-foreground/40 flex cursor-pointer flex-col overflow-hidden border text-left transition-colors',
			className
		)}
	>
		{@render content()}
	</button>
{:else}
	<div
		data-slot="stat-card"
		class={cn('bg-background border-border flex flex-col overflow-hidden border', className)}
	>
		{@render content()}
	</div>
{/if}

{#snippet content()}
	<div class="flex flex-col p-4">
		<span class="text-subtle text-small flex items-center justify-between gap-2">
			{label}
			{#if Icon}
				<Icon class="size-4 shrink-0" />
			{/if}
		</span>
		{#if loading}
			<Skeleton class="mt-2 h-6 w-32" />
		{:else}
			<span class="mt-1 truncate font-mono text-xl">
				{#if typeof value === 'string'}
					{value}
				{:else}
					<CountUp value={value.value} format={value.format} />
				{/if}
			</span>
		{/if}
		{#if change !== undefined && !loading}
			<span
				class={cn(
					'text-small mt-2 flex items-center gap-1 font-medium',
					good ? 'text-green' : 'text-red'
				)}
			>
				{#if up}
					<ArrowUpRight class="size-3" />
				{:else}
					<ArrowDownRight class="size-3" />
				{/if}
				{up ? '+' : ''}{change}%
				{#if changeLabel}
					<span class="text-subtle font-normal">{changeLabel}</span>
				{/if}
			</span>
		{/if}
	</div>
	{#if hint && !loading}
		<span class="text-subtle text-caption bg-muted/60 mt-auto truncate border-t px-4 py-2">
			{hint}
		</span>
	{/if}
{/snippet}
