<script lang="ts">
	/**
	 * Usage (CSL-10, US-084): one month's AI tokens and calls across oewang,
	 * then by workspace, by model and by feature, laid out as the app's own
	 * overview: the heading with its controls, the cards, then the tables.
	 * Tokens are counts, never money. The app has no month picker, so the
	 * month steps back and forward from the one shown; the URL carries it.
	 */
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	import { goto } from '$app/navigation';

	import { Button } from '$lib/components/atoms/button';
	import { StatCard } from '$lib/components/molecules/stat-card';
	import { ConsolePageHeader, ConsoleUsageDataTable } from '$lib/components/organisms/console';
	import { currentMonthUtc, formatCount, formatMonth, shiftMonth } from '$lib/console';
	import { t, type TranslationKey } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { writeParams } from '$lib/url-state';

	let { data } = $props();

	const usage = $derived(data.usage);
	const isCurrent = $derived(usage.month >= currentMonthUtc());

	const counted = (value: number) => ({ value: String(value), format: (v: string) => formatCount(Number(v)) });

	/** The member's usage page names the features the same way. */
	const FEATURE_LABELS: Record<string, TranslationKey> = {
		chat: 'settings.usage_feature_chat',
		telegram: 'settings.usage_feature_telegram',
		receipt: 'settings.usage_feature_receipt',
		categorize: 'settings.usage_feature_categorize',
		import: 'settings.usage_feature_import',
		columns: 'settings.usage_feature_columns'
	};
	const featureLabel = (feature: string) => (FEATURE_LABELS[feature] ? t(FEATURE_LABELS[feature]) : feature);

	const byWorkspace = $derived(
		usage.by_workspace.map((row) => ({ ...row, id: row.workspace_id, name: row.workspace_name }))
	);
	const byModel = $derived(
		usage.by_model.map((row) => ({
			...row,
			id: row.model ?? '',
			name: row.model ?? t('console.usage.unknown_model')
		}))
	);
	const byFeature = $derived(usage.by_feature.map((row) => ({ ...row, id: row.feature, name: featureLabel(row.feature) })));

	const step = (by: number) => writeParams({ month: shiftMonth(usage.month, by) }, { push: true });
</script>

<svelte:head><title>{pageTitle(t('console.nav_usage'))}</title></svelte:head>

<div class="flex w-full flex-1 flex-col gap-6">
	<ConsolePageHeader title={t('console.nav_usage')} description={t('console.usage.description')}>
		{#snippet controls()}
			<Button variant="outline" size="icon" aria-label={t('console.usage.previous_month')} onclick={() => step(-1)}>
				<ChevronLeft />
			</Button>
			<span class="min-w-40 text-center text-sm font-medium tabular-nums">{formatMonth(usage.month)}</span>
			<Button
				variant="outline"
				size="icon"
				aria-label={t('console.usage.next_month')}
				disabled={isCurrent}
				onclick={() => step(1)}
			>
				<ChevronRight />
			</Button>
		{/snippet}
	</ConsolePageHeader>

	<div class="grid gap-4 sm:grid-cols-2">
		<StatCard
			label={t('console.usage.tokens')}
			value={counted(usage.totals.input + usage.totals.output)}
			hint={t('console.usage.tokens_detail', {
				input: formatCount(usage.totals.input),
				output: formatCount(usage.totals.output)
			})}
		/>
		<StatCard label={t('console.usage.calls')} value={counted(usage.totals.calls)} />
	</div>

	{#if usage.totals.calls === 0}
		<p class="text-subtle text-xs">{t('console.usage.empty')}</p>
	{:else}
		<section class="flex flex-col gap-3">
			<div class="flex items-baseline justify-between gap-4">
				<h2 class="font-serif text-[18px] font-normal">{t('console.usage.by_workspace')}</h2>
				<p class="text-subtle text-xs">{t('console.usage.by_workspace_hint')}</p>
			</div>
			<ConsoleUsageDataTable
				dimension="workspace"
				rows={byWorkspace}
				label={t('console.usage.columns.workspace')}
				onOpenRow={(row) => goto(`/console/workspaces?workspace=${encodeURIComponent(row.id)}`)}
				class="max-h-[30rem]"
			/>
		</section>

		<div class="grid gap-8 xl:grid-cols-2">
			<section class="flex min-w-0 flex-col gap-3">
				<h2 class="font-serif text-[18px] font-normal">{t('console.usage.by_model')}</h2>
				<ConsoleUsageDataTable dimension="model" rows={byModel} label={t('console.usage.columns.model')} class="max-h-[24rem]" />
			</section>
			<section class="flex min-w-0 flex-col gap-3">
				<h2 class="font-serif text-[18px] font-normal">{t('console.usage.by_feature')}</h2>
				<ConsoleUsageDataTable dimension="feature" rows={byFeature} label={t('console.usage.columns.feature')} class="max-h-[24rem]" />
			</section>
		</div>
	{/if}
</div>
