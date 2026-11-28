<script lang="ts">
	/**
	 * A line item's name, picked from the workspace's items (ITM-1) or typed
	 * new. Too many to load whole, so each search asks the transactions
	 * page's own server route, which asks the API (D5). The value is the name
	 * itself, posted through `name`; a name nobody bought yet is made from
	 * what was typed, the way `creatable` works on the other pickers (D80).
	 */
	import { Select, type SelectItem } from '../select/index.js';

	let {
		value = $bindable(''),
		name,
		placeholder,
		searchPlaceholder,
		createLabel,
		ariaLabel,
		disabled = false,
		id,
		class: className
	}: {
		value?: string;
		name?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		createLabel?: (typed: string) => string;
		ariaLabel?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
	} = $props();

	let found = $state<string[]>([]);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = 0;

	// The current name stays in the list whatever is typed next, so the
	// trigger keeps its label.
	const items: SelectItem[] = $derived(
		[...new Set(value ? [value, ...found] : found)].map((entry) => ({ value: entry, label: entry }))
	);

	function search(term: string) {
		clearTimeout(timer);
		timer = setTimeout(async () => {
			// Only the latest answer counts: a slow early one must not replace it.
			const mine = ++asked;
			const response = await fetch(
				`/transactions/items/suggest?search=${encodeURIComponent(term.trim())}`
			);
			if (!response.ok || mine !== asked) return;
			found = await response.json();
		}, 250);
	}
</script>

<Select
	{id}
	{items}
	bind:value
	{name}
	{placeholder}
	{searchPlaceholder}
	{createLabel}
	{ariaLabel}
	{disabled}
	onSearch={search}
	onCreate={(typed) => (value = typed)}
	class={className}
/>
