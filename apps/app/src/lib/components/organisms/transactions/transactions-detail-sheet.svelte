<script lang="ts" module>
	export type TransactionDetail = {
		id: string;
		name: string;
		/** The wallet-currency figure, signed and formatted. */
		amount: string;
		income: boolean;
		date: string;
		account: string;
		toAccount?: string | null;
		category?: string | null;
		type: string;
		notes?: string | null;
		/** All three figures, when the entry currency differed (TXN-21). */
		originalAmount?: string | null;
		baseAmount?: string | null;
		/** Entry to wallet, and wallet to workspace. */
		exchangeRate?: string | null;
		baseRate?: string | null;
		baseRateSource?: string | null;
		baseRateDate?: string | null;
		baseRateStale?: boolean;
		receivedAmount?: string | null;
		/** Line items, with the warning the UI raises when they disagree. */
		items?: Array<{
			id: string;
			name: string;
			amount: string;
			quantity?: string | null;
			unit?: string | null;
			/** The item's own category, when it has one (TXN-24). */
			categoryId?: string | null;
		}>;
		/** How the items add up against the transaction, when they do not. */
		itemsMismatch?: string | null;
		attachments?: Array<{
			id: string;
			file_id: string;
			name: string;
			type: string;
			size: number;
		}>;
		history?: Array<{
			id: string;
			at: string;
			who: string;
			source: string;
			what: string;
		}>;
	};
</script>

