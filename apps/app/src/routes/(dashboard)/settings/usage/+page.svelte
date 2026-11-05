<script lang="ts">
	/**
	 * Usage (D92): stored bytes and AI tokens, by feature. No limit and no
	 * plan, so there is no percentage and nothing to upgrade; this is the
	 * record a limit would one day read.
	 */
	import { StatCard } from '$lib/components/molecules/stat-card';
	import * as Table from '$lib/components/atoms/table';
	import { SettingsSectionHeader } from '$lib/components/organisms/settings';
	import { formatBytes } from '$lib/files';
	import { t, type TranslationKey } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const numbers = new Intl.NumberFormat();
	const count = (value: number) => numbers.format(value);

	const FEATURE_LABELS: Record<string, TranslationKey> = {
		chat: 'settings.usage_feature_chat',
		telegram: 'settings.usage_feature_telegram',
		receipt: 'settings.usage_feature_receipt',
		categorize: 'settings.usage_feature_categorize',
		import: 'settings.usage_feature_import',
		columns: 'settings.usage_feature_columns'
	};

	const featureLabel = (feature: string) =>
		FEATURE_LABELS[feature] ? t(FEATURE_LABELS[feature]) : feature;

	const tokens = (pair: { input: number; output: number }) =>
		t('settings.usage_tokens_detail', { input: count(pair.input), output: count(pair.output) });
</script>

<svelte:head>
	<title>{pageTitle(t('settings.usage_title'), t('settings.title'))}</title>
</svelte:head>

<div class="flex flex-col gap-6">
	<SettingsSectionHeader
		title={t('settings.usage_title')}
		description={t('settings.usage_description')}
	/>

	{#if data.usage}
		{@const usage = data.usage}
		<div class="grid gap-4 sm:grid-cols-3">
			<StatCard
				label={t('settings.usage_storage')}
				value={formatBytes(usage.storage.bytes)}
				hint={t('settings.usage_storage_detail', { count: count(usage.storage.files) })}
			/>
			<StatCard
				label={t('settings.usage_tokens_month')}
				value={count(usage.ai.month.input + usage.ai.month.output)}
				hint={tokens(usage.ai.month)}
			/>
			<StatCard
				label={t('settings.usage_tokens_total')}
				value={count(usage.ai.total.input + usage.ai.total.output)}
				hint={tokens(usage.ai.total)}
			/>
		</div>

		<div class="flex flex-col gap-3">
			<h2 class="text-sm font-medium">{t('settings.usage_by_feature')}</h2>
			{#if usage.ai.by_feature.length === 0}
				<p class="text-subtle text-xs">{t('settings.usage_empty')}</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{t('settings.usage_feature')}</Table.Head>
							<Table.Head class="text-right">{t('settings.usage_calls')}</Table.Head>
							<Table.Head class="text-right">{t('settings.usage_month')}</Table.Head>
							<Table.Head class="text-right">{t('settings.usage_total')}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each usage.ai.by_feature as row (row.feature)}
							<Table.Row>
								<Table.Cell>{featureLabel(row.feature)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{count(row.calls)}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{count(row.month.input + row.month.output)}
								</Table.Cell>
								<Table.Cell class="text-right tabular-nums">
									{count(row.total.input + row.total.output)}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>
	{:else}
		<p class="text-destructive text-small" role="alert">{t('errors.unexpected')}</p>
	{/if}
</div>
