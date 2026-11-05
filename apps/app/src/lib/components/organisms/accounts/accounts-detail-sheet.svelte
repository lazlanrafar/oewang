<script lang="ts">
	/**
	 * One account, edited in place.
	 *
	 * Ported from the old app's `account-detail-sheet.tsx`, with the part that
	 * made it dangerous taken out. That sheet debounced the name field by 500
	 * milliseconds and wrote it over the network with nothing on screen to say
	 * so, and it moved a balance by PATCHing the column. Here every write is a
	 * form action the reader starts: an explicit submit for the name, a change
	 * for the group and the totals switch, and a blur for the balance, which
	 * posts to `?/adjustBalance` so the API records the transaction that
	 * explains the new figure rather than overwriting a column (TXN-3).
	 *
	 * The component writes nothing itself. Each form posts to the page's
	 * action, and the page decides what a save means through `enhance`. With
	 * JavaScript off the name form still works, because its save is a real
	 * submit button; the three that submit on change need script, and say so
	 * by doing nothing rather than by silently dropping a write.
	 *
	 * Money is a decimal string from the API to the DOM. Nothing here parses
	 * one (D12), and the only arithmetic is `inBaseCurrency`, which multiplies
	 * decimal strings.
	 */
	import { tick } from 'svelte';

	import Landmark from '@lucide/svelte/icons/landmark';

	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import { Separator } from '$lib/components/atoms/separator';
	import * as Sheet from '$lib/components/atoms/sheet';
	import { Switch } from '$lib/components/atoms/switch';
	import { CurrencyInput } from '$lib/components/molecules/currency-input';
	import { t } from '$lib/i18n';
	import { compareDecimals, currencyDigits, currencySymbol, formatMoney } from '$lib/money';
	import type { Wallet } from '$lib/server/ledger';
	import { SelectGroup, UNGROUPED } from '$lib/components/molecules/select-group';
	import { inBaseCurrency } from '$lib/wallets';

	let {
		open = $bindable(false),
		onOpenChange,
		account,
		groups,
		baseCurrency,
		rates,
		saving = false,
		enhance
	}: {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		/** Null while nothing is selected, so the sheet renders empty. */
		account: Wallet | null;
		groups: { id: string; name: string }[];
		/** The workspace currency, which the balance is also shown in. */
		baseCurrency: string;
		/** Today's rate per foreign currency code. A missing one hides the figure. */
		rates: Record<string, string>;
		saving?: boolean;
		enhance?: (node: HTMLFormElement) => void;
	} = $props();

	const locale = 'en-GB';

	/** A no-op action, so a caller that passes no `enhance` posts natively. */
	const progressive = (node: HTMLFormElement) => enhance?.(node);

	let editingBalance = $state(false);
	/** What the reader has typed, as a decimal string. */
	let typed = $state('');
	let balanceBox = $state<HTMLDivElement | null>(null);
	let balanceForm = $state<HTMLFormElement | null>(null);
	let totalsForm = $state<HTMLFormElement | null>(null);

	/**
	 * Closing the sheet puts the balance back into read mode.
	 *
	 * Not derivable: the flag is also set by a click, so there is no
	 * expression to compute it from. The effect only ever clears it.
	 */
	$effect(() => {
		if (!open) editingBalance = false;
	});

	function startEditing() {
		typed = account?.balance ?? '';
		editingBalance = true;
	}

	/**
	 * Leave edit mode, and write only when the figure actually moved.
	 *
	 * `compareDecimals` rather than a string comparison: `812500` and
	 * `812500.00` are the same money, and posting that pair would record an
	 * adjustment transaction for nothing.
	 */
	function commit() {
		editingBalance = false;
		if (!account) return;

		const next = typed.trim();
		if (next === '' || next === '-') return;
		if (compareDecimals(next, account.balance) === 0) return;

		balanceForm?.requestSubmit();
	}

	/**
	 * Focus the balance input, and wire Enter and blur to it directly.
	 *
	 * Listeners go on the input rather than on a wrapper because `blur` does
	 * not bubble, and because a div that answers keystrokes is an element
	 * pretending to be a control. Enter blurs rather than submitting, so one
	 * path writes the figure.
	 */
	$effect(() => {
		if (!editingBalance) return;

		const input = balanceBox?.querySelector('input');
		if (!input) return;

		input.focus();
		input.select();

		const onKeydown = (event: KeyboardEvent) => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			input.blur();
		};
		const onBlur = () => commit();

		input.addEventListener('keydown', onKeydown);
		input.addEventListener('blur', onBlur);

		return () => {
			input.removeEventListener('keydown', onKeydown);
			input.removeEventListener('blur', onBlur);
		};
	});

	const dateFormatter = $derived(
		new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
	);

	function formatDate(value?: string): string {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
	}

	/** The balance in the workspace currency, or null when no rate is known. */
	const converted = $derived(
		account ? inBaseCurrency(account.balance, account.currency_code, baseCurrency, rates) : null
	);

	const LABEL = 'px-1 font-medium text-[10px] text-muted-foreground uppercase tracking-widest';
	let groupForm = $state<HTMLFormElement | null>(null);
	// Seeded by the effect below rather than here: reading `account` in the
	// initialiser would capture the first one and keep showing its group
	// after the sheet was reused for another account.
	let groupValue = $state(UNGROUPED);

	/* The sheet is reused for the next account, so the field follows it. */
	$effect(() => {
		groupValue = account?.group_id ?? UNGROUPED;
	});
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content side="right" class="flex h-full flex-col p-0">
		{#if account}
			<div class="flex-1 space-y-8 overflow-y-auto p-6">
				<!-- ------------------------------------------------- header row -->
				<div class="flex items-center justify-between">
					<Sheet.Title class={LABEL + ' flex items-center gap-2 px-0'}>
						<Landmark class="text-muted-foreground/60 size-3" aria-hidden="true" />
						<span>{t('accounts.title')}</span>
					</Sheet.Title>
					<Sheet.Description class="sr-only">
						{t('accounts.empty_description')}
					</Sheet.Description>
					<span class="text-muted-foreground text-[11px] tracking-tight">
						{formatDate(account.updated_at)}
					</span>
				</div>

				<!-- --------------------------------------------------- balance -->
				<!--
					The form stays mounted in both modes: the blur that commits is
					also what leaves edit mode, and a form that unmounted on the same
					tick would have nothing left to submit.
				-->
				<form
					method="POST"
					action="?/adjustBalance"
					use:progressive
					bind:this={balanceForm}
					class="space-y-3"
				>
					<input type="hidden" name="id" value={account.id} />
					<input type="hidden" name="balance" value={typed} />

					{#if editingBalance}
						<div bind:this={balanceBox}>
							<CurrencyInput
								bind:value={typed}
								symbol={currencySymbol(account.currency_code)}
								decimals={currencyDigits(account.currency_code)}
								class={'h-auto border-0 bg-transparent p-0 dark:bg-transparent ' +
									'[&_[data-slot=input-group-addon]]:text-foreground/90 [&_[data-slot=input-group-addon]]:pl-0 [&_[data-slot=input-group-addon]]:font-serif [&_[data-slot=input-group-addon]]:text-3xl [&_[data-slot=input-group-addon]]:font-medium ' +
									'[&_input]:h-auto [&_input]:p-0 [&_input]:font-serif [&_input]:text-5xl [&_input]:font-medium [&_input]:tracking-tighter'}
							/>
						</div>
					{:else}
						<button
							type="button"
							onclick={startEditing}
							class="cursor-pointer border-none bg-transparent p-0 text-left font-serif text-5xl font-medium tracking-tighter transition-opacity hover:opacity-80"
						>
							{formatMoney(account.balance, account.currency_code)}
						</button>
					{/if}

					{#if converted && account.currency_code !== baseCurrency}
						<!-- The same balance in the workspace currency, at today's rate.
						     Absent rather than guessed when no rate is known. -->
						<p class="text-subtle text-xs">{formatMoney(converted, baseCurrency)}</p>
					{/if}

					<!-- Said before the typing, not after it: a reader should know a
					     row is about to be written while the field is still empty. -->
					<p class="text-subtle text-xs">{t('accounts.balance_hint')}</p>
				</form>

				<!-- ------------------------------------------------------ name -->
				<form method="POST" action="?/updateWallet" use:progressive class="space-y-2">
					<!-- The other columns travel with it: the action reads the whole
					     wallet from the body, so a field left out is a field blanked. -->
					<input type="hidden" name="id" value={account.id} />
					<input type="hidden" name="group_id" value={account.group_id ?? ''} />
					<input type="hidden" name="currency_code" value={account.currency_code} />
					<input
						type="hidden"
						name="is_included_in_totals"
						value={account.is_included_in_totals ? 'true' : 'false'}
					/>

					<Label for="account-detail-name" class={LABEL}>{t('accounts.col_name')}</Label>
					<div class="flex items-center gap-2">
						<Input
							id="account-detail-name"
							name="name"
							required
							value={account.name}
							class="flex-1 font-medium"
						/>
						<Button type="submit" variant="outline" loading={saving}>{t('common.save')}</Button>
					</div>
				</form>

				<!-- ----------------------------------------------------- group -->
				<form
					method="POST"
					action="?/setGroup"
					use:progressive
					bind:this={groupForm}
					class="space-y-2"
				>
					<input type="hidden" name="id" value={account.id} />

					<Label for="account-detail-group" class={LABEL}>{t('accounts.col_group')}</Label>
					<!--
						The app's picker, not a native `<select>` (D79). Its trigger
						is a button, so the value posts through the hidden input
						beside it and the choice submits the form itself, which is
						what the native one did on `change`.
					-->
					<SelectGroup
						id="account-detail-group"
						{groups}
						bind:value={groupValue}
						ungroupedLabel={t('accounts.ungrouped')}
						placeholder={t('accounts.group_placeholder')}
						searchPlaceholder={t('accounts.search_groups')}
						onChange={() => groupForm?.requestSubmit()}
					/>
					<input
						type="hidden"
						name="group_id"
						value={groupValue === UNGROUPED ? '' : groupValue}
					/>
				</form>

				<!-- -------------------------------------------- counted totals -->
				<form
					method="POST"
					action="?/updateWallet"
					use:progressive
					bind:this={totalsForm}
					class="space-y-2"
				>
					<input type="hidden" name="id" value={account.id} />
					<input type="hidden" name="name" value={account.name} />
					<input type="hidden" name="group_id" value={account.group_id ?? ''} />
					<input type="hidden" name="currency_code" value={account.currency_code} />

					<Label class={LABEL}>{t('accounts.counted')}</Label>
					<div class="bg-background/50 flex h-10 items-center justify-between border px-3">
						<Label for="account-detail-totals" class="text-[11px] font-medium">
							{t('accounts.include_in_totals')}
						</Label>
						<Switch
							id="account-detail-totals"
							name="is_included_in_totals"
							value="true"
							checked={account.is_included_in_totals}
							onCheckedChange={async () => {
								// After the flush, not during it: the switch submits
								// through the hidden checkbox it renders, and that
								// element still carries the old state when this fires.
								await tick();
								totalsForm?.requestSubmit();
							}}
						/>
						<!-- An unticked box submits nothing, and a missing field reads
						     to the action as "leave it counted". This companion sits
						     after the switch so the first entry under the name is
						     "true" when it is on and "false" when it is off. -->
						<input type="hidden" name="is_included_in_totals" value="false" />
					</div>
					<p class="text-subtle text-xs">{t('accounts.include_in_totals_hint')}</p>
				</form>

				<Separator class="bg-border" />

				<!-- -------------------------------------------------- created -->
				<div class="flex items-center justify-between">
					<Label class={LABEL}>{t('accounts.col_created')}</Label>
					<span class="text-[11px] font-medium">{formatDate(account.created_at)}</span>
				</div>
			</div>
		{/if}
	</Sheet.Content>
</Sheet.Root>
