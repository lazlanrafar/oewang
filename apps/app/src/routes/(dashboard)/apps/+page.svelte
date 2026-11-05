<script lang="ts">
	/**
	 * Apps, as the old app's Apps page: a search box and an All/Connected
	 * toggle on one line, then a grid of cards. Telegram is the only app
	 * (D83).
	 *
	 * The search, the toggle and the open details sheet are in the URL
	 * (UI-8, D55). The connect dialog is not: what it shows is a one-time
	 * token, and a token in an address bar ends up in history and in logs.
	 */
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';

	import { Input } from '$lib/components/atoms/input';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { DataTableEmptyState } from '$lib/components/molecules/data-table';
	import { FormError } from '$lib/components/molecules/form-error';
	import {
		AppsCard,
		AppsDetailSheet,
		AppsTelegramConnectDialog
	} from '$lib/components/organisms/apps';
	import { APPS, type AppDefinition } from '$lib/apps';
	import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { readParam, readText, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const FILTERS = ['all', 'connected'] as const;
	const filter = $derived(readParam(page.url, 'filter', FILTERS, 'all'));
	const openApp = $derived(APPS.find((app) => app.id === page.url.searchParams.get('app')) ?? null);

	let search = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		search = readText(page.url, 'search');
	});

	function applySearch(next: string) {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => writeParams({ search: next }), 300);
	}

	const installed = (app: AppDefinition) => app.id === 'telegram' && data.telegram.linked;
	const available = (app: AppDefinition) => app.id !== 'telegram' || data.telegram.enabled;

	const query = $derived(readText(page.url, 'search').trim().toLowerCase());
	const visible = $derived(
		APPS.filter((app) => (filter === 'connected' ? installed(app) : true)).filter(
			(app) => !query || t(app.nameKey).toLowerCase().includes(query)
		)
	);

	// ------------------------------------------------------------ connect

	let connectForm = $state<HTMLFormElement | null>(null);
	let disconnectForm = $state<HTMLFormElement | null>(null);
	let busy = $state(false);
	let link = $state<{ deepLink: string; qrSvg: string } | null>(null);
	let dialogOpen = $state(false);
	let confirmOpen = $state(false);

	/*
	 * While the dialog is open, ask every two seconds whether `/start` has
	 * landed, as the old dialog polled. Telegram reaches the API, not this
	 * page, so asking is the only way to know.
	 */
	let poll: ReturnType<typeof setInterval> | undefined;
	$effect(() => {
		if (!dialogOpen) return;
		poll = setInterval(() => invalidate(INVALIDATION_KEYS.integrations), 2000);
		return () => clearInterval(poll);
	});
	onDestroy(() => clearInterval(poll));

	$effect(() => {
		if (dialogOpen && data.telegram.linked) {
			dialogOpen = false;
			link = null;
			toast.success(t('apps.telegram_connected'));
		}
	});
</script>

<svelte:head><title>{t('nav.apps')} · {t('app.name')}</title></svelte:head>

<div class="flex flex-col gap-8">
	<h1 class="sr-only">{t('nav.apps')}</h1>

	<div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
		<Input
			class="w-full sm:max-w-[280px]"
			placeholder={t('apps.search_placeholder')}
			aria-label={t('apps.search_placeholder')}
			bind:value={search}
			oninput={(event) => applySearch(event.currentTarget.value)}
		/>
		<Tabs.Root value={filter} onValueChange={(next) => writeParams({ filter: next === 'all' ? null : next })}>
			<Tabs.List variant="segmented">
				<Tabs.Trigger value="all" variant="segmented">{t('apps.filter_all')}</Tabs.Trigger>
				<Tabs.Trigger value="connected" variant="segmented">{t('apps.filter_connected')}</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	{#if visible.length === 0}
		{#if query}
			<DataTableEmptyState
				title={t('apps.empty_matching_title')}
				description={t('apps.empty_matching_description', { search: readText(page.url, 'search') })}
				actionLabel={t('apps.clear_search')}
				onAction={() => writeParams({ search: null })}
			/>
		{:else}
			<DataTableEmptyState
				title={t('apps.empty_connected_title')}
				description={t('apps.empty_connected_description')}
				actionLabel={t('apps.filter_all')}
				onAction={() => writeParams({ filter: null })}
			/>
		{/if}
	{:else}
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
			{#each visible as app (app.id)}
				<AppsCard
					{app}
					installed={installed(app)}
					available={available(app)}
					{busy}
					onDetails={() => writeParams({ app: app.id }, { push: true })}
					onConnect={() => connectForm?.requestSubmit()}
					onDisconnect={() => (confirmOpen = true)}
				/>
			{/each}
		</div>
	{/if}
</div>

<AppsDetailSheet
	open={openApp !== null}
	app={openApp}
	installed={openApp ? installed(openApp) : false}
	available={openApp ? available(openApp) : true}
	{busy}
	onOpenChange={(open) => {
		if (!open) writeParams({ app: null });
	}}
	onConnect={() => connectForm?.requestSubmit()}
	onDisconnect={() => (confirmOpen = true)}
/>

{#if link}
	<AppsTelegramConnectDialog bind:open={dialogOpen} deepLink={link.deepLink} qrSvg={link.qrSvg} />
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={t('apps.disconnect_title', { name: t('apps.telegram_name') })}
	description={t('apps.disconnect_description')}
	confirmLabel={t('apps.disconnect')}
	cancelLabel={t('common.cancel')}
	onConfirm={() => disconnectForm?.requestSubmit()}
/>

<form
	bind:this={connectForm}
	method="POST"
	action="?/connect"
	class="hidden"
	use:enhance={() => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'success' && result.data?.link) {
				link = result.data.link as { deepLink: string; qrSvg: string };
				dialogOpen = true;
				return;
			}
			await update();
		};
	}}
></form>

<form
	bind:this={disconnectForm}
	method="POST"
	action="?/disconnect"
	class="hidden"
	use:enhance={() => {
		busy = true;
		return async ({ result, update }) => {
			busy = false;
			await update();
			if (result.type === 'success') toast.success(t('apps.telegram_disconnected'));
		};
	}}
></form>
