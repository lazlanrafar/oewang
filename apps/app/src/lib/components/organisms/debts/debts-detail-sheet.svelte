<script lang="ts">
	/**
	 * Ported from the old app's debt-detail-sheet: what remains in large
	 * serif, who it is with, the status, the summary grid, the notes, and
	 * Record Payment at the foot (DEBT-11).
	 *
	 * One addition: the payments, each with Cancel (DEBT-7). The old sheet
	 * had no way to undo a payment, so a wrong one could only be lived with.
	 * Cancelling removes the payment and the transaction it wrote, and the
	 * amount goes back on the debt.
	 *
	 * Paid is the amount less what remains, as decimal strings (D12).
	 */
	import ArrowDownLeft from '@lucide/svelte/icons/arrow-down-left';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import Calendar from '@lucide/svelte/icons/calendar';
	import CreditCard from '@lucide/svelte/icons/credit-card';
	import Trash from '@lucide/svelte/icons/trash';
	import X from '@lucide/svelte/icons/x';

	import { Badge, type BadgeVariant } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Separator } from '$lib/components/atoms/separator';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { paidAmount } from '$lib/debts';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { DebtDetail } from '$lib/server/debts';

	let {
		open = $bindable(false),
		onOpenChange,
		debt,
		canEdit = true,
		onDelete,
		onRecordPayment,
		onCancelPayment,
		sourceHref
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		debt: DebtDetail | null;
		canEdit?: boolean;
		onDelete?: () => void;
		onRecordPayment?: () => void;
		onCancelPayment?: (paymentId: string) => void;
		/** Where the source transaction opens, when there is one. */
		sourceHref?: string | null;
	} = $props();

	const STATUS_VARIANT: Record<DebtDetail['status'], BadgeVariant> = {
		paid: 'default',
		partial: 'secondary',
		unpaid: 'outline'
	};
	const STATUS_LABEL: Record<DebtDetail['status'], string> = {
		paid: t('debts.statuses.paid'),
		partial: t('debts.statuses.partial'),
		unpaid: t('debts.statuses.unpaid')
	};

	const money = (value: string) => (debt ? formatMoney(value, debt.currency_code) : '');

	const dayFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dayLabel = (day: string) => dayFormat.format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
	const instantLabel = (at: string) =>
		new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(at)
		);

	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
	const sourceName = $derived(
		debt?.source_transaction?.name ?? debt?.source_transaction_name ?? null
	);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		{#if debt}
			<Sheet.Header
				class="bg-muted/5 flex shrink-0 flex-row items-center justify-between border-b px-6 py-6 text-left"
			>
				<Sheet.Title class="font-serif text-xl font-normal">{t('debts.details.title')}</Sheet.Title>
				<Sheet.Description class="sr-only">{debt.contact_name}</Sheet.Description>
				{#if canEdit}
					<div class="flex gap-2">
						<Button
							variant="ghost"
							size="icon"
							class="text-muted-foreground hover:text-destructive h-8 w-8"
							aria-label={t('debts.details.delete')}
							onclick={onDelete}
						>
							<Trash class="h-4 w-4" />
						</Button>
					</div>
				{/if}
			</Sheet.Header>

			<div class="no-scrollbar relative flex-1 space-y-8 overflow-y-auto px-6 py-6">
				<div class="flex items-start justify-between">
					<div class="space-y-1">
						<p class="font-serif text-4xl font-normal tracking-tight">
							{money(debt.remaining_amount)}
						</p>
						<div class="text-muted-foreground flex items-center gap-2 text-sm">
							{#if debt.type === 'receivable'}
								<ArrowDownLeft class="h-4 w-4 text-emerald-500" />
							{:else}
								<ArrowUpRight class="h-4 w-4 text-rose-500" />
							{/if}
							<span class="text-[10px] font-medium tracking-widest uppercase">
								{t(debt.type === 'receivable' ? 'debts.types.you_are_owed' : 'debts.types.you_owe')}
							</span>
							<span class="text-foreground text-[10px] font-medium tracking-widest uppercase">
								{debt.contact_name}
							</span>
						</div>
					</div>

					<Badge variant={STATUS_VARIANT[debt.status]}>{STATUS_LABEL[debt.status]}</Badge>
				</div>

				<Separator />

				<div class="space-y-6">
					<h3 class={capsLabel}>{t('debts.details.summary')}</h3>

					<div class="grid grid-cols-2 gap-y-4 text-sm">
						<div class="space-y-1">
							<p class={capsLabel}>{t('debts.details.original_amount')}</p>
							<p class="font-serif text-lg font-normal">{money(debt.amount)}</p>
						</div>

						<div class="space-y-1">
							<p class={capsLabel}>{t('debts.details.paid_amount')}</p>
							<p class="font-serif text-lg font-normal text-emerald-500">{money(paidAmount(debt))}</p>
						</div>

						<div class="space-y-1">
							<p class="{capsLabel} flex items-center gap-1.5">
								<Calendar class="h-3.5 w-3.5" />
								{t('debts.details.due_date')}
							</p>
							<p class="font-serif text-lg font-normal">
								{debt.due_date ? dayLabel(debt.due_date) : t('debts.details.no_due_date')}
							</p>
						</div>

						{#if debt.source_transaction_id}
							<div class="space-y-1">
								<p class="{capsLabel} flex items-center gap-1.5">
									<CreditCard class="h-3.5 w-3.5" />
									{t('debts.details.from_transaction')}
								</p>
								{#if sourceHref}
									<a
										href={sourceHref}
										class="text-muted-foreground line-clamp-1 font-serif text-lg font-normal italic hover:underline"
									>
										{sourceName ?? '—'}
									</a>
								{:else}
									<p class="text-muted-foreground line-clamp-1 font-serif text-lg font-normal italic">
										{sourceName ?? '—'}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				{#if debt.payments.length > 0}
					<div class="space-y-3">
						<h3 class={capsLabel}>{t('debts.details.payments')}</h3>
						<ul class="divide-border/50 divide-y border-y">
							{#each debt.payments as payment (payment.id)}
								<li class="flex items-center justify-between gap-4 py-3">
									<div class="min-w-0">
										<p class="font-serif text-lg font-normal">{money(payment.amount)}</p>
										<p class="text-muted-foreground truncate text-[11px]">
											{instantLabel(payment.date)} · {payment.wallet_name ??
												t('debts.details.no_wallet')}
										</p>
									</div>
									{#if canEdit}
										<Button
											variant="ghost"
											size="icon"
											class="text-muted-foreground hover:text-destructive h-8 w-8 shrink-0"
											aria-label={t('debts.details.cancel_payment')}
											onclick={() => onCancelPayment?.(payment.id)}
										>
											<X class="h-4 w-4" />
										</Button>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if debt.description}
					<div class="space-y-2">
						<h3 class={capsLabel}>{t('debts.details.notes')}</h3>
						<div
							class="border-border/50 bg-muted/10 text-foreground/80 rounded-none border p-4 text-sm font-normal whitespace-pre-wrap italic"
						>
							{debt.description}
						</div>
					</div>
				{/if}
			</div>

			{#if canEdit}
				<div class="bg-background mt-auto shrink-0 border-t p-6">
					<Button
						size="caps"
						class="w-full"
						disabled={debt.status === 'paid'}
						onclick={onRecordPayment}
					>
						{debt.status === 'paid' ? t('debts.details.settled') : t('debts.details.record_payment')}
					</Button>
				</div>
			{/if}
		{/if}
	</Sheet.Content>
</Sheet.Root>
