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
	 */
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { toast } from 'svelte-sonner';

	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import type { TransactionCard } from '$lib/transaction-card';

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

	/** The row a change is in flight for, so only its controls wait. */
	let pending = $state<string | null>(null);
	let deleting = $state<TransactionCard | null>(null);
	let confirming = $state(false);

	const nameOf = (card: TransactionCard) => card.name ?? t('chat.card_untitled');
	const live = $derived(cards.filter((card) => !card.deleted).length);

	async function post(
		card: TransactionCard,
		action: 'setCategory' | 'setWallet' | 'delete',
		fields: Record<string, string> = {}
	) {
		pending = card.transaction_id;
		const body = new FormData();
		body.set('id', card.transaction_id);
		for (const [key, value] of Object.entries(fields)) body.set(key, value);

		try {
			const response = await fetch(`/transactions?/${action}`, { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				toast.success(t(action === 'delete' ? 'txn.deleted' : 'txn.updated'));
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
							{#each card.items as item, index (index)}
								<span class="text-subtle block">• {item.name} {item.amount_formatted}</span>
							{/each}
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
											if (id !== card.category_id) void post(card, 'setCategory', { category_id: id });
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
											if (id !== card.wallet_id) void post(card, 'setWallet', { wallet_id: id });
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
			if (card) void post(card, 'delete');
		}}
	/>
{/if}
