<script lang="ts">
	/**
	 * The vault, as the old app's `vault-client.tsx` laid it out (D90).
	 *
	 * The header: title and description on the left; storage, search, the
	 * grid/list toggle and Upload on the right. Below it the files, fifteen at
	 * a time, more as the list scrolls. A drop anywhere on the page uploads.
	 *
	 * One change from the old page, asked for: a file opens in its own sheet
	 * rather than in a panel that took a third of the width. So the old right
	 * column is gone, its storage bar moved into the header, and nothing is
	 * selected on arrival, because a selection now opens something.
	 *
	 * The search, the view and the open file live in the URL (UI-8, D55). The
	 * pages loaded by scrolling do not: they are more of the same list.
	 */
	import Grid from '@lucide/svelte/icons/grid-2x2';
	import ListIcon from '@lucide/svelte/icons/list';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import UploadCloud from '@lucide/svelte/icons/cloud-upload';
	import { invalidate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { untrack } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { ScrollArea } from '$lib/components/atoms/scroll-area';
	import { FileCard } from '$lib/components/molecules/file-card';
	import { DataTableEmptyState } from '$lib/components/molecules/data-table';
	import {
		VaultFileSheet,
		VaultItemList,
		VaultSkeleton,
		VaultStorage
	} from '$lib/components/organisms/vault';
	import { INVALIDATION_KEYS } from '$lib/chat-invalidation';
	import {
		ACCEPTED_FILE_TYPES,
		VAULT_PAGE_SIZE,
		listVault,
		thumbnailSrc,
		uploadMany,
		type VaultListFile
	} from '$lib/files';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { readParam, readText, reloading, writeParams } from '$lib/url-state';

	let { data } = $props();

	const canEdit = $derived(data.me.role !== 'member');
	const view = $derived(readParam(page.url, 'view', ['grid', 'list'] as const, 'grid'));

	// ------------------------------------------------------------- search

	let search = $state('');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		search = readText(page.url, 'search');
	});

	function applySearch(next: string) {
		if (next === readText(page.url, 'search')) return;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => writeParams({ search: next || null }), 300);
	}

	// -------------------------------------------------------------- files

	/*
	 * The first page comes from the load, so it renders on the server; later
	 * ones are appended as the list scrolls. A new search starts over. A
	 * reload of the same search (after an upload, a rename, opening a file)
	 * refreshes the first page and keeps what was already scrolled in.
	 */
	let extra = $state<VaultListFile[]>([]);
	let loadedPages = $state(1);
	let morePages = $state<number | null>(null);
	let loadingMore = $state(false);

	// A different search is a different list.
	$effect(() => {
		void data.search;
		untrack(() => {
			extra = [];
			loadedPages = 1;
			morePages = null;
		});
	});

	const files = $derived.by(() => {
		const first = data.files as VaultListFile[];
		const seen = new Set(first.map((file) => file.id));
		return [...first, ...extra.filter((file) => !seen.has(file.id))];
	});
	const totalPages = $derived(morePages ?? data.totalPages);

	/** A search is on its way: show the old skeleton rather than stale rows. */
	const searching = $derived(reloading(['search']));

	async function loadMore() {
		if (loadingMore || loadedPages >= totalPages) return;
		loadingMore = true;
		try {
			const next = await listVault({
				search: data.search,
				page: loadedPages + 1,
				limit: VAULT_PAGE_SIZE
			});
			const seen = new Set(files.map((file) => file.id));
			extra = [...extra, ...next.files.filter((file) => !seen.has(file.id))];
			loadedPages += 1;
			morePages = next.total_pages;
		} finally {
			loadingMore = false;
		}
	}

	let sentinel = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{ threshold: 0.1 }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	});

	// ------------------------------------------------------------- upload

	let input = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);
	let dragDepth = 0;

	async function upload(list: FileList | File[] | null | undefined) {
		const chosen = Array.from(list ?? []);
		if (chosen.length === 0) return;

		const stored = await uploadMany(chosen, {
			loading: (message) => toast.loading(message),
			success: (message, id) => toast.success(message, { id }),
			error: (message, id) => toast.error(message, { id })
		});

		await invalidate(INVALIDATION_KEYS.vault);
		// The old page selected what was just uploaded; here that means
		// opening it, when there is exactly one.
		if (stored.length === 1) openFile(stored[0].id);
	}

	/** A receipt the reader has queued shows it on its tile (D95). */
	function receiptBadge(file: VaultListFile) {
		if (file.receipt_status === 'pending') {
			return {
				label: t('vault.receipt_pending'),
				hint: t('vault.receipt_pending_hint'),
				tone: 'pending' as const
			};
		}
		if (file.receipt_status === 'failed') {
			return {
				label: t('vault.receipt_failed'),
				hint: t('vault.receipt_failed_hint'),
				tone: 'failed' as const
			};
		}
		return undefined;
	}

	// --------------------------------------------------------- file sheet

	const fileParam = $derived(readText(page.url, 'file'));
	let sheetOpen = $state(false);

	$effect(() => {
		sheetOpen = fileParam !== '';
	});

	const openFile = (id: string) => writeParams({ file: id }, { push: true });
	const closeFile = () => writeParams({ file: null }, { push: true });

	async function refresh() {
		await invalidate(INVALIDATION_KEYS.vault);
	}

	async function deleted() {
		await closeFile();
		await refresh();
	}
