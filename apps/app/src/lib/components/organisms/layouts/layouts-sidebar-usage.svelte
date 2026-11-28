<script lang="ts" module>
	/**
	 * The figures the sidebar shows, and the plan they are measured against
	 * (D128). A null limit is unlimited. The settings page has the breakdown.
	 */
	export type SidebarUsage = {
		tokens: number;
		bytes: number;
		files: number;
		plan: {
			name: string;
			max_tokens_month: number | null;
			max_storage_bytes: number | null;
			features: string[];
		};
	};
</script>

<script lang="ts">
	/**
	 * Usage at the foot of the sidebar, laid out as the old app's `NavUsage`:
	 * a muted caps label with the percentage at the right, the figure over
	 * the plan's limit, and a thin bar. An unlimited figure stands alone,
	 * with no bar and no percentage, since there is nothing to fill. It
	 * opens the usage page, which breaks both figures down.
	 */
	import { Progress } from '$lib/components/atoms/progress';
	import { formatBytes } from '$lib/files';
	import { t } from '$lib/i18n';
	import { limitPercent } from '$lib/plans';

	let { usage, onNavigate }: { usage: SidebarUsage; onNavigate?: () => void } = $props();

	// Counts of tokens, not money, so a number is the right type. Compact
	// ("153.3K", "1.2M") because the sidebar is narrow; the settings page
	// keeps the exact figure.
	const numbers = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

	/** "used / limit", or the used figure alone when there is no limit. */
	const ofLimit = (used: string, limit: string | null) =>
		limit === null ? used : t('settings.usage_of_reference', { used, reference: limit });

	const rows = $derived.by(() => {
		const tokenLimit = usage.plan.max_tokens_month;
		const storageLimit = usage.plan.max_storage_bytes;
		return [
			{
				label: t('settings.usage_tokens_month'),
				figure: ofLimit(numbers.format(usage.tokens), tokenLimit === null ? null : numbers.format(tokenLimit)),
				percent: limitPercent(usage.tokens, tokenLimit)
			},
			{
				label: t('settings.usage_storage'),
				figure: `${ofLimit(formatBytes(usage.bytes), storageLimit === null ? null : formatBytes(storageLimit))} · ${t('vault.storage.files', { count: usage.files })}`,
				percent: limitPercent(usage.bytes, storageLimit)
			}
		];
	});
</script>

<a
	href="/settings/usage"
	onclick={onNavigate}
	class="hover:bg-sidebar-accent/50 flex flex-col gap-4 border-t px-4 py-4 transition-colors"
>
	{#each rows as row (row.label)}
		<span class="flex flex-col gap-2">
			<span class="flex items-start justify-between gap-2">
				<span class="grid min-w-0">
					<span class="text-caption text-subtle truncate leading-none font-medium tracking-wider uppercase">
						{row.label}
					</span>
					<span class="text-caption text-subtle mt-1 truncate leading-none tabular-nums">{row.figure}</span>
				</span>
				{#if row.percent !== null}
					<span class="text-caption text-subtle shrink-0 leading-none font-medium tabular-nums">
						{Math.round(row.percent)}%
					</span>
				{/if}
			</span>
			{#if row.percent !== null}
				<Progress value={Math.min(row.percent, 100)} class="h-1" aria-label={row.label} />
			{/if}
		</span>
	{/each}
</a>
