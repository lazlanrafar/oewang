<script lang="ts">
	/**
	 * One app on the Apps page, as the old app's `AppsCard` lays it out: the
	 * mark and an "Installed" tag on the first row, the name, two lines of
	 * description, then Details beside the action.
	 *
	 * It holds no state and calls nothing (D5): the page decides what the
	 * buttons do.
	 */
	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import type { AppDefinition } from '$lib/apps';
	import { t } from '$lib/i18n';

	import AppsLogo from './apps-logo.svelte';

	let {
		app,
		installed,
		available = true,
		busy = false,
		onDetails,
		onConnect,
		onDisconnect
	}: {
		app: AppDefinition;
		installed: boolean;
		/** False when the server has no bot configured. */
		available?: boolean;
		busy?: boolean;
		onDetails: () => void;
		onConnect: () => void;
		onDisconnect: () => void;
	} = $props();
</script>

<article class="bg-background flex w-full flex-col border">
	<div class="flex h-16 items-center justify-between px-6 pt-6">
		<AppsLogo id={app.id} />
		{#if installed}
			<Badge variant="success">{t('apps.installed')}</Badge>
		{/if}
	</div>

	<div class="flex items-center gap-2 px-6 pt-4 pb-3">
		<h2 class="text-sm font-medium">{t(app.nameKey)}</h2>
		{#if !available}
			<Badge variant="secondary">{t('apps.unavailable')}</Badge>
		{/if}
	</div>

	<p class="text-subtle line-clamp-2 flex-1 px-6 pb-4 text-xs">{t(app.shortKey)}</p>

	<div class="mt-auto grid grid-cols-2 gap-2 px-6 pb-6">
		<Button variant="outline" onclick={onDetails}>{t('apps.details')}</Button>
		{#if installed}
			<Button variant="outline" disabled={busy} onclick={onDisconnect}>{t('apps.disconnect')}</Button>
		{:else}
			<Button variant="outline" disabled={!available || busy} onclick={onConnect}>
				{t('apps.connect')}
			</Button>
		{/if}
	</div>
</article>
