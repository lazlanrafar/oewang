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
		ready: boolean;
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
		items?: Array<{ id: string; name: string; amount: string }>;
		attachments?: Array<{ id: string; name: string }>;
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
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { Badge } from '../../atoms/badge/index.js';
	import { Button } from '../../atoms/button/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import { cn } from '$lib/utils.js';

	let {
		open = $bindable(false),
		onOpenChange,
		transaction,
		canEdit = true,
		onEdit,
		onDelete
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		transaction?: TransactionDetail;
		canEdit?: boolean;
		onEdit?: () => void;
		onDelete?: () => void;
	} = $props();
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
					<div class="space-y-1">
						<dt class="text-subtle text-xs tracking-widest uppercase">State</dt>
						<dd class="text-sm font-medium">
							<Badge variant={transaction.ready ? 'secondary' : 'outline'}>
								{transaction.ready ? 'Ready' : 'Not ready'}
							</Badge>
						</dd>
					</div>
				</dl>

				{#if transaction.notes}
					<div class="space-y-1">
						<p class="text-subtle text-xs tracking-widest uppercase">Note</p>
						<p class="text-sm leading-relaxed wrap-break-word">{transaction.notes}</p>
					</div>
				{/if}

				<div class="space-y-2">
					<p class="text-subtle text-xs tracking-widest uppercase">Line items</p>
					{#if transaction.items?.length}
						<ul class="space-y-1">
							{#each transaction.items as item (item.id)}
								<li class="flex items-center justify-between gap-4 text-sm">
									<span class="truncate">{item.name}</span>
									<span class="shrink-0 font-mono">{item.amount}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-subtle text-sm">None.</p>
					{/if}
				</div>

				<div class="space-y-2">
					<p class="text-subtle text-xs tracking-widest uppercase">Attachments</p>
					{#if transaction.attachments?.length}
						<ul class="space-y-2">
							{#each transaction.attachments as file (file.id)}
								<li
									class="border-muted/20 bg-muted/5 flex items-center gap-2 border px-3 py-2.5 text-sm"
								>
									<Paperclip class="text-subtle size-3.5 shrink-0" />
									<span class="truncate">{file.name}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-subtle text-sm">None yet.</p>
					{/if}
				</div>

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
