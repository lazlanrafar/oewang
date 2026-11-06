<script lang="ts" module>
	/** How the figure is inked. A variant, so no caller colours it (D81). */
	export type PageCardTone = 'default' | 'positive' | 'warning' | 'negative';
</script>

<script lang="ts">
	/**
	 * The summary card above a list screen's table, ported from the old
	 * app's `DataTablePageCard`, class for class: a 10px tracked label over a
	 * serif figure at `text-3xl`, in a ruled box.
	 *
	 * A figure handed over as a `Count` counts up from zero, as the old one
	 * did (D108); a plain string, such as a name, renders as it is. While
	 * `loading`, only the figure becomes a skeleton and the label stays, so
	 * the reader knows what is coming.
	 *
	 * Not `molecules/stat-card`: that one is a mono figure with a change
	 * indicator, for the overview. This one has no change to show. Every
	 * figure arrives computed; the card does no arithmetic (D27).
	 */
	import { CountUp, type Count } from '../../atoms/count-up/index.js';
	import { Skeleton } from '../../atoms/skeleton/index.js';
	import { cn } from '$lib/utils.js';

	let {
		label,
		value,
		loading = false,
		hint,
		tone = 'default',
		class: className
	}: {
		label: string;
		/** A `Count` animates; a string is shown as given. */
		value: string | Count;
		loading?: boolean;
		/** One small line under the figure, such as why a total is partial. */
		hint?: string;
		tone?: PageCardTone;
		class?: string;
	} = $props();

	const TONE: Record<PageCardTone, string> = {
		default: '',
		positive: 'text-green',
		warning: 'text-amber-600 dark:text-amber-500',
		negative: 'text-destructive'
	};
</script>

<div data-slot="page-card" class={cn('border-border flex flex-col gap-1 border p-6', className)}>
	<span class="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
		{label}
	</span>
	<span class={cn('mt-1 font-serif text-3xl font-medium tracking-tight tabular-nums', TONE[tone])}>
		{#if loading}
			<Skeleton class="h-9 w-32" />
		{:else if typeof value === 'string'}
			{value}
		{:else}
			<CountUp value={value.value} format={value.format} />
		{/if}
	</span>
	{#if hint && !loading}
		<span class="text-subtle text-caption">{hint}</span>
	{/if}
</div>
