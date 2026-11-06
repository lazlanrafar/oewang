<script lang="ts" module>
	import type { TranslationKey } from '$lib/i18n';

	/**
	 * The list pages that have a skeleton, by SvelteKit route id, and what
	 * stands above each one's table: the summary cards' labels, and how many
	 * controls sit right of the filter bar, by width.
	 */
	const PAGES = {
		'/(dashboard)/transactions': { cards: [], actions: ['w-32', 'w-56', 'w-9'] },
		'/(dashboard)/accounts': {
			cards: ['accounts.total_balance', 'accounts.count', 'accounts.counted'],
			actions: ['w-32']
		},
		'/(dashboard)/budget': {
			cards: ['budget.total_budgeted', 'budget.total_spent', 'budget.overall_usage'],
			actions: ['w-44', 'w-32']
		},
		'/(dashboard)/database/items': { cards: [], actions: [] },
		'/(dashboard)/database/rates': { cards: [], actions: ['w-40'] }
	} satisfies Record<string, { cards: TranslationKey[]; actions: string[] }>;

	export type SkeletonRoute = keyof typeof PAGES;

	export function hasPageSkeleton(routeId: string | null | undefined): routeId is SkeletonRoute {
		return routeId !== null && routeId !== undefined && routeId in PAGES;
	}
</script>

<script lang="ts">
	/**
	 * A list page that is on its way, drawn by the dashboard layout while the
	 * navigation into it loads (D108).
	 *
	 * The page's own load blocks, so its component cannot draw anything until
	 * the data is there; without this the previous page would sit on screen,
	 * looking current, until the new one replaced it. The old app showed the
	 * page frame with its table skeleton at once, and this is that frame:
	 * the summary cards with their labels and no figures, the filter line as
	 * blocks, and the page's real table component with no rows and
	 * `loading` on, so the header, the widths and the cell shapes are the
	 * ones that replace it.
	 */
	import { Skeleton } from '../../atoms/skeleton/index.js';
	import { PageCard } from '../../molecules/page-card/index.js';
	import { t } from '$lib/i18n';
	import { cn } from '$lib/utils';

	import { AccountsDataTable } from '../accounts/index.js';
	import { BudgetsDataTable } from '../budgets/index.js';
	import { DatabaseItemsDataTable, DatabaseRatesDataTable } from '../database/index.js';
	import { TransactionsDataTable } from '../transactions/index.js';

	let { route }: { route: SkeletonRoute } = $props();

	const spec = $derived(PAGES[route]);
	const unsorted = { key: null, descending: false };
	const ignore = () => {};
</script>

<div class="flex min-h-0 flex-1 flex-col gap-4" aria-busy="true">
	{#if spec.cards.length > 0}
		<div class="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3">
			{#each spec.cards as label (label)}
				<PageCard label={t(label)} value="" loading />
			{/each}
		</div>
	{/if}

	<div class="flex shrink-0 items-center justify-between gap-4">
		<Skeleton class="h-9 flex-1" />
		{#each spec.actions as width, index (index)}
			<Skeleton class={cn('h-9 shrink-0', width)} />
		{/each}
	</div>

	{#if route === '/(dashboard)/transactions'}
		<TransactionsDataTable class="min-h-0 flex-1" loading rows={[]} categories={[]} wallets={[]} />
	{:else if route === '/(dashboard)/accounts'}
		<AccountsDataTable
			class="min-h-0 flex-1"
			loading
			accounts={[]}
			groups={[]}
			emptyTitle=""
			emptyDescription=""
		/>
	{:else if route === '/(dashboard)/budget'}
		<BudgetsDataTable
			class="min-h-0 flex-1"
			loading
			budgets={[]}
			currency=""
			sort={unsorted}
			onSortChange={ignore}
		/>
	{:else if route === '/(dashboard)/database/items'}
		<DatabaseItemsDataTable
			class="min-h-0 flex-1"
			loading
			items={[]}
			sort={unsorted}
			onSortChange={ignore}
		/>
	{:else if route === '/(dashboard)/database/rates'}
		<DatabaseRatesDataTable
			class="min-h-0 flex-1"
			loading
			rates={[]}
			home=""
			sort={unsorted}
			onSortChange={ignore}
		/>
	{/if}
</div>
