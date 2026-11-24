<script lang="ts">
	/**
	 * Ported from the old app's bulk-pay-sheet, the contact sheet's Settle
	 * all: every open debt with this contact, ticked by default, settled in
	 * full from one account (DEBT-6).
	 *
	 * One payment and one transaction per debt, all or nothing; the API
	 * refuses the lot when a debt is not in the account's currency
	 * (`BULK_PAY_CURRENCY_MISMATCH`). The old total added every debt as a
	 * float, rupiah and dollars together; this one keeps a total per
	 * currency, as decimal strings (D12).
	 *
	 * It posts to the debts page's action from wherever the contact sheet is
	 * open, so the write has one home.
	 */
	import { untrack } from 'svelte';

	import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { SelectAccount } from '$lib/components/molecules/select-account';
	import { isPartlyPaid, localToday, remainingByCurrency } from '$lib/debts';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { Debt } from '$lib/server/debts';
	import { cn } from '$lib/utils';

	let {
		open = $bindable(false),
		onOpenChange,
		debts,
		contactName,
		saving = false,
		enhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		debts: Debt[];
		contactName: string;
		saving?: boolean;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const outstanding = $derived(debts.filter((debt) => debt.status !== 'paid'));

	let selected = $state<string[]>([]);
	let walletId = $state('');

	$effect(() => {
		if (!open) return;
		untrack(() => {
			selected = outstanding.map((debt) => debt.id);
			walletId = '';
		});
	});

	const chosen = $derived(outstanding.filter((debt) => selected.includes(debt.id)));
	const totals = $derived(remainingByCurrency(chosen));
	const allTicked = $derived(outstanding.length > 0 && selected.length === outstanding.length);

	const toggle = (id: string) =>
		(selected = selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id]);

	const dayLabel = (at: string) =>
		new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(at)
		);

	const STATUS_LABEL: Record<Debt['status'], string> = {
		paid: t('debts.statuses.paid'),
		partial: t('debts.statuses.partial'),
		unpaid: t('debts.statuses.unpaid')
	};

	const progressive = (node: HTMLFormElement) => enhance?.(node);
	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		<Sheet.Header class="bg-muted/5 shrink-0 border-b px-6 py-6 text-left">
			<Sheet.Title class="font-serif text-xl font-normal">{t('debts.bulk_settlement.title')}</Sheet.Title>
			<Sheet.Description class="text-muted-foreground text-xs tracking-widest uppercase">
				{contactName}
			</Sheet.Description>
		</Sheet.Header>

		<div class="no-scrollbar flex-1 overflow-y-auto">
			{#if outstanding.length === 0}
				<div class="text-muted-foreground flex h-40 items-center justify-center px-6 text-sm">
					{t('debts.bulk_settlement.no_outstanding')}
				</div>
			{:else}
				<div class="bg-muted/5 flex items-center gap-3 border-b px-6 py-4">
					<Checkbox
						id="settle-all"
						checked={allTicked}
						indeterminate={selected.length > 0 && !allTicked}
						onCheckedChange={() => (selected = allTicked ? [] : outstanding.map((debt) => debt.id))}
					/>
					<label for="settle-all" class="{capsLabel} cursor-pointer">
						{t('debts.bulk_settlement.select_all')} ({outstanding.length})
					</label>
				</div>

				<div class="divide-border/50 divide-y">
					{#each outstanding as debt (debt.id)}
						{@const ticked = selected.includes(debt.id)}
						<label
							for="settle-{debt.id}"
							class={cn(
								'flex cursor-pointer items-start gap-4 px-6 py-4 transition-colors',
								ticked ? 'bg-muted/5' : 'opacity-60'
							)}
						>
							<Checkbox id="settle-{debt.id}" checked={ticked} onCheckedChange={() => toggle(debt.id)} />

							<div
								class={cn(
									'mt-0.5 shrink-0',
									debt.type === 'receivable' ? 'text-emerald-500' : 'text-rose-500'
								)}
							>
								{#if debt.type === 'receivable'}
									<ArrowDownLeft class="h-4 w-4" />
								{:else}
									<ArrowUpRight class="h-4 w-4" />
								{/if}
							</div>

							<div class="min-w-0 flex-1">
								<div class="mb-1 flex items-center justify-between gap-2">
									<div class="flex items-center gap-2">
										<span
											class={cn(
												'text-[10px] font-medium tracking-widest uppercase',
												debt.type === 'receivable'
													? 'text-emerald-600 dark:text-emerald-400'
													: 'text-rose-600 dark:text-rose-400'
											)}
										>
											{t(debt.type === 'receivable' ? 'debts.types.you_are_owed' : 'debts.types.you_owe')}
										</span>
										<Badge variant="outline">{STATUS_LABEL[debt.status]}</Badge>
									</div>
									<span class="text-muted-foreground text-[10px]">{dayLabel(debt.created_at)}</span>
								</div>

								<p class="font-serif text-lg font-normal">
									{formatMoney(debt.remaining_amount, debt.currency_code)}
								</p>
								{#if isPartlyPaid(debt)}
									<p class="text-muted-foreground mt-0.5 text-[10px] line-through opacity-60">
										{t('debts.details.original_amount')}: {formatMoney(debt.amount, debt.currency_code)}
									</p>
								{/if}
								{#if debt.description}
									<p class="text-muted-foreground mt-0.5 truncate text-[11px] italic opacity-70">
										{debt.description}
									</p>
								{/if}
							</div>
						</label>
					{/each}
				</div>
			{/if}
		</div>

		{#if outstanding.length > 0}
			<form
				method="POST"
				action="/debts?/bulkPay"
				use:progressive
				class="bg-background shrink-0 space-y-4 border-t p-6"
			>
				<input type="hidden" name="wallet_id" value={walletId} />
				<input type="hidden" name="date" value={localToday()} />
				{#each chosen as debt (debt.id)}
					<input type="hidden" name="debt_id" value={debt.id} />
					<input type="hidden" name="amount" value={debt.remaining_amount} />
				{/each}

				<div class="space-y-2">
					<p class={capsLabel}>{t('debts.bulk_settlement.pay_from_account')}</p>
					<SelectAccount bind:value={walletId} />
				</div>

				<div class="border-border/50 flex items-center justify-between gap-4 border-t pt-2">
					<div>
						<p class={capsLabel}>{t('debts.bulk_settlement.total_to_settle')}</p>
						{#each totals as total (total.currency)}
							<p class="font-serif text-2xl font-normal">{formatMoney(total.total, total.currency)}</p>
						{:else}
							<p class="font-serif text-2xl font-normal">—</p>
						{/each}
						<p class="text-muted-foreground text-[10px]">
							{t('debts.bulk_settlement.selected_count', { count: chosen.length })}
						</p>
					</div>
					<Button
						type="submit"
						size="caps"
						loading={saving}
						disabled={saving || chosen.length === 0 || !walletId}
					>
						{t('debts.bulk_settlement.settle_button')}
					</Button>
				</div>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
