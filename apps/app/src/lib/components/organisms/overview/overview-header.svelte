<script lang="ts" module>
	export const OVERVIEW_TABS = ['overview', 'metrics'] as const;
	export type OverviewTab = (typeof OVERVIEW_TABS)[number];
</script>

<script lang="ts">
	/**
	 * The greeting, the range and the two tabs (D87).
	 *
	 * Ported from the old app's `overview-client.tsx`. The greeting is read
	 * from the clock after mount: the server's hour is not the reader's, and
	 * rendering it there would greet a Bali evening with "Good morning".
	 */
	import Grid2x2 from '@lucide/svelte/icons/grid-2x2';
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import { onMount } from 'svelte';

	import { t } from '$lib/i18n';

	import * as Tabs from '../../atoms/tabs/index.js';
	import { DateRangePicker, type DateRange } from '../../molecules/date-range-picker/index.js';

	let {
		name,
		tab,
		range,
		onTab,
		onRange
	}: {
		/** What to call the reader. */
		name: string;
		tab: OverviewTab;
		range: DateRange;
		onTab: (tab: OverviewTab) => void;
		onRange: (range: DateRange | undefined) => void;
	} = $props();

	let hour = $state<number | null>(null);
	onMount(() => (hour = new Date().getHours()));

	const greeting = $derived(
		hour === null
			? ''
			: hour < 12
				? t('overview.greeting_morning', { name })
				: hour < 17
					? t('overview.greeting_afternoon', { name })
					: t('overview.greeting_evening', { name })
	);
</script>

<div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
	<div class="min-w-0">
		<h1 class="min-h-8 truncate font-serif text-2xl">{greeting}</h1>
		<p class="text-subtle text-small">
			{tab === 'overview' ? t('overview.subtitle_overview') : t('overview.subtitle_metrics')}
		</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<DateRangePicker value={range} onValueChange={onRange} />

		<Tabs.Root value={tab} onValueChange={(next) => onTab(next as OverviewTab)}>
			<Tabs.List variant="segmented" aria-label={t('overview.tabs_label')}>
				<Tabs.Trigger value="overview" variant="segmented">
					<Grid2x2 class="size-4" aria-hidden="true" />
					{t('overview.tab_overview')}
				</Tabs.Trigger>
				<Tabs.Trigger value="metrics" variant="segmented">
					<ChartLine class="size-4" aria-hidden="true" />
					{t('overview.tab_metrics')}
				</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>
</div>
