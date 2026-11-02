<script lang="ts">
	/**
	 * Ported from the old app's transaction-detail-sheet, trimmed to what this
	 * product has: the amount in serif at the top, the record underneath, the
	 * note, the attachments, and the per-transaction history D46 asks for.
	 */
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	import { Button } from '../../atoms/button/index.js';
	import { Separator } from '../../atoms/separator/index.js';
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
	<Sheet.Content side="right" class="w-full sm:max-w-md">
		<Sheet.Header class="sr-only">
			<Sheet.Title>{transaction?.name ?? 'Transaction'}</Sheet.Title>
			<Sheet.Description>The full record for this transaction.</Sheet.Description>
		</Sheet.Header>

		{#if transaction}
			<div class="flex-1 overflow-y-auto px-4">
				<p class="text-subtle text-small select-text">{transaction.date}</p>
				<h1 class={cn('mt-1 font-serif text-4xl select-text', income ? 'text-green' : 'text-red')}>
					{transaction.amount}
				</h1>
				<h2 class="mt-6 mb-3 text-h3">{transaction.name}</h2>

				<Separator />

				<dl class="text-body grid grid-cols-2 gap-x-6 gap-y-3 py-4">
					<div>
						<dt class="text-subtle text-small">Account</dt>
						<dd class="font-medium">{transaction.account}</dd>
					</div>
					<div>
						<dt class="text-subtle text-small">Category</dt>
						<dd class="font-medium">{transaction.category}</dd>
					</div>
				</dl>

				{#if transaction.notes}
					<Separator />
					<div class="py-4">
						<p class="text-subtle text-small mb-1">Note</p>
						<p class="text-body max-w-[90%] leading-relaxed wrap-break-word">
							{transaction.notes}
						</p>
					</div>
				{/if}

				<Separator />
				<div class="py-4">
					<p class="text-subtle text-small mb-2">Attachments</p>
					{#if transaction.attachments?.length}
						<ul class="space-y-2">
							{#each transaction.attachments as file (file)}
								<li
									class="border-muted/20 bg-muted/5 text-body flex items-center gap-2 border px-3 py-2.5"
								>
									<Paperclip class="text-subtle size-3.5 shrink-0" />
									<span class="truncate">{file}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-subtle text-small">None yet.</p>
					{/if}
				</div>

				{#if transaction.history?.length}
					<Separator />
					<div class="py-4">
						<p class="text-subtle text-small mb-2">History</p>
						<ul class="space-y-2">
							{#each transaction.history as entry (entry.at)}
								<li class="text-small">
									<span class="text-subtle font-mono">{entry.at}</span>
									<span class="ml-2">{entry.what}</span>
									<span class="text-subtle ml-1">by {entry.who}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>

			<Sheet.Footer class="flex-row justify-end gap-2">
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
							Edit
						</Button>
					{/snippet}
				</Sheet.Close>
				<Button variant="destructive" onclick={onDelete}>
					<Trash2 />
					Delete
				</Button>
			</Sheet.Footer>
		{/if}
	</Sheet.Content>
</Sheet.Root>
