<script lang="ts">
	/**
	 * The transactions behind an analysis, as a short table.
	 *
	 * Ten rows at most, fixed by the API, so this is a plain table rather
	 * than the data table: nothing here pages, sorts or filters. A name opens
	 * the transaction on its own page, the same target an entity link has.
	 */
	import * as Table from '../../../atoms/table/index.js';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { ReportRow } from '$lib/reports';

	let { rows, currency }: { rows: ReportRow[]; currency: string } = $props();

	const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

	function dateLabel(value: string): string {
		const [year, month, date] = value.split('-').map(Number);
		return day.format(new Date(year, month - 1, date));
	}
</script>

<Table.Root density="compact">
	<Table.Header>
		<Table.Row>
			<Table.Head>{t('canvas.column_date')}</Table.Head>
			<Table.Head>{t('canvas.column_description')}</Table.Head>
			<Table.Head>{t('canvas.column_category')}</Table.Head>
			<Table.Head class="text-right">{t('canvas.column_amount')}</Table.Head>
			<Table.Head class="text-right">{t('canvas.column_share')}</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each rows as row (row.id)}
			<Table.Row>
				<Table.Cell class="whitespace-nowrap">{dateLabel(row.date)}</Table.Cell>
				<Table.Cell class="max-w-40 truncate">
					<a href="/transactions?detail={row.id}" class="hover:underline">
						{row.name ?? t('canvas.untitled')}
					</a>
				</Table.Cell>
				<Table.Cell class="max-w-32 truncate">
					{row.category_name ?? t('canvas.uncategorized')}
				</Table.Cell>
				<Table.Cell class="text-right font-mono whitespace-nowrap">{formatMoney(row.amount, currency)}</Table.Cell>
				<Table.Cell class="text-right">{row.share_formatted ?? ''}</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
