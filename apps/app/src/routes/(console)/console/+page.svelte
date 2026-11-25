<script lang="ts">
	/**
	 * The console's overview (CSL-9, US-084): four figures and the sign-ups
	 * of the last twelve weeks, as hatched columns (D93). Counts only, never
	 * anyone's money (CSL-13), so the figures are plain numbers.
	 */
	import { ChartBar, ChartPanel } from '$lib/components/molecules/chart';
	import { StatCard } from '$lib/components/molecules/stat-card';
	import { ConsolePageHeader } from '$lib/components/organisms/console';
	import { formatCount, formatShortDay } from '$lib/console';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';

	let { data } = $props();

	const overview = $derived(data.overview);

	/** A figure counts up as it arrives (D108); a count, not money. */
	const counted = (value: number) => ({ value: String(value), format: (v: string) => formatCount(Number(v)) });

	const signups = $derived(
		overview.signups_by_week.map((week) => ({
			label: formatShortDay(week.week_start),
			value: week.count,
			formatted: formatCount(week.count)
		}))
	);
	const anySignups = $derived(overview.signups_by_week.some((week) => week.count > 0));
</script>

<svelte:head><title>{pageTitle(t('console.nav_overview'))}</title></svelte:head>

<div class="flex w-full flex-1 flex-col gap-6">
	<ConsolePageHeader title={t('console.nav_overview')} description={t('console.overview.description')} />

	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<StatCard
			label={t('console.overview.users')}
			value={counted(overview.users.total)}
			hint={t('console.overview.users_new', { count: formatCount(overview.users.new_7d) })}
		/>
		<StatCard
			label={t('console.overview.workspaces')}
			value={counted(overview.workspaces.total)}
			hint={t('console.overview.workspaces_detail', {
				active: formatCount(overview.workspaces.active),
				suspended: formatCount(overview.workspaces.suspended),
				deleted: formatCount(overview.workspaces.deleted)
			})}
		/>
		<StatCard
			label={t('console.overview.feedback_open')}
			value={counted(overview.feedback_open)}
			hint={t('console.overview.feedback_open_hint')}
		/>
		<StatCard
			label={t('console.overview.tokens_month')}
			value={counted(overview.tokens_month.input + overview.tokens_month.output)}
			hint={t('console.overview.tokens_detail', {
				input: formatCount(overview.tokens_month.input),
				output: formatCount(overview.tokens_month.output)
			})}
		/>
	</div>

	<ChartPanel title={t('console.overview.signups_chart')} empty={anySignups ? null : t('console.overview.signups_empty')}>
		<ChartBar items={signups} label={t('console.overview.signups_series')} />
	</ChartPanel>
</div>
