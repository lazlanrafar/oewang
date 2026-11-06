<script lang="ts">
	/**
	 * The currency picker.
	 *
	 * Its options are every currency in the newest daily rate snapshot (FX-2,
	 * D96), loaded once by the dashboard layout and published through
	 * `$lib/workspace-data.svelte.ts`, so a call site needs no list (D80):
	 * `<SelectCurrency bind:value />` is the whole call. Each row shows what
	 * one unit is worth in the workspace currency, which comes first.
	 *
	 * A `currencies` list, when given, wins: a page outside the dashboard has
	 * no snapshot to read, and a specimen has no session at all. With neither,
	 * the workspace's own wallet currencies are offered, so a rate source
	 * that has never answered still leaves a usable picker.
	 *
	 * The list is data, so it gets the app's own picker rather than a native
	 * `<select>` (D79). No mark beside the code: a currency is not an account.
	 */
	import { formatRate } from '$lib/money';
	import { workspaceLists } from '$lib/workspace-data.svelte';

	import { Select, type SelectItem } from '../select/index.js';

	let {
		currencies,
		value = $bindable(),
		onChange,
		placeholder = 'Currency',
		searchPlaceholder = 'Search currency',
		ariaLabel,
		/** Posts the code, since the trigger is a button. */
		name,
		disabled = false,
		updating = false,
		inDataTable = false,
		id,
		class: className
	}: {
		/** ISO codes. Omitted, the snapshot's currencies, with their rates. */
		currencies?: string[];
		value?: string;
		onChange?: (code: string) => void;
		placeholder?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		name?: string;
		disabled?: boolean;
		updating?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const lists = workspaceLists();

	const items = $derived.by<SelectItem[]>(() => {
		let rows: SelectItem[];

		if (currencies) {
			rows = currencies.map((code) => ({ value: code, label: code }));
		} else if (lists.currencies.length > 0) {
			// The first row is the workspace currency, at one: it needs no
			// figure, and every other figure is in it.
			const home = lists.currencies[0].code;
			rows = lists.currencies.map((currency, index) => ({
				value: currency.code,
				label: currency.code,
				detail: index === 0 ? undefined : `${formatRate(currency.rate)} ${home}`
			}));
		} else {
			const codes = [...new Set(lists.wallets.map((wallet) => wallet.currency_code))];
			rows = codes.map((code) => ({ value: code, label: code }));
		}

		// A value the list does not carry, such as an old transaction's
		// currency the source has since dropped, is still shown as chosen.
		if (value && !rows.some((row) => row.value === value)) {
			rows = [{ value, label: value }, ...rows];
		}
		return rows;
	});
</script>

<Select
	{id}
	{items}
	bind:value
	{onChange}
	{placeholder}
	{disabled}
	{updating}
	{ariaLabel}
	{name}
	{searchPlaceholder}
	searchable={items.length >= 8}
	variant={inDataTable ? 'in-cell' : 'outline'}
	class={className}
/>
