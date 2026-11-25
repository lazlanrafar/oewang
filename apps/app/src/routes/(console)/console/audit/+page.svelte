<script lang="ts">
	/**
	 * The operator audit (CSL-12, US-085), the standard list screen (D81)
	 * with nothing to filter: the table, newest first, more as it scrolls.
	 * A row opens its before-and-after sheet, addressed by `?entry=`.
	 *
	 * shortcut: the sheet reads its entry from the rows already loaded, since
	 * the API has no single audit read; a link to an entry past the loaded
	 * pages opens nothing. Add `GET /v1/console/audit/{id}` if anything links
	 * to an entry.
	 */
	import { untrack } from 'svelte';

	import { navigating, page } from '$app/state';

	import { ConsoleAuditDataTable, ConsoleAuditSheet } from '$lib/components/organisms/console';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { ConsoleAuditEntry } from '$lib/server/console';
	import { readText, writeParams } from '$lib/url-state';

	let { data } = $props();

	// The open entry is not part of what the rows answer, so it stays out of the key.
	const loaded = $derived({ rows: data.entries, page: data.meta.page ?? 1, key: '' });
	const held = pagedRows<ConsoleAuditEntry>(untrack(() => loaded));
	$effect(() => {
		const next = loaded;
		untrack(() => held.update(next));
	});
	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	const openId = $derived(readText(page.url, 'entry'));
	const openEntry = $derived(openId ? (held.rows.find((entry) => entry.id === openId) ?? null) : null);
	const openRow = (entry: ConsoleAuditEntry) => writeParams({ entry: entry.id }, { push: true });
	const closeRow = () => writeParams({ entry: null }, { push: true });
</script>

<svelte:head><title>{pageTitle(t('console.nav_audit'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_audit')}</h1>

	<ConsoleAuditDataTable
		class="min-h-0 flex-1"
		entries={held.rows}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		onOpenRow={openRow}
	/>
</div>

<ConsoleAuditSheet
	open={openEntry !== null}
	onOpenChange={(open) => {
		if (!open) closeRow();
	}}
	entry={openEntry}
/>
