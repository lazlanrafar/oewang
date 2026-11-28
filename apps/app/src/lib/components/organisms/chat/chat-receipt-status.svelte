<script lang="ts" module>
	export type ReceiptStatus = 'reading' | 'ready' | 'queued' | 'unreadable';
</script>

<script lang="ts">
	/**
	 * The conversation's side of a receipt the panel is reading (OEW-135).
	 *
	 * A photo sent with no words starts no turn, and the read takes up to a
	 * minute, so without this line the conversation looked like nothing was
	 * happening. It is not a message: nothing stores it, and it goes once the
	 * saved table answers the receipt. What it says comes from the panel's own
	 * read, never from a second one.
	 */
	import { t } from '$lib/i18n';

	import { Button } from '../../atoms/button/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';

	let {
		status,
		panelOpen,
		onOpen
	}: {
		status: ReceiptStatus;
		/** The panel is showing this receipt: no button to open it again. */
		panelOpen: boolean;
		onOpen: () => void;
	} = $props();

	const text = $derived(
		{
			reading: t('chat.receipt_status_reading'),
			ready: t('chat.receipt_status_ready'),
			queued: t('chat.receipt_status_queued'),
			unreadable: t('chat.receipt_status_unreadable')
		}[status]
	);
</script>

<div class="flex flex-col items-start gap-2" role="status" aria-live="polite">
	<p class="text-body text-subtle flex items-center gap-2">
		{#if status === 'reading'}
			<Spinner size={16} />
		{/if}
		{text}
	</p>
	{#if !panelOpen && (status === 'ready' || status === 'unreadable')}
		<Button type="button" variant="outline" size="sm" onclick={onOpen}>
			{t('chat.receipt_status_open')}
		</Button>
	{/if}
</div>
