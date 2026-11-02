<script lang="ts">
	/**
	 * Ported from the old app's transaction-detail-sheet, laid out to variant
	 * 3 of its SHEET_GUIDE: content at `p-0`, a header row with a rule and
	 * `bg-muted/5` carrying the title, a subtitle in small caps and the
	 * actions, and a body that scrolls with `space-y-6`. No footer: the
	 * actions live in the header.
	 */
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { Button } from '../../atoms/button/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import { cn } from '$lib/utils.js';

	let {
		open = $bindable(false),
		transaction,
		onEdit,
		onDelete
	}: {
		open?: boolean;
		transaction?: {
			name: string;
			amount: string;
			date: string;
			account: string;
			category: string;
			notes?: string;
			attachments?: string[];
			history?: Array<{ at: string; who: string; what: string }>;
		};
		onEdit?: () => void;
		onDelete?: () => void;
	} = $props();

	const income = $derived(transaction?.amount.startsWith('+') ?? false);
</script>

<Sheet.Root bind:open>
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
				<div class="flex items-center gap-2">
					<!--
						Edit closes this sheet through the primitive's own Close, not by
						flipping a flag: the page then opens the form once the overlay
						is gone. Opening a second sheet while the first unmounts leaves
						both shut.
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
			</Sheet.Header>

			<div class="flex-1 space-y-6 overflow-y-auto px-6 py-6">
				<div>
					<p class={cn('font-serif text-4xl select-text', income ? 'text-green' : 'text-red')}>
						{transaction.amount}
					</p>
				</div>

				<dl class="grid grid-cols-2 gap-x-6 gap-y-4">
					<div class="space-y-1">
						<dt class="text-subtle text-xs tracking-widest uppercase">Account</dt>
						<dd class="text-sm font-medium">{transaction.account}</dd>
					</div>
					<div class="space-y-1">
						<dt class="text-subtle text-xs tracking-widest uppercase">Category</dt>
						<dd class="text-sm font-medium">{transaction.category}</dd>
					</div>
				</dl>

				{#if transaction.notes}
					<div class="space-y-1">
						<p class="text-subtle text-xs tracking-widest uppercase">Note</p>
						<p class="text-sm leading-relaxed wrap-break-word">{transaction.notes}</p>
					</div>
				{/if}

				<div class="space-y-2">
					<p class="text-subtle text-xs tracking-widest uppercase">Attachments</p>
					{#if transaction.attachments?.length}
						<ul class="space-y-2">
							{#each transaction.attachments as file (file)}
								<li
									class="border-muted/20 bg-muted/5 flex items-center gap-2 border px-3 py-2.5 text-sm"
								>
									<Paperclip class="text-subtle size-3.5 shrink-0" />
									<span class="truncate">{file}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-subtle text-sm">None yet.</p>
					{/if}
				</div>

				{#if transaction.history?.length}
					<div class="space-y-2">
						<p class="text-subtle text-xs tracking-widest uppercase">History</p>
						<ul class="space-y-2">
							{#each transaction.history as entry (entry.at)}
								<li class="text-xs">
									<span class="text-subtle font-mono">{entry.at}</span>
									<span class="ml-2">{entry.what}</span>
									<span class="text-subtle ml-1">by {entry.who}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
