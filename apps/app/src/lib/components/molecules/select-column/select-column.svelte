<script lang="ts" module>
	/** Chosen when a field is mapped to no column at all. */
	export const NO_COLUMN = '__none__';
</script>

<script lang="ts">
	/**
	 * The column picker the import mapping uses.
	 *
	 * The columns come out of the file somebody just uploaded, so the list is
	 * as dynamic as a list gets and takes the app's own picker rather than a
	 * native `<select>` (D79). Column names are long and arrive in whatever
	 * order the file had, so this one always searches.
	 */
	import { Select } from '../select/index.js';

	let {
		columns,
		/** A column name, or `NO_COLUMN`. */
		value = $bindable(),
		onChange,
		placeholder = 'Select column',
		noneLabel = 'None',
		searchPlaceholder = 'Search columns',
		ariaLabel,
		disabled = false,
		id,
		class: className
	}: {
		columns: string[];
		value?: string;
		onChange?: (column: string) => void;
		placeholder?: string;
		/** The row that maps the field to nothing. */
		noneLabel?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const items = $derived([
		{ value: NO_COLUMN, label: noneLabel },
		...columns.map((column) => ({ value: column, label: column }))
	]);
</script>

<Select
	{id}
	{items}
	bind:value
	{onChange}
	{placeholder}
	{disabled}
	{ariaLabel}
	{searchPlaceholder}
	class={className}
/>
