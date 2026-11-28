<script lang="ts">
	/**
	 * The card a transaction saved from the chat is answered with (OEW-135).
	 *
	 * It reads like the Telegram receipt reply: what was saved, then amount,
	 * category, wallet and date, then the items. The API built every string
	 * in it (D27), so nothing here formats a figure.
	 *
	 * The controls are the Telegram buttons: a category, a wallet, and delete
	 * behind a confirm. Each posts to the transactions page's own actions, the
	 * ones its table cells and its delete already use, so balances, the
	 * wallet lock order, the audit row and the soft delete stay in the API
	 * (D5, D13, D14, OPS-2). What the card shows afterwards is the
	 * conversation read again, because the API re-reads each card by id when
	 * it serves a conversation. A deleted row collapses to one line.
	 */
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';

	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import type { TransactionCard } from '$lib/transaction-card';

	import { Button } from '../../atoms/button/index.js';
	import { ConfirmDialog } from '../../molecules/confirm-dialog/index.js';
	import { SelectAccount } from '../../molecules/select-account/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';

	let {
		card,
		canEdit = false
	}: {
		card: TransactionCard;
		/** False for a member, and while the reply is still arriving. */
		canEdit?: boolean;
	} = $props();

	let pending = $state<'category' | 'wallet' | 'delete' | null>(null);
	let confirming = $state(false);

	const name = $derived(card.name ?? t('chat.card_untitled'));

	/** The Telegram reply's second line. A transfer has wallets, not a category. */
	const line = $derived(
		[
			card.amount_formatted,
			...(card.type === 'transfer'
				? [`${card.wallet_name} → ${card.to_wallet_name ?? ''}`]
				: [card.category_name ?? t('chat.card_uncategorised'), card.wallet_name]),
			card.date
		].join(' · ')
	);

	async function post(
		action: 'setCategory' | 'setWallet' | 'delete',
		fields: Record<string, string>,
		kind: NonNullable<typeof pending>
	) {
		pending = kind;
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

{#if card.deleted}
	<p class="text-caption text-subtle">{t('chat.card_deleted', { name })}</p>
{:else}
	<article class="border-border flex flex-col gap-2 border p-3">
		<div class="flex flex-col gap-0.5">
			<p class="text-body font-medium">{t('chat.card_saved', { name })}</p>
			<p class="text-caption text-subtle tabular-nums">{line}</p>
		</div>

		{#if card.items.length > 0}
			<ul class="text-caption flex flex-col gap-0.5">
				{#each card.items as item, index (index)}
					<li class="flex justify-between gap-4">
						<span class="truncate">• {item.name}</span>
						<span class="tabular-nums">{item.amount_formatted}</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if canEdit}
			<!-- Keyed on the card, so a picker a refused change moved goes back
			     to what was saved when the conversation is read again. -->
			{#key card}
				<div class="flex flex-wrap items-center gap-2" role="group" aria-label={t('chat.card_controls')}>
					{#if card.type !== 'transfer'}
						<SelectCategory
							type={card.type}
							value={card.category_id ?? undefined}
							placeholder={t('chat.card_category')}
							disabled={pending !== null}
							updating={pending === 'category'}
							onChange={(id) => {
								if (id !== card.category_id) void post('setCategory', { category_id: id }, 'category');
							}}
							class="w-44"
						/>
					{/if}
					<SelectAccount
						value={card.wallet_id}
						placeholder={t('chat.card_wallet')}
						disabled={pending !== null}
						updating={pending === 'wallet'}
						onChange={(id) => {
							if (id !== card.wallet_id) void post('setWallet', { wallet_id: id }, 'wallet');
						}}
						class="w-44"
					/>
					<Button
						variant="ghost-destructive"
						size="sm"
						disabled={pending !== null}
						onclick={() => (confirming = true)}
					>
						<Trash2 aria-hidden="true" />
						{t('chat.card_delete')}
					</Button>
				</div>
			{/key}

			<ConfirmDialog
				bind:open={confirming}
				title={t('txn.delete_confirm')}
				confirmLabel={t('chat.card_delete')}
				cancelLabel={t('common.cancel')}
				onConfirm={() => void post('delete', {}, 'delete')}
			/>
		{/if}
	</article>
{/if}
