<script lang="ts" module>
	/** The figures the sidebar shows; the settings page has the breakdown. */
	export type SidebarUsage = { tokens: number; bytes: number; files: number };

	/*
	 * What a full bar stands for. Nothing is limited (D92): these are a
	 * yardstick for the bar, never enforced anywhere, and a month past one
	 * reads over 100% with the bar full.
	 * shortcut: fixed in the source, upgrade to a per-workspace figure from the API once a quota exists.
	 */
	const TOKEN_REFERENCE = 1_000_000;
	const STORAGE_REFERENCE_BYTES = 1024 * 1024 * 1024;
</script>

<script lang="ts">
	/**
	 * Usage at the foot of the sidebar, laid out as the old app's `NavUsage`:
	 * a muted caps label with the percentage at the right, the figure over
	 * its reference, and a thin bar. The old one measured against a plan's
	 * quota; there is none, so the reference above stands in for it. It
	 * opens the usage page, which breaks both figures down.
	 */
	import { Progress } from '$lib/components/atoms/progress';
	import { formatBytes } from '$lib/files';
	import { t } from '$lib/i18n';

	let { usage, onNavigate }: { usage: SidebarUsage; onNavigate?: () => void } = $props();

	// Counts of tokens, not money, so a number is the right type. Compact
	// ("153.3K", "1.2M") because the sidebar is narrow; the settings page
	// keeps the exact figure.
	const numbers = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

	const rows = $derived([
		{
			label: t('settings.usage_tokens_month'),
			figure: t('settings.usage_of_reference', {
				used: numbers.format(usage.tokens),
				reference: numbers.format(TOKEN_REFERENCE)
			}),
			percent: (usage.tokens / TOKEN_REFERENCE) * 100
		},
		{
			label: t('settings.usage_storage'),
			figure: `${t('settings.usage_of_reference', {
				used: formatBytes(usage.bytes),
				reference: formatBytes(STORAGE_REFERENCE_BYTES)
			})} · ${t('vault.storage.files', { count: usage.files })}`,
			percent: (usage.bytes / STORAGE_REFERENCE_BYTES) * 100
		}
	]);
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
				<span class="text-caption text-subtle shrink-0 leading-none font-medium tabular-nums">
					{Math.round(row.percent)}%
				</span>
			</span>
			<Progress value={Math.min(row.percent, 100)} class="h-1" aria-label={row.label} />
		</span>
	{/each}
</a>
