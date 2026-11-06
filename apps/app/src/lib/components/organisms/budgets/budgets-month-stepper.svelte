<script lang="ts">
	/**
	 * Which month the budgets are measured in: back, the month, forward.
	 *
	 * The month lives in the URL (UI-8, D55); this control only says which
	 * one to go to. It is computed from the `YYYY-MM` parts rather than
	 * through `Date`, which would read the string as UTC and land on the
	 * wrong month west of it.
	 */
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	import { Button } from '$lib/components/atoms/button';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	let {
		month,
		onChange,
		locale = 'en-GB',
		class: className
	}: {
		/** `YYYY-MM`. */
		month: string;
		onChange: (month: string) => void;
		locale?: string;
		class?: string;
	} = $props();

	const parts = $derived(month.split('-').map(Number) as [number, number]);

	const label = $derived(
		new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
			new Date(Date.UTC(parts[0], parts[1] - 1, 1))
		)
	);

	function shift(by: number) {
		const index = parts[0] * 12 + (parts[1] - 1) + by;
		const year = Math.floor(index / 12);
		const next = (index % 12) + 1;
		onChange(`${year}-${String(next).padStart(2, '0')}`);
	}
</script>

<div class={cn('flex items-center gap-1', className)}>
	<Button variant="ghost" size="icon" aria-label={t('budget.previous_month')} onclick={() => shift(-1)}>
		<ChevronLeft />
	</Button>
	<span class="min-w-32 text-center text-sm font-medium tabular-nums" aria-live="polite">
		{label}
	</span>
	<Button variant="ghost" size="icon" aria-label={t('budget.next_month')} onclick={() => shift(1)}>
		<ChevronRight />
	</Button>
</div>
