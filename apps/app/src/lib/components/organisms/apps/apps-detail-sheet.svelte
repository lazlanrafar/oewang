<script lang="ts">
	/**
	 * An app's details, as the old app's sheet shows them: a hero with the
	 * mark, the name with its state and the action beside it, then "How it
	 * works". Follows the detail-sheet contract
	 * (docs/best-practices/svelte-app.md#sheets).
	 */
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Button } from '$lib/components/atoms/button';
	import type { AppDefinition } from '$lib/apps';
	import { t } from '$lib/i18n';

	import AppsLogo from './apps-logo.svelte';

	let {
		open = $bindable(false),
		app,
		installed,
		available = true,
		busy = false,
		onOpenChange,
		onConnect,
		onDisconnect
	}: {
		open?: boolean;
		app: AppDefinition | null;
		installed: boolean;
		available?: boolean;
		busy?: boolean;
		onOpenChange?: (open: boolean) => void;
		onConnect: () => void;
		onDisconnect: () => void;
	} = $props();
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		{#if app}
			<div
				class="bg-muted/5 flex h-40 shrink-0 items-center justify-center border-b [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:12px_12px]"
			>
				<AppsLogo id={app.id} size="lg" />
			</div>

			<div class="flex shrink-0 flex-row items-center justify-between border-b px-6 py-6">
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2">
						<Sheet.Title class="text-xl font-medium">{t(app.nameKey)}</Sheet.Title>
						{#if installed}
							<span class="bg-green size-1.5" aria-label={t('apps.installed')}></span>
						{/if}
					</div>
					<Sheet.Description class="text-subtle text-xs tracking-widest uppercase">
						{t(app.categoryKey)} · {t('apps.by_oewang')}
					</Sheet.Description>
				</div>

				{#if installed}
					<Button variant="destructive" size="sm" disabled={busy} onclick={onDisconnect}>
						{t('apps.disconnect')}
					</Button>
				{:else}
					<Button size="sm" disabled={!available || busy} onclick={onConnect}>{t('apps.connect')}</Button>
				{/if}
			</div>

			<div class="flex-1 space-y-6 overflow-y-auto px-6 py-6">
				<section class="space-y-3">
					<h3 class="text-sm font-medium">{t('apps.how_it_works')}</h3>
					{#each app.howKeys as key (key)}
						<p class="text-subtle text-sm">{t(key)}</p>
					{/each}
				</section>
				{#if !available}
					<p class="text-subtle text-xs">{t('apps.unavailable_hint')}</p>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
