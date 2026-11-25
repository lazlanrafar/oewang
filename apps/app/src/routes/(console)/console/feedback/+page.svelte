<script lang="ts">
	/**
	 * The console's feedback inbox (CSL-8, US-083), the standard list screen
	 * (D81): the search and the status and type facets on the header line,
	 * the table below. A row opens its sheet, addressed by `?feedback=` and
	 * read on its own, so a link opens it and marking it done under an
	 * Open filter keeps it on screen.
	 */
	import { untrack } from 'svelte';

	import { enhance, type SubmitFunction } from '$app/forms';
	import { navigating } from '$app/state';

	import { toast } from 'svelte-sonner';

	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import { ConsoleFeedbackDataTable, ConsoleFeedbackSheet } from '$lib/components/organisms/console';
	import { toastRefusal } from '$lib/errors';
	import { filterBar } from '$lib/filter-bar.svelte';
	import { t } from '$lib/i18n';
	import { pageTitle } from '$lib/page-title';
	import { pagedRows } from '$lib/paged-rows.svelte';
	import type { ConsoleFeedback } from '$lib/server/console';
	import { reloading, writeParams } from '$lib/url-state';

	let { data, form } = $props();

	const loaded = $derived({ rows: data.feedback, page: data.meta.page ?? 1, key: data.filterKey });
	const held = pagedRows<ConsoleFeedback>(untrack(() => loaded));
	$effect(() => {
		const next = loaded;
		untrack(() => held.update(next));
	});
	const currentPage = $derived(data.meta.page ?? 1);
	const totalPages = $derived(data.meta.total_pages ?? 1);

	const bar = filterBar({ status: 'status', type: 'type' }, { resetPage: true });

	const STATUS_OPTIONS = [
		{ id: 'open', name: t('console.feedback.status_open') },
		{ id: 'done', name: t('console.feedback.status_done') }
	];
	const TYPE_OPTIONS = [
		{ id: 'bug', name: t('settings.feedback_type_bug') },
		{ id: 'feature', name: t('settings.feedback_type_feature') },
		{ id: 'other', name: t('settings.feedback_type_other') }
	];

	const openFeedback = (item: ConsoleFeedback) => writeParams({ feedback: item.id }, { push: true });
	const closeFeedback = () => writeParams({ feedback: null }, { push: true });

	const canWrite = $derived(data.operator.permissions.includes('console.feedback.write'));

	let saving = $state<'status' | 'note' | null>(null);
	const submitUpdate: SubmitFunction = ({ formData }) => {
		const status = formData.get('status');
		saving = status ? 'status' : 'note';
		return async ({ result, update }) => {
			saving = null;
			if (toastRefusal(result)) return;
			if (result.type === 'success') {
				toast.success(
					status === 'done'
						? t('console.feedback.toasts.done')
						: status === 'open'
							? t('console.feedback.toasts.reopened')
							: t('console.feedback.toasts.note_saved')
				);
			}
			await update({ reset: false, navigate: false });
		};
	};
	const updateAction = (node: HTMLFormElement) => enhance(node, submitUpdate);
</script>

<svelte:head><title>{pageTitle(t('console.nav_feedback'))}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-4">
	<h1 class="sr-only">{t('console.nav_feedback')}</h1>

	<div class="flex shrink-0 items-center">
		<DataTableFilter
			bind:filters={bar.filters}
			facets={[
				{ id: 'status', label: t('console.feedback.status_label'), options: STATUS_OPTIONS, multiple: false },
				{ id: 'type', label: t('console.feedback.type_label'), options: TYPE_OPTIONS, multiple: false }
			]}
			placeholder={t('console.feedback.search_placeholder')}
			showAmount={false}
			showDate={false}
			class="w-full"
		/>
	</div>

	<ConsoleFeedbackDataTable
		loading={reloading(['search', 'status', 'type'])}
		class="min-h-0 flex-1"
		feedback={held.rows}
		filtered={data.filtered}
		hasMore={currentPage < totalPages}
		loadingMore={navigating.to !== null}
		onLoadMore={() => writeParams({ page: currentPage + 1 })}
		onClear={() => writeParams({ search: null, status: null, type: null, page: null })}
		onOpenRow={openFeedback}
	/>
</div>

<ConsoleFeedbackSheet
	open={data.open !== null}
	onOpenChange={(open) => {
		if (!open) closeFeedback();
	}}
	item={data.open}
	{canWrite}
	{saving}
	fieldErrors={form?.fields}
	enhanceUpdate={updateAction}
/>
