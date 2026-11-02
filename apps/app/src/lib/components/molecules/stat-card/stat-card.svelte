<script lang="ts">
	import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';

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
	let {
		label,
		value,
		change,
		changeLabel,
		loading = false,
		class: className
	}: {
		label: string;
		value: string;
		/** Signed percentage, already computed. */
		change?: number;
		changeLabel?: string;
		loading?: boolean;
		class?: string;
	} = $props();

	const up = $derived((change ?? 0) >= 0);
</script>

<div
	data-slot="stat-card"
	class={cn('bg-background border-border flex flex-col overflow-hidden border p-4', className)}
>
	<span class="text-subtle text-small">{label}</span>
	{#if loading}
		<Skeleton class="mt-2 h-6 w-32" />
	{:else}
		<span class="mt-1 font-mono text-xl">{value}</span>
	{/if}
	{#if change !== undefined && !loading}
		<span
			class={cn(
				'text-small mt-2 flex items-center gap-1 font-medium',
				up ? 'text-green' : 'text-red'
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