</script>

<svelte:head><title>{pageTitle(t('vault.title'))}</title></svelte:head>

<input
	bind:this={input}
	type="file"
	multiple
	accept={ACCEPTED_FILE_TYPES.join(',')}
	class="hidden"
	onchange={(event) => {
		upload((event.currentTarget as HTMLInputElement).files);
		(event.currentTarget as HTMLInputElement).value = '';
	}}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative flex min-h-0 flex-1 flex-col gap-6 overflow-hidden"
	ondragenter={(event) => {
		if (!canEdit || !event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		dragDepth += 1;
		dragging = true;
	}}
	ondragover={(event) => {
		if (canEdit) event.preventDefault();
	}}
	ondragleave={() => {
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) dragging = false;
	}}
	ondrop={(event) => {
		event.preventDefault();
		dragDepth = 0;
		dragging = false;
		if (canEdit) upload(event.dataTransfer?.files);
	}}
>
	{#if dragging}
		<div
			class="fade-in zoom-in pointer-events-none absolute inset-0 z-50 flex animate-in flex-col items-center justify-center border-2 border-primary border-dashed bg-primary/10 backdrop-blur-sm transition-all duration-200"
		>
			<div class="mb-4 rounded-full bg-background p-6 shadow-xl">
				<UploadCloud class="h-12 w-12 animate-bounce text-primary" />
			</div>
			<p class="font-bold text-primary text-xl">{t('vault.drop_zone.title')}</p>
			<p class="mt-2 text-muted-foreground text-sm">{t('vault.drop_zone.description')}</p>
		</div>
	{/if}

	<div class="flex shrink-0 flex-col items-start justify-between gap-4 md:flex-row md:items-center">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-2xl tracking-tight">{t('vault.title')}</h1>
			</div>
			<p class="text-muted-foreground text-sm">{t('vault.description')}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if data.storage}
				<VaultStorage bytes={data.storage.bytes} files={data.storage.files} />
			{/if}
			<div class="relative">
				<Search
					class="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					placeholder={t('vault.search_placeholder')}
					aria-label={t('vault.search_placeholder')}
					class="h-9 w-[200px] pl-9 md:w-[250px]"
					bind:value={search}
					oninput={(event) => applySearch(event.currentTarget.value)}
				/>
			</div>
			<div class="flex h-9 items-center border p-1">
				<Button
					variant={view === 'list' ? 'secondary' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					aria-label={t('vault.view_list')}
					aria-pressed={view === 'list'}
					onclick={() => writeParams({ view: 'list' })}
				>
					<ListIcon class="h-4 w-4" />
				</Button>
				<Button
					variant={view === 'grid' ? 'secondary' : 'ghost'}
					size="icon"
					class="h-7 w-7"
					aria-label={t('vault.view_grid')}
					aria-pressed={view === 'grid'}
					onclick={() => writeParams({ view: null })}
				>
					<Grid class="h-4 w-4" />
				</Button>
			</div>
			{#if canEdit}
				<Button size="sm" onclick={() => input?.click()}>
					<Plus class="h-4 w-4" />
					{t('vault.upload_button')}
				</Button>
			{/if}
		</div>
	</div>

	<ScrollArea class="h-full min-h-0 flex-1 border bg-card/10">
		<div class="p-4">
			{#if searching}
				<VaultSkeleton {view} />
			{:else if files.length === 0}
				{#if data.search}
					<DataTableEmptyState
						title={t('vault.empty.title')}
						description={t('vault.empty.no_results', { search: data.search })}
						actionLabel={t('vault.empty.clear_search')}
						onAction={() => writeParams({ search: null })}
					/>
				{:else}
					<DataTableEmptyState
						title={t('vault.empty.title')}
						description={t('vault.empty.get_started')}
						actionLabel={canEdit ? t('vault.empty.action') : undefined}
						onAction={canEdit ? () => input?.click() : undefined}
					/>
				{/if}
			{:else if view === 'list'}
				<VaultItemList {files} selectedId={fileParam} onselect={(file) => openFile(file.id)} />
			{:else}
				<div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
					{#each files as file (file.id)}
						<FileCard
							{file}
							thumbnail={thumbnailSrc}
							selected={fileParam === file.id}
							label={file.name}
							badge={receiptBadge(file)}
							onselect={() => openFile(file.id)}
						/>
					{/each}
				</div>
			{/if}

			<div bind:this={sentinel} class="mt-4 flex h-10 items-center justify-center">
				{#if loadingMore}
					<div class="flex items-center gap-2 text-muted-foreground text-xs">
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
						></div>
						{t('vault.loading_more')}
					</div>
				{/if}
			</div>
		</div>
	</ScrollArea>
</div>

<VaultFileSheet
	bind:open={sheetOpen}
	onOpenChange={(open) => {
		// Not while a link out of the sheet is navigating away: writing the
		// URL then would pull the user back to this page.
		if (!open && fileParam !== '' && !navigating.to) closeFile();
	}}
	file={data.file}
	{canEdit}
	onChanged={refresh}
	onDeleted={deleted}
/>
