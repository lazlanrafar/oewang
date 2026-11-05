<script lang="ts">
	/**
	 * Storage used, the old app's `HeaderStorageUsage`.
	 *
	 * The old bar measured against a plan's quota. There is no quota here
	 * (D92), so the bar is a full-width rule and the figure beside it is the
	 * file count rather than a percentage.
	 */
	import { Progress } from '../../atoms/progress/index.js';
	import { formatBytes } from '$lib/files.js';
	import { t } from '$lib/i18n';

	let { bytes, files }: { bytes: number; files: number } = $props();
</script>

<div class="flex min-w-[120px] flex-col gap-1" title={t('vault.storage.title')}>
	<div class="flex items-center justify-between gap-3 text-[10px]">
		<span class="text-muted-foreground">{t('vault.storage.usage', { used: formatBytes(bytes) })}</span>
		<span class="font-bold text-primary">{t('vault.storage.files', { count: files })}</span>
	</div>
	<Progress value={100} class="h-1 w-full" aria-label={t('vault.storage.title')} />
</div>
