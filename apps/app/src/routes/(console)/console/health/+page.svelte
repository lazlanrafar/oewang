<script lang="ts">
	/**
	 * Health (CSL-11, US-084): the receipt queue, fourteen days of AI calls
	 * as hatched columns (D93), and links out to Sentry and Coolify when
	 * the deployment names them.
	 */
	import ExternalLink from '@lucide/svelte/icons/external-link';

	import { Button } from '$lib/components/atoms/button';
	import { ChartBar, ChartPanel } from '$lib/components/molecules/chart';
	import { StatCard } from '$lib/components/molecules/stat-card';
	import { ConsolePageHeader } from '$lib/components/organisms/console';
	import { formatCount, formatShortDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	let { data } = $props();

	const jobs = $derived(data.health.receipt_jobs);

	const counted = (value: number) => ({ value: String(value), format: (v: string) => formatCount(Number(v)) });

	const calls = $derived(
		data.health.ai_calls_by_day.map((day) => ({
			label: formatShortDay(day.day),
			value: day.calls,
			formatted: formatCount(day.calls)
		}))
	);
	const anyCalls = $derived(data.health.ai_calls_by_day.some((day) => day.calls > 0));

	const links = $derived(
		[
			{ label: t('console.health.sentry'), href: data.links.sentry },
			{ label: t('console.health.coolify'), href: data.links.coolify }
		].filter((link): link is { label: string; href: string } => link.href !== null)
	);
</script>

<svelte:head><title>{pageTitle(t('console.nav_health'))}</title></svelte:head>

<div class="flex w-full flex-1 flex-col gap-6">
	<ConsolePageHeader title={t('console.nav_health')} description={t('console.health.description')} />

	<div class="grid gap-4 sm:grid-cols-3">
		<StatCard label={t('console.health.receipts_pending')} value={counted(jobs.pending)} />
		<StatCard label={t('console.health.receipts_failed_24h')} value={counted(jobs.failed_24h)} />
		<StatCard label={t('console.health.receipts_failed_7d')} value={counted(jobs.failed_7d)} />
	</div>

	<ChartPanel title={t('console.health.ai_chart')} empty={anyCalls ? null : t('console.health.ai_empty')}>
		<ChartBar items={calls} label={t('console.health.ai_series')} />
	</ChartPanel>

	{#if links.length > 0}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium">{t('console.health.links')}</h2>
			<div class="flex flex-wrap gap-2">
				{#each links as link (link.href)}
					<Button variant="outline" href={link.href} target="_blank" rel="noopener noreferrer">
						{link.label}
						<ExternalLink />
					</Button>
				{/each}
			</div>
		</section>
	{/if}
</div>
