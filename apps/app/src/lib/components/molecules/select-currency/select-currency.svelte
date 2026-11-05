<script lang="ts">
	/**
	 * The currency picker.
	 *
	 * The codes come from the workspace, so the list is dynamic and gets the
	 * app's own picker rather than a native `<select>` (D79). No mark beside
	 * the code: a currency is not an account, and the bank icon this screen
	 * used to borrow said it was one.
	 */
	import { Select } from '../select/index.js';

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
		/** ISO codes, as the workspace holds them. */
		currencies: string[];
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

	const items = $derived(currencies.map((code) => ({ value: code, label: code })));
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
	searchable={currencies.length >= 8}
	variant={inDataTable ? 'in-cell' : 'outline'}
	class={className}
/>
