<script lang="ts" module>
	/** The figures the sidebar shows; the settings page has the breakdown. */
	export type SidebarUsage = { tokens: number; bytes: number; files: number };
</script>

<script lang="ts">
	/**
	 * Usage at the foot of the sidebar, set like the old app's `NavUsage`:
	 * a muted caps label over the figure. Its progress bars and percentages
	 * are not here, because they measured use against a plan's quota and
	 * nothing is limited (D92). It opens the usage page, which breaks both
	 * figures down.
	 */
	import { formatBytes } from '$lib/files';
	import { t } from '$lib/i18n';

	let { usage, onNavigate }: { usage: SidebarUsage; onNavigate?: () => void } = $props();

	// Counts of tokens and bytes, not money, so a number is the right type.
	const numbers = new Intl.NumberFormat();
</script>

<a
	href="/settings/usage"
	onclick={onNavigate}
	class="hover:bg-sidebar-accent/50 flex flex-col gap-3 border-t px-4 py-3 transition-colors"
>
	<span class="grid">
		<span class="text-caption text-subtle leading-none font-medium tracking-wider uppercase">
			{t('settings.usage_tokens_month')}
		</span>
		<span class="text-small mt-1 leading-tight tabular-nums">{numbers.format(usage.tokens)}</span>
	</span>
	<span class="grid">
		<span class="text-caption text-subtle leading-none font-medium tracking-wider uppercase">
			{t('settings.usage_storage')}
		</span>
		<span class="text-small mt-1 leading-tight tabular-nums">
			{formatBytes(usage.bytes)}
			<span class="text-subtle">· {t('settings.usage_storage_detail', { count: usage.files })}</span>
		</span>
	</span>
</a>
