<script lang="ts">
	/**
	 * The table a reply that saved transactions ends with (OEW-135).
	 *
	 * One row per saved transaction, so a message that records a whole
	 * shopping list reads as a list rather than a stack of cards. It is the
	 * line items table's shape: the compact table, the category and wallet
	 * pickers in their cells, and a ⋯ menu for delete. The API built every
	 * string in it (D27), so nothing here formats a figure.
	 *
	 * Each control posts to the transactions page's own actions, the ones
	 * its table cells and its delete already use, so balances, the wallet
	 * lock order, the audit row and the soft delete stay in the API (D5,
	 * D13, D14, OPS-2). What a row shows afterwards is the conversation read
	 * again: the API re-reads each saved row by id when it serves one.
	 *
	 * A row's items are a table of their own under this one, one per row in
	 * the same order, because each item has its own category (TXN-24, D123)
	 * and a 21-item receipt listed in the name cell made one row a page tall.
	 * Their pickers save through the detail sheet's item action.
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { toast } from 'svelte-sonner';

	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import type { TransactionCard, TransactionCardItem } from '$lib/transaction-card';

	import { Button } from '../../atoms/button/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import * as Table from '../../atoms/table/index.js';
	import { ConfirmDialog } from '../../molecules/confirm-dialog/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';

	let {
		cards,
		canEdit = false
	}: {
		cards: TransactionCard[];
		/** False for a member, and while the reply is still arriving. */
		canEdit?: boolean;
	} = $props();

	/** The row or item a change is in flight for, so only its controls wait. */
	let pending = $state<string | null>(null);
	let deleting = $state<TransactionCard | null>(null);
	let confirming = $state(false);

	const nameOf = (card: TransactionCard) => card.name ?? t('chat.card_untitled');
	const live = $derived(cards.filter((card) => !card.deleted).length);
	const itemized = $derived(cards.filter((card) => !card.deleted && card.items.length > 0));

	const SAVED = {
		setCategory: 'txn.updated',
		setWallet: 'txn.updated',
		delete: 'txn.deleted',
		saveItem: 'txn.item_saved'
	} as const;

	function postRow(
		card: TransactionCard,
		action: 'setCategory' | 'setWallet' | 'delete',
		fields: Record<string, string> = {}
	) {
		return post(card.transaction_id, action, { id: card.transaction_id, ...fields });
	}

	/** The API replaces an item whole, so the rest goes back as it was read (TXN-27). */
	function setItemCategory(card: TransactionCard, item: TransactionCardItem, categoryId: string) {
		return post(item.id, 'saveItem', {
			transaction_id: card.transaction_id,
			item_id: item.id,
			name: item.name,
			brand: item.brand ?? '',
			quantity: item.quantity ?? '',
			unit: item.unit ?? '',
			unit_price: item.unit_price ?? '',
			amount: item.amount,
			category_id: categoryId,
			notes: item.notes ?? ''
		});
	}

	async function post(key: string, action: keyof typeof SAVED, fields: Record<string, string>) {
		pending = key;
		const body = new FormData();
		for (const [name, value] of Object.entries(fields)) body.set(name, value);

		try {
			const response = await fetch(`/transactions?/${action}`, { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				toast.success(t(SAVED[action]));
			} else {
				toast.error(
					messageForCode(result.type === 'failure' ? String(result.data?.code ?? '') : '')
				);
			}
		} catch {
			toast.error(messageForCode(''));
		} finally {
			// The saved state, read back through the conversation either way.
			await invalidateAll();
			pending = null;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<p class="text-body font-medium">{t('chat.card_saved_count', { count: live })}</p>

	<Table.Root density="compact" class="table-fixed">
		<Table.Header>
			<Table.Row>
				<Table.Head>{t('chat.card_col_name')}</Table.Head>
				<Table.Head class="w-28 text-right">{t('chat.card_col_amount')}</Table.Head>
				<Table.Head class="w-36">{t('chat.card_category')}</Table.Head>
				<Table.Head class="w-32">{t('chat.card_wallet')}</Table.Head>
				<Table.Head class="w-24">{t('chat.card_col_date')}</Table.Head>
				{#if canEdit}
					<Table.Head class="w-10"><span class="sr-only">{t('common.actions')}</span></Table.Head>
				{/if}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each cards as card (card.transaction_id)}
				<Table.Row>
					{#if card.deleted}
						<Table.Cell colspan={canEdit ? 6 : 5} class="text-subtle">
							{t('chat.card_deleted', { name: nameOf(card) })}
						</Table.Cell>
					{:else}
						<Table.Cell class="wrap-break-word">
							{nameOf(card)}
							{#if card.items.length > 0}
								<span class="text-subtle">{t('chat.card_items_hint', { count: card.items.length })}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right font-mono whitespace-nowrap">{card.amount_formatted}</Table.Cell>
						<!-- Keyed on the row, so a picker a refused change moved goes
						     back to what was saved when the conversation is read again. -->
						{#key card}
							<Table.Cell>
								{#if card.type === 'transfer'}
									<span class="px-3">→ {card.to_wallet_name ?? ''}</span>
								{:else if canEdit}
									<SelectCategory
										type={card.type}
										inDataTable
										value={card.category_id ?? undefined}
										placeholder={t('chat.card_uncategorised')}
										disabled={pending !== null}
										updating={pending === card.transaction_id}
										onChange={(id) => {
											if (id !== card.category_id) void postRow(card, 'setCategory', { category_id: id });
										}}
									/>
								{:else}
									{card.category_name ?? t('chat.card_uncategorised')}
								{/if}
							</Table.Cell>
							<Table.Cell>
								{#if canEdit}
									<SelectAccount
										inDataTable
										value={card.wallet_id}
										placeholder={t('chat.card_wallet')}
										disabled={pending !== null}
										updating={pending === card.transaction_id}
										onChange={(id) => {
											if (id !== card.wallet_id) void postRow(card, 'setWallet', { wallet_id: id });
										}}
									/>
								{:else}
									{card.wallet_name}
								{/if}
							</Table.Cell>
						{/key}
						<Table.Cell class="whitespace-nowrap tabular-nums">{card.date}</Table.Cell>
						{#if canEdit}
							<Table.Cell class="px-1">
								<div class="flex justify-center">
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button
													variant="ghost"
													size="icon"
													class="size-6"
													aria-label={t('chat.card_actions', { name: nameOf(card) })}
													disabled={pending !== null}
													{...props}
												>
													<Ellipsis />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end" class="w-40">
											<DropdownMenu.Item class="text-destructive" onclick={() => {
												deleting = card;
												confirming = true;
											}}>
												{t('chat.card_delete')}
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								</div>
							</Table.Cell>
						{/if}
					{/if}
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	{#each itemized as card (card.transaction_id)}
		<p class="text-caption text-subtle pt-2">
			{t('chat.card_items_caption', { name: nameOf(card), count: card.items.length })}
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
						<!-- Keyed on the item, so a pick the API refused goes back to
						     what the conversation says when it is read again. -->
						{#key item}
							<Table.Cell>
								{#if canEdit && card.type !== 'transfer' && item.id}
									<SelectCategory
										type={card.type}
										inDataTable
										clearLabel={t('txn.item_no_category')}
										placeholder={t('txn.item_category')}
										value={item.category_id ?? ''}
										disabled={pending !== null}
										updating={pending === item.id}
										onChange={(id) => {
											if (id !== (item.category_id ?? '')) void setItemCategory(card, item, id);
										}}
									/>
								{:else}
									<span class="text-subtle">{item.category_name ?? ''}</span>
								{/if}
							</Table.Cell>
						{/key}
						<Table.Cell class="text-right font-mono whitespace-nowrap">{item.amount_formatted}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/each}
</div>

{#if canEdit}
	<ConfirmDialog
		bind:open={confirming}
		title={t('txn.delete_confirm')}
		confirmLabel={t('chat.card_delete')}
		cancelLabel={t('common.cancel')}
		onConfirm={() => {
			const card = deleting;
			deleting = null;
			if (card) void postRow(card, 'delete');
		}}
	/>
{/if}
