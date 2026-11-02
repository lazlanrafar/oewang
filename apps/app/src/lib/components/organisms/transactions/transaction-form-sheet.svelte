<script lang="ts">
	/**
	 * Ported from the old app's transaction-form-sheet, laid out to the rules
	 * in its SHEET_GUIDE: content at `p-0`, a header with no border, a body
	 * that scrolls with `pb-[100px]` so the last field clears the footer, and
	 * a footer absolutely positioned over the body with one full-width submit
	 * and no cancel, because the overlay and Escape already close the sheet.
	 *
	 * The sheet is a container and nothing more. The fields live in
	 * `transaction-form-fields.svelte`, which the page also renders inside
	 * `<noscript>` as a plain form, so there is one field set rather than two
	 * that drift.
	 *
	 * Trimmed from the old 907 lines: that sheet also assigns a member and
	 * carries budget and quota warnings, neither of which this product has.
	 */
	import { Button } from '../../atoms/button/index.js';
	import * as Sheet from '../../atoms/sheet/index.js';
	import type { CategoryItem } from '../../molecules/select-category/index.js';
	import type { ComboboxItem } from '../../molecules/combobox/index.js';
	import TransactionFormFields, { type TransactionDraft } from './transaction-form-fields.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		draft = $bindable(),
		attachments = $bindable([]),
		accounts,
		categories,
		currencies = ['IDR', 'USD', 'EUR', 'SGD'],
		baseCurrency = 'IDR',
		walletCurrency = baseCurrency,
		suggestedRate = null,
		saving = false,
		fieldErrors,
		/** The form action this sheet posts to, so the page owns the write. */
		action = '?/create',
		enhance,
		onCreateAccount,
		onCreateCategory
	}: {
		open?: boolean;
		/** Fires when the primitive closes itself, on Escape or the overlay. */
		onOpenChange?: (open: boolean) => void;
		draft: TransactionDraft;
		attachments?: import('../../molecules/file-dropzone/index.js').UploadedFile[];
		accounts: ComboboxItem[];
		categories: CategoryItem[];
		currencies?: string[];
		baseCurrency?: string;
		walletCurrency?: string;
		suggestedRate?: string | null;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		action?: string;
		/**
		 * SvelteKit's `enhance`, passed in so the page decides what a save
		 * means. Without it the form posts natively, which is also correct.
		 */
		enhance?: (node: HTMLFormElement) => void;
		onCreateAccount?: (name: string) => void;
		onCreateCategory?: (name: string) => void;
	} = $props();

	const editing = $derived(!!draft.id);

	/** A no-op action, so a caller that passes no `enhance` posts natively. */
	const progressive = (node: HTMLFormElement) => enhance?.(node);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<form method="POST" {action} use:progressive class="flex h-full flex-col">
			{#if draft.id}
				<input type="hidden" name="id" value={draft.id} />
			{/if}

			<Sheet.Header class="shrink-0 px-6 pt-6">
				<Sheet.Title class="text-lg">
					{editing ? 'Edit transaction' : 'Create transaction'}
				</Sheet.Title>
				<Sheet.Description class="sr-only">
					{editing ? 'Change this transaction.' : 'Add a transaction by hand.'}
				</Sheet.Description>
			</Sheet.Header>

			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
				<TransactionFormFields
					bind:draft
					bind:attachments
					{accounts}
					{categories}
					{currencies}
					{baseCurrency}
					{walletCurrency}
					{suggestedRate}
					{fieldErrors}
					{onCreateAccount}
					{onCreateCategory}
				/>
			</div>

			<!-- Over the body rather than below it, with no rule: the guide's
			     footer, so the last field scrolls under it cleanly. -->
			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button type="submit" class="w-full" loading={saving}>
					{editing ? 'Save changes' : 'Create transaction'}
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
