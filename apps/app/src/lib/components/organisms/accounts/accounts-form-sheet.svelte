<script lang="ts">
	/**
	 * The account form's container, laid out to the SHEET_GUIDE rules the
	 * transaction form sheet follows: content at `p-0`, a header with no rule,
	 * a body that scrolls with `pb-[100px]` so the last field clears the
	 * footer, and a footer over the body with one full-width submit and no
	 * cancel, because the overlay and Escape already close the sheet.
	 *
	 * The sheet is a container and nothing more. The fields live in
	 * `accounts-form-fields.svelte`, which the page also renders inside
	 * `<noscript>` as a plain form, so there is one field set rather than two
	 * that drift.
	 *
	 * It writes nothing itself. The form posts to the page's action, and the
	 * page decides what a save means by passing its own `enhance`.
	 */
	import { Button } from '$lib/components/atoms/button';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { t } from '$lib/i18n';
	import type { Wallet } from '$lib/server/ledger';

	import AccountFormFields from './accounts-form-fields.svelte';

	let {
		open = $bindable(false),
		onOpenChange,
		account = null,
		groups,
		baseCurrency,
		currencyLocked = false,
		saving = false,
		fieldErrors,
		createLabel,
		enhance
	}: {
		open?: boolean;
		/** Fires when the primitive closes itself, on Escape or the overlay. */
		onOpenChange?: (open: boolean) => void;
		/** The account being edited, or null to create one. */
		account?: Wallet | null;
		/** Omitted, the workspace's own groups. */
		groups?: { id: string; name: string }[];
		baseCurrency: string;
		currencyLocked?: boolean;
		saving?: boolean;
		fieldErrors?: Record<string, string>;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		/**
		 * SvelteKit's `enhance`, passed in so the page owns the save. Without
		 * it the form posts natively, which is also correct.
		 */
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const editing = $derived(!!account);

	/** A no-op action, so a caller that passes no `enhance` posts natively. */
	const progressive = (node: HTMLFormElement) => enhance?.(node);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		<form
			method="POST"
			action={account ? '?/updateWallet' : '?/createWallet'}
			use:progressive
			class="flex h-full flex-col"
		>
			{#if account}
				<input type="hidden" name="id" value={account.id} />
			{/if}

			<Sheet.Header class="shrink-0 px-6 pt-6">
				<Sheet.Title class="text-lg">
					{editing ? t('accounts.edit') : t('accounts.new')}
				</Sheet.Title>
				<Sheet.Description class="sr-only">
					{editing ? t('accounts.edit') : t('accounts.empty_description')}
				</Sheet.Description>
			</Sheet.Header>

			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
				<AccountFormFields
					{account}
					{groups}
					{baseCurrency}
					{currencyLocked}
					{fieldErrors}
					{createLabel}
				/>
			</div>

			<!-- Over the body rather than below it, with no rule: the guide's
			     footer, so the last field scrolls under it cleanly. -->
			<div class="bg-background absolute inset-x-0 bottom-0 p-6">
				<Button type="submit" class="w-full" loading={saving}>
					{editing ? t('common.save') : t('common.create')}
				</Button>
			</div>
		</form>
	</Sheet.Content>
</Sheet.Root>
