<script lang="ts">
	/**
	 * The receipt panel once the receipt is saved (OEW-135).
	 *
	 * The chip under a receipt always opens the panel, so a confirmed one
	 * lands here instead of on the confirmation sheet: no second read, which
	 * takes a minute, and no second confirm, which would save it twice. It is
	 * read-only. Every figure is the saved card's own, built by the API (D27),
	 * and the changes live in the chat table and on the transactions page.
	 */
	import { transactionTarget } from '$lib/chat-entities';
	import { filePreview } from '$lib/files';
	import { t } from '$lib/i18n';
	import type { TransactionCard } from '$lib/transaction-card';

	import { Button } from '../../atoms/button/index.js';
	import * as Table from '../../atoms/table/index.js';
	import { FilePreview } from '../../molecules/file-preview/index.js';

	let {
		card,
		file
	}: {
		card: TransactionCard;
		/** The receipt's vault file, or null when the vault could not describe it. */
		file: { id: string; name: string; type: string; size: number } | null;
	} = $props();

	const name = $derived(card.name ?? t('chat.card_untitled'));
	const fields = $derived([
		{ label: t('chat.card_col_name'), value: name },
		{ label: t('chat.card_col_amount'), value: card.amount_formatted, figure: true },
		{
			label: t('chat.card_category'),
			value:
				card.type === 'transfer'
					? `→ ${card.to_wallet_name ?? ''}`
					: (card.category_name ?? t('chat.card_uncategorised'))
		},
		{ label: t('chat.card_wallet'), value: card.wallet_name },
		{ label: t('chat.card_col_date'), value: card.date, figure: true }
	]);
</script>

<div class="space-y-6 px-6 py-6">
	{#if file}
		<FilePreview {...filePreview()} variant="box" {file} />
	{/if}

	<dl class="grid grid-cols-2 gap-x-6 gap-y-4">
		{#each fields as field (field.label)}
			<div class="space-y-1">
				<dt class="text-subtle text-xs tracking-widest uppercase">{field.label}</dt>
				<dd class="text-sm font-medium wrap-break-word {field.figure ? 'font-mono tabular-nums' : ''}">
					{field.value}
				</dd>
			</div>
		{/each}
	</dl>

	{#if card.items.length > 0}
		<!-- The items table the chat shows, without its pickers. -->
		<div class="space-y-2">
			<p class="text-caption text-subtle">
				{t('chat.card_items_caption', { name, count: card.items.length })}
			</p>
			<Table.Root density="compact" class="table-fixed">
				<Table.Header>
					<Table.Row>
						<Table.Head>{t('txn.item_column_name')}</Table.Head>
						<Table.Head class="w-40">{t('txn.item_column_category')}</Table.Head>
						<Table.Head class="w-28 text-right">{t('txn.item_amount')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each card.items as item, index (item.id ?? index)}
						<Table.Row>
							<Table.Cell class="wrap-break-word">
								{item.name}
								{#if item.quantity}
									<span class="text-subtle text-xs">
										· {item.quantity}{item.unit ? ` ${item.unit}` : ''}
									</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-subtle">{item.category_name ?? ''}</Table.Cell>
							<Table.Cell class="text-right font-mono whitespace-nowrap">
								{item.amount_formatted}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}

	<Button variant="outline" href={transactionTarget(card.transaction_id).href}>
		{t('canvas.receipt_saved_open')}
	</Button>
</div>
