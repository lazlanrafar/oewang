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
	 * read, never from a second one. The receipt's own chip, above it,
	 * opens the panel.
	 */
	import { t } from '$lib/i18n';

	import { Spinner } from '../../atoms/spinner/index.js';

	let { status }: { status: ReceiptStatus } = $props();

	const text = $derived(
		{
			reading: t('chat.receipt_status_reading'),
			ready: t('chat.receipt_status_ready'),
			queued: t('chat.receipt_status_queued'),
			unreadable: t('chat.receipt_status_unreadable')
		}[status]
	);
</script>

<p class="text-body text-subtle flex items-center gap-2" role="status" aria-live="polite">
	{#if status === 'reading'}
		<Spinner size={16} />
	{/if}
	{text}
</p>
