<script lang="ts">
	/**
	 * The four counts above the contact table, the old page's cards: every
	 * contact, those added this month (green when any), with an email, with
	 * a phone (CON-2). Counts of people, not money, so the page works them
	 * out from the list it already holds.
	 */
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	import { PageCard } from '../../molecules/page-card/index.js';

	let {
		counts,
		loading = false,
		class: className
	}: {
		counts: { total: number; addedThisMonth: number; withEmail: number; withPhone: number };
		loading?: boolean;
		class?: string;
	} = $props();
</script>

<div class={cn('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4', className)}>
	<PageCard label={t('contacts.summary.total')} value={String(counts.total)} {loading} />
	<PageCard
		label={t('contacts.summary.added_this_month')}
		value={String(counts.addedThisMonth)}
		tone={counts.addedThisMonth > 0 ? 'positive' : 'default'}
		{loading}
	/>
	<PageCard label={t('contacts.summary.with_email')} value={String(counts.withEmail)} {loading} />
	<PageCard label={t('contacts.summary.with_phone')} value={String(counts.withPhone)} {loading} />
</div>