<script lang="ts">
	/**
	 * Ported from the old app's transaction-detail-sheet, laid out to variant
	 * 3 of its SHEET_GUIDE: content at `p-0`, a header row with a rule and
	 * `bg-muted/5` carrying the title, a subtitle in small caps and the
	 * actions, and a body that scrolls with `space-y-6`. No footer: the
	 * actions live in the header.
	 *
	 * Read first, and read-only: edit and delete are hidden for a member,
	 * and a delete asks before it happens (UI-4).
	 */
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	import { Badge } from '../../atoms/badge/index.js';
	import { Button } from '../../atoms/button/index.js';
	import * as Accordion from '../../atoms/accordion/index.js';
	import { FilePicker } from '../../molecules/file-picker/index.js';
	import { FileTile } from '../../molecules/file-tile/index.js';
	import { SelectCategory } from '../../molecules/select-category/index.js';
	import type { UploadedFile } from '../../molecules/file-dropzone/index.js';
	import { filePicker, fileTile } from '$lib/files.js';
	import { t } from '$lib/i18n';
	import * as Sheet from '../../atoms/sheet/index.js';
	import * as Table from '../../atoms/table/index.js';
	import { cn } from '$lib/utils.js';
	import { formatMoney } from '$lib/money';
	import type { Debt, TransactionDebts } from '$lib/server/debts';

	let {
		open = $bindable(false),
		onOpenChange,
		transaction,
		canEdit = true,
		onEdit,
		onDelete,
		onAddItem,
		onEditItem,
		onDeleteItem,
		onItemCategoryChange,
		onCategorizeItems,
		categorizing = false,
		onOpenFile,
		onAttachmentsChange,
		debts = null,
		debtHref,
		onCreateDebt
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		transaction?: TransactionDetail;
		canEdit?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
		onAddItem?: () => void;
		onEditItem?: (itemId: string) => void;
		onDeleteItem?: (itemId: string) => void;
		/** An item's category was picked; empty means none (TXN-27). */
		onItemCategoryChange?: (itemId: string, categoryId: string) => void;
		/** Ask for a category for every item that has none (TXN-27). */
		onCategorizeItems?: () => void;
		categorizing?: boolean;
		/** A tile was clicked: the page opens the file sheet over this one. */
		onOpenFile?: (file: UploadedFile) => void;
		/** The whole new set, saved as soon as it changes (TXN-13). */
		onAttachmentsChange?: (files: UploadedFile[]) => void;
		/** The debts this row made, and the one it pays (DEBT-12). */
		debts?: TransactionDebts | null;
		/** Where one of those debts opens. */
		debtHref?: (debtId: string) => string;
		/** Make a debt from this row: the page opens the debt form with it as the source. */
		onCreateDebt?: () => void;
	} = $props();

	/* The payment first, then the debts made from the row, each with the figure the row moved. */
	const related = $derived<Array<{ key: string; debt: Debt; amount: string }>>([
		...(debts?.payment
			? [{ key: debts.payment.payment.id, debt: debts.payment.debt, amount: debts.payment.payment.amount }]
			: []),
		...(debts?.debts ?? []).map((debt) => ({ key: debt.id, debt, amount: debt.amount }))
	]);

	/* A transfer has no category, so its items take none either. */
	const itemType = $derived(
		transaction?.type === 'income' || transaction?.type === 'expense' ? transaction.type : undefined
	);
	const uncategorised = $derived(
		itemType !== undefined && (transaction?.items ?? []).some((item) => !item.categoryId)
	);

	let pickerOpen = $state(false);
	const tile = fileTile();
	const picker = filePicker();

	// The tiles show the file, so they carry the file's id rather than the
	// link row's.
	const attached = $derived(
		(transaction?.attachments ?? []).map((file) => ({
			id: file.file_id,
			name: file.name,
			type: file.type,
			size: file.size
		}))
	);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		{#if transaction}
			<Sheet.Header
				class="bg-muted/5 flex shrink-0 flex-row items-center justify-between border-b px-6 py-6 text-left"
			>
				<div class="space-y-1">
					<Sheet.Title class="text-xl font-medium">{transaction.name}</Sheet.Title>
					<p class="text-subtle text-xs tracking-widest uppercase">{transaction.date}</p>
					<Sheet.Description class="sr-only">
						The full record for this transaction.
					</Sheet.Description>
				</div>

				{#if canEdit}
					<div class="flex items-center gap-2">
						<!--
							Edit closes this sheet through the primitive's own Close, not
							by flipping a flag: the page then opens the form once the
							overlay is gone. Opening a second sheet while the first
							unmounts leaves both shut.
						-->
						<Sheet.Close>
							{#snippet child({ props })}
								<Button
									variant="outline"
									size="icon"
									aria-label="Edit transaction"
									{...props}
									onclick={(event) => {
										// The Close primitive puts its own handler in `props`, so
										// spreading and then setting `onclick` would throw it away
										// and the sheet would never close.
										(props.onclick as ((event: MouseEvent) => void) | undefined)?.(event);
										onEdit?.();
									}}
								>
									<Pencil />
								</Button>
							{/snippet}
						</Sheet.Close>
						<Button
							variant="outline"
							size="icon"
							class="text-destructive hover:text-destructive"
							aria-label="Delete transaction"
							onclick={onDelete}
						>
							<Trash2 />
						</Button>
					</div>
				{/if}
			</Sheet.Header>

			<div class="flex-1 space-y-6 overflow-y-auto px-6 py-6">
				<div class="space-y-1">
					<p
						class={cn(
							'font-serif text-4xl select-text',
							transaction.income ? 'text-green' : 'text-red'
						)}
					>
						{transaction.amount}
					</p>

					<!--
						All three figures, so nothing is hidden: what the user typed,
						what moved the wallet, and what the reports count (TXN-21).
					-->
					{#if transaction.originalAmount}
						<p class="text-subtle text-small">
							Entered as {transaction.originalAmount}
							{#if transaction.exchangeRate}
								at {transaction.exchangeRate}
							{/if}
						</p>
					{/if}
					{#if transaction.baseAmount}
						<p class="text-subtle text-small">
							{transaction.baseAmount} in the workspace currency
							{#if transaction.baseRate}
								· rate {transaction.baseRate}
							{/if}
						</p>
					{/if}
					{#if transaction.baseRateStale}
						<p class="text-small text-destructive">
							Converted at the rate for {transaction.baseRateDate}, the newest one
							available when it was written.
						</p>
					{/if}
				</div>

				<dl class="grid grid-cols-2 gap-x-6 gap-y-4">
					<div class="space-y-1">
						<dt class="text-subtle text-xs tracking-widest uppercase">Account</dt>
						<dd class="text-sm font-medium">{transaction.account}</dd>
					</div>
					{#if transaction.toAccount}
						<div class="space-y-1">
							<dt class="text-subtle text-xs tracking-widest uppercase">To account</dt>
							<dd class="text-sm font-medium">{transaction.toAccount}</dd>
						</div>
						{#if transaction.receivedAmount}
							<div class="space-y-1">
								<dt class="text-subtle text-xs tracking-widest uppercase">Received</dt>
								<dd class="text-sm font-medium">{transaction.receivedAmount}</dd>
							</div>
						{/if}
					{:else}
						<div class="space-y-1">
							<dt class="text-subtle text-xs tracking-widest uppercase">Category</dt>
							<dd class="text-sm font-medium">{transaction.category ?? '—'}</dd>
						</div>
					{/if}
					<div class="space-y-1">
						<dt class="text-subtle text-xs tracking-widest uppercase">Type</dt>
						<dd class="text-sm font-medium">{transaction.type}</dd>
					</div>
				</dl>

				{#if transaction.notes}
					<div class="space-y-1">
						<p class="text-subtle text-xs tracking-widest uppercase">Note</p>
						<p class="text-sm leading-relaxed wrap-break-word">{transaction.notes}</p>
					</div>
				{/if}

				<div class="space-y-2">
					<div class="flex items-center justify-between gap-2">
						<p class="text-subtle text-xs tracking-widest uppercase">Line items</p>
						{#if canEdit}
							<Button variant="ghost" size="icon" class="size-6" aria-label="Add line item" onclick={onAddItem}>
								<Plus class="size-3.5" />
							</Button>
						{/if}
					</div>

					{#if transaction.items?.length}
							<Table.Root density="compact" class="table-fixed">
								<Table.Header>
									<Table.Row>
										<Table.Head>{t('txn.item_column_name')}</Table.Head>
										{#if itemType}
											<Table.Head class="w-40">{t('txn.item_column_category')}</Table.Head>
										{/if}
										<Table.Head class="w-28 text-right">{t('txn.item_amount')}</Table.Head>
										{#if canEdit}
											<Table.Head class="w-14"><span class="sr-only">{t('common.actions')}</span></Table.Head>
										{/if}
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each transaction.items as item (item.id)}
										<Table.Row>
											<Table.Cell class="wrap-break-word">
												{item.name}
												{#if item.quantity}
													<span class="text-subtle text-xs">
														· {item.quantity}{item.unit ? ` ${item.unit}` : ''}
													</span>
												{/if}
											</Table.Cell>
											<!-- The category the item is counted under, its own when
											     it has one (TXN-24). A reader sees it only when set. -->
											{#if itemType}
												<Table.Cell class="px-0">
													{#if canEdit || item.categoryId}
														<!-- Keyed on the loaded items: a pick the API refused
														     goes back to what the reload says. -->
														{#key transaction.items}
														<SelectCategory
															type={itemType}
															inDataTable
															creatable={canEdit}
															disabled={!canEdit}
															createLabel={(typed) => t('common.create_named', { name: typed })}
															clearLabel={t('txn.item_no_category')}
															placeholder={t('txn.item_category')}
															value={item.categoryId ?? ''}
															onChange={(value) => onItemCategoryChange?.(item.id, value)}
														/>
														{/key}
													{/if}
												</Table.Cell>
											{/if}
											<Table.Cell class="text-right font-mono whitespace-nowrap">{item.amount}</Table.Cell>
											{#if canEdit}
												<Table.Cell class="px-1">
													<div class="flex justify-end">
														<Button
															variant="ghost"
															size="icon"
															class="size-6"
															aria-label="Edit {item.name}"
															onclick={() => onEditItem?.(item.id)}
														>
															<Pencil class="size-3" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															class="text-destructive size-6"
															aria-label="Remove {item.name}"
															onclick={() => onDeleteItem?.(item.id)}
														>
															<Trash2 class="size-3" />
														</Button>
													</div>
												</Table.Cell>
											{/if}
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>

						<!--
							A mismatch is a badge and nothing more: item totals are
							not forced to match the transaction, because a receipt
							with a service charge on it legitimately does not add up
							(TXN-12).
						-->
						{#if canEdit && uncategorised && onCategorizeItems}
							<Button
								variant="outline"
								size="caps"
								class="w-full"
								loading={categorizing}
								onclick={onCategorizeItems}
							>
								<Sparkles class="h-3.5 w-3.5" />
								{t('txn.categorise_items')}
							</Button>
						{/if}

						{#if transaction.itemsMismatch}
							<Badge variant="outline" class="text-destructive gap-1">
								<TriangleAlert class="size-3" />
								Items add up to {transaction.itemsMismatch}
							</Badge>
						{/if}
					{:else}
						<p class="text-subtle text-sm">None.</p>
					{/if}
				</div>

				<!--
					The old app's attachments accordion, open by default. A tile
					opens the file's own sheet; a change saves at once, sending
					the whole set, as the form does (TXN-13).
				-->
				<Accordion.Root type="multiple" value={['attachments']}>
					<Accordion.Item value="attachments" class="border-none">
						<Accordion.Trigger>{t('files.attachments')}</Accordion.Trigger>
						<Accordion.Content class="flex flex-col gap-4 pt-1">
							{#if attached.length > 0}
								<div class="mb-4 grid grid-cols-3 gap-2">
									{#each attached as file (file.id)}
										<FileTile
											{file}
											{...tile}
											onopen={onOpenFile}
											onremove={canEdit
												? (removed) =>
														onAttachmentsChange?.(
															attached.filter((candidate) => candidate.id !== removed.id)
														)
												: undefined}
										/>
									{/each}
								</div>
							{/if}

							{#if canEdit}
								<div class="mb-4 flex items-center justify-between gap-4">
									<Button
										variant="outline"
										size="caps"
										class="flex-1"
										onclick={() => (pickerOpen = true)}
									>
										<Plus class="h-3.5 w-3.5" />
										{t('files.add_or_upload')}
									</Button>
								</div>
								<FilePicker
									bind:open={pickerOpen}
									selected={attached}
									onconfirm={(files) => onAttachmentsChange?.(files)}
									{...picker}
								/>
							{/if}
						</Accordion.Content>
					</Accordion.Item>
				</Accordion.Root>

				<!--
					The old app's related debts: each debt this row made, or the
					payment it is, with the contact and the figure, opening the
					debt (DEBT-12). A writer may make a debt from the row.
				-->
				{#if related.length > 0 || (canEdit && onCreateDebt)}
					<Accordion.Root type="multiple" value={['debts']}>
						<Accordion.Item value="debts" class="border-none">
							<Accordion.Trigger>{t('txn.related_debts')}</Accordion.Trigger>
							<Accordion.Content class="space-y-3 pt-1">
								{#if related.length > 0}
									<div class="mb-2 grid grid-cols-1 gap-2">
										{#each related as item (item.key)}
											<a
												href={debtHref?.(item.debt.id)}
												class="border-muted/20 bg-muted/5 flex flex-col gap-1 rounded-md border px-3 py-2.5 text-sm"
											>
												<div class="flex items-center justify-between">
													<span class="max-w-[200px] truncate font-medium">
														{item.debt.contact_name || t('txn.unknown_contact')}
													</span>
													<span
														class={cn(
															'font-serif tracking-tight',
															item.debt.type === 'payable' ? 'text-red' : 'text-green'
														)}
													>
														{formatMoney(item.amount, item.debt.currency_code)}
													</span>
												</div>
												{#if item.debt.description}
													<span class="text-muted-foreground line-clamp-1 text-[11px]">
														{item.debt.description}
													</span>
												{/if}
											</a>
										{/each}
									</div>
								{/if}
								{#if canEdit && onCreateDebt}
									<Button variant="outline" size="caps" class="w-full" onclick={onCreateDebt}>
										<Plus class="h-3.5 w-3.5" />
										{t('txn.create_debt')}
									</Button>
								{/if}
							</Accordion.Content>
						</Accordion.Item>
					</Accordion.Root>
				{/if}

				<!--
					Why this number is what it is, at the row the user is looking at
					(OPS-8). It matters most for writes the assistant made, which is
					the case where a user can least reconstruct what happened, so the
					surface is named beside the actor.
				-->
				{#if transaction.history?.length}
					<div class="space-y-2">
						<p class="text-subtle text-xs tracking-widest uppercase">History</p>
						<ul class="space-y-2">
							{#each transaction.history as entry (entry.id)}
								<li class="text-xs">
									<span class="text-subtle font-mono">{entry.at}</span>
									<span class="ml-2">{entry.what}</span>
									<span class="text-subtle ml-1">by {entry.who} · {entry.source}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
