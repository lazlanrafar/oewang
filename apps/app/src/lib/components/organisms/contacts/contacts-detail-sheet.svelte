<script lang="ts">
	/**
	 * Ported from the old app's contact-detail-sheet (CON-2): the name and
	 * email in the header with Quick Edit and Delete, the phone, what this
	 * person owes and is owed, every debt with them as a timeline, Settle all
	 * when any is open, and the note.
	 *
	 * Changes from the old sheet: the address cell went with the address
	 * (D120); Merge into... sits beside Delete, because a contact with debts
	 * cannot be deleted (CON-3, CON-4); and the two totals keep one figure
	 * per currency rather than adding rupiah to dollars as floats (D12).
	 *
	 * Opened from either page through `?contact=`, so it posts its writes to
	 * the page that owns them: `/contacts` for the contact, `/debts` for the
	 * settlement.
	 */
	import History from '@lucide/svelte/icons/history';
	import Merge from '@lucide/svelte/icons/merge';
	import Trash from '@lucide/svelte/icons/trash';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { paidPercent, remainingByCurrency } from '$lib/debts';
	import { t } from '$lib/i18n';
	import { formatMoney } from '$lib/money';
	import type { Contact } from '$lib/server/contacts';
	import type { Debt } from '$lib/server/debts';
	import { cn } from '$lib/utils';

	import { DebtsBulkPaySheet } from '../debts/index.js';
	import ContactsFormFields from './contacts-form-fields.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		contact,
		debts,
		canEdit = true,
		saving = false,
		settling = false,
		fieldErrors,
		enhanceUpdate,
		enhanceSettle,
		debtHref,
		onDelete,
		onMerge
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		contact: Contact | null;
		/** Every debt with this contact, newest first. */
		debts: Debt[];
		canEdit?: boolean;
		saving?: boolean;
		settling?: boolean;
		fieldErrors?: Record<string, string>;
		/** The quick edit's save, owned by the page. */
		enhanceUpdate?: (node: HTMLFormElement) => void;
		/** Settle all's save, owned by the page. */
		enhanceSettle?: (node: HTMLFormElement) => void;
		/** Where one debt opens. */
		debtHref: (debt: Debt) => string;
		onDelete?: () => void;
		onMerge?: () => void;
	} = $props();

	let editing = $state(false);
	let settleOpen = $state(false);

	/* A different contact starts on its details, not on the last one's form. */
	const contactId = $derived(contact?.id ?? null);
	$effect(() => {
		void contactId;
		editing = false;
	});

	const receivable = $derived(remainingByCurrency(debts, 'receivable'));
	const payable = $derived(remainingByCurrency(debts, 'payable'));
	const anyOpen = $derived(debts.some((debt) => debt.status !== 'paid'));

	const dayLabel = (at: string) =>
		new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
			new Date(at)
		);

	const STATUS_LABEL: Record<Debt['status'], string> = {
		paid: t('debts.statuses.paid'),
		partial: t('debts.statuses.partial'),
		unpaid: t('debts.statuses.unpaid')
	};

	const progressive = (node: HTMLFormElement) => enhanceUpdate?.(node);
	const capsLabel = 'text-muted-foreground text-[10px] font-medium tracking-widest uppercase';
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content class="flex h-full flex-col rounded-none border-l p-0 shadow-none sm:max-w-[540px]">
		{#if contact}
			<Sheet.Header
				class="bg-muted/5 flex shrink-0 flex-row items-center justify-between space-y-0 border-b p-6 pb-6 text-left"
			>
				<div class="space-y-1">
					<Sheet.Title class="font-serif text-xl font-normal">{contact.name}</Sheet.Title>
					<Sheet.Description class="text-muted-foreground text-xs tracking-widest uppercase">
						{contact.email || t('contacts.details.no_email')}
					</Sheet.Description>
				</div>
				{#if canEdit}
					<div class="flex items-center gap-2">
						<Button variant="outline" size="caps" onclick={() => (editing = !editing)}>
							{editing ? t('contacts.details.view_details') : t('contacts.details.quick_edit')}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="text-muted-foreground h-8 w-8"
							aria-label={t('contacts.details.merge_contact')}
							onclick={onMerge}
						>
							<Merge class="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="text-muted-foreground hover:text-destructive h-8 w-8"
							aria-label={t('contacts.details.delete_contact')}
							onclick={onDelete}
						>
							<Trash class="h-4 w-4" />
						</Button>
					</div>
				{/if}
			</Sheet.Header>

			<div class="no-scrollbar flex-1 overflow-y-auto">
				{#if editing}
					<form method="POST" action="/contacts?/update" use:progressive class="space-y-6 p-6">
						<input type="hidden" name="id" value={contact.id} />
						<ContactsFormFields {contact} prefix="contact-quick" {fieldErrors} />
						<Button type="submit" class="w-full" loading={saving}>{t('contacts.form.save')}</Button>
					</form>
				{:else}
					<div class="border-border/50 bg-muted/5 grid grid-cols-2 gap-6 border-b p-6">
						<div class="space-y-1">
							<p class={capsLabel}>{t('contacts.form.phone_label')}</p>
							<p class="text-sm">{contact.phone || '—'}</p>
						</div>
					</div>

					<div class="border-border/50 grid grid-cols-2 gap-6 border-b p-6">
						<div class="space-y-1">
							<p class={capsLabel}>{t('debts.types.receivable')}</p>
							{#each receivable as total (total.currency)}
								<p class="font-serif text-2xl text-emerald-600 dark:text-emerald-400">
									{formatMoney(total.total, total.currency)}
								</p>
							{:else}
								<p class="font-serif text-2xl text-emerald-600 dark:text-emerald-400">—</p>
							{/each}
						</div>
						<div class="space-y-1">
							<p class={capsLabel}>{t('debts.types.payable')}</p>
							{#each payable as total (total.currency)}
								<p class="font-serif text-2xl text-rose-600 dark:text-rose-400">
									{formatMoney(total.total, total.currency)}
								</p>
							{:else}
								<p class="font-serif text-2xl text-rose-600 dark:text-rose-400">—</p>
							{/each}
						</div>
					</div>

					<div class="space-y-4 p-6">
						<div class="flex items-center justify-between">
							<h3 class="{capsLabel} flex items-center gap-2">
								<History class="h-3 w-3" />
								{t('contacts.details.activity_history')}
							</h3>
							{#if canEdit && anyOpen}
								<Button variant="outline" size="caps" onclick={() => (settleOpen = true)}>
									{t('debts.details.settle_all')}
								</Button>
							{/if}
						</div>

						{#if debts.length > 0}
							<div class="relative">
								{#each debts as debt, index (debt.id)}
									{@const last = index === debts.length - 1}
									<div class="relative flex gap-4">
										<div class="flex w-6 shrink-0 flex-col items-center">
											<div
												class={cn(
													'z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2',
													debt.type === 'receivable'
														? 'border-emerald-500 bg-emerald-500'
														: 'border-rose-500 bg-rose-500',
													debt.status === 'paid' && 'opacity-40'
												)}
											></div>
											{#if !last}<div class="bg-border/60 mt-1 w-px flex-1"></div>{/if}
										</div>

										<a href={debtHref(debt)} class={cn('block min-w-0 flex-1 pb-6', last && 'pb-0')}>
											<div class="mb-1.5 flex items-center justify-between gap-2">
												<div class="flex items-center gap-2">
													<span
														class={cn(
															'text-[10px] font-medium tracking-widest uppercase',
															debt.type === 'receivable'
																? 'text-emerald-600 dark:text-emerald-400'
																: 'text-rose-600 dark:text-rose-400'
														)}
													>
														{t(debt.type === 'receivable' ? 'debts.types.receivable' : 'debts.types.payable')}
													</span>
													<Badge variant={debt.status === 'paid' ? 'default' : 'outline'}>
														{STATUS_LABEL[debt.status]}
													</Badge>
												</div>
												<span class="text-muted-foreground shrink-0 text-[10px]">
													{dayLabel(debt.created_at)}
												</span>
											</div>

											<p
												class={cn(
													'font-serif text-lg leading-none font-normal tracking-tight',
													debt.status === 'paid' && 'text-muted-foreground line-through opacity-60'
												)}
											>
												{formatMoney(debt.amount, debt.currency_code)}
											</p>

											{#if debt.description}
												<p class="text-muted-foreground mt-1 truncate text-[11px] italic opacity-70">
													{debt.description}
												</p>
											{/if}

											{#if debt.status === 'partial'}
												<div class="mt-2 space-y-1">
													<div class="bg-muted h-0.5 w-full overflow-hidden rounded-none">
														<div class="bg-primary h-full transition-all" style:width="{paidPercent(debt)}%"></div>
													</div>
													<div class="flex items-center justify-between">
														<p class="text-muted-foreground text-[9px] tracking-widest uppercase">
															{t('contacts.details.progress')}
														</p>
														<p class="text-primary text-[9px] font-medium">
															{formatMoney(debt.paid_amount, debt.currency_code)}
															{t('contacts.details.settled')}
														</p>
													</div>
												</div>
											{/if}
										</a>
									</div>
								{/each}
							</div>
						{:else}
							<div
								class="border-border/50 bg-muted/5 flex h-40 flex-col items-center justify-center rounded-none border border-dashed p-8 text-center"
							>
								<History class="text-muted-foreground/30 mb-3 h-8 w-8" />
								<p class="text-muted-foreground text-xs tracking-widest uppercase">
									{t('contacts.details.no_history')}
								</p>
							</div>
						{/if}
					</div>

					{#if contact.note}
						<div class="space-y-2 p-6 pt-0">
							<h3 class={capsLabel}>{t('contacts.details.notes')}</h3>
							<div class="border-border/50 bg-muted/5 text-muted-foreground border p-4 text-[11px] italic">
								{contact.note}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>

{#if contact}
	<DebtsBulkPaySheet
		bind:open={settleOpen}
		{debts}
		contactName={contact.name}
		saving={settling}
		enhance={enhanceSettle}
	/>
{/if}
