<script lang="ts">
	/** The old app's `VaultContentSkeleton`: 15 square tiles, or 12 rows. */
	import { Skeleton } from '../../atoms/skeleton/index.js';
	import { t } from '$lib/i18n';

	let { view }: { view: 'grid' | 'list' } = $props();
</script>

<div class="flex h-full flex-1 flex-col overflow-hidden" aria-busy="true">
	{#if view === 'grid'}
		<div class="grid h-full grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
			{#each Array.from({ length: 15 }, (_, index) => index) as index (index)}
				<Skeleton class="aspect-square bg-muted/50" />
			{/each}
		</div>
	{:else}
		<table class="w-full text-sm">
			<thead>
				<tr class="h-10 border-b font-medium text-muted-foreground text-xs uppercase">
					<th class="w-1/2 px-4 text-left font-medium">{t('vault.columns.filename')}</th>
					<th class="px-4 text-left font-medium">{t('vault.columns.format')}</th>
					<th class="px-4 text-right font-medium">{t('vault.columns.size')}</th>
					<th class="px-4 text-right font-medium">{t('vault.columns.date')}</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each Array.from({ length: 12 }, (_, index) => index) as index (index)}
					<tr class="h-14">
						<td class="px-4">
							<div class="flex items-center gap-3">
								<Skeleton class="h-10 w-10 shrink-0" />
								<Skeleton class="h-4 w-32" />
							</div>
						</td>
						<td class="px-4"><Skeleton class="h-4 w-24" /></td>
						<td class="px-4"><div class="flex justify-end"><Skeleton class="h-4 w-16" /></div></td>
						<td class="px-4"><div class="flex justify-end"><Skeleton class="h-4 w-20" /></div></td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>
