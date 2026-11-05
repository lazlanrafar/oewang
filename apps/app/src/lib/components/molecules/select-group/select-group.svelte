<script lang="ts" module>
	export type GroupItem = { id: string; name: string };

	/**
	 * "Ungrouped" as a value rather than an absent one.
	 *
	 * The picker holds a string, and an empty string reads as nothing
	 * chosen, which is a different statement from "deliberately in no
	 * group". Callers map it back to the empty string the API expects.
	 */
	export const UNGROUPED = '__ungrouped__';
</script>

<script lang="ts">
	/**
	 * The account group picker.
	 *
	 * The groups come from the workspace, so this is a dynamic list and gets
	 * the app's own picker rather than a native `<select>` (D79): a native
	 * drop-down is drawn by the operating system, in its own type, at its own
	 * size, with a tick nobody chose, and none of it can be styled.
	 *
	 * Always the combobox, never the plain engine: the account, category and
	 * group pickers sit in the same kind of cell, and a reader should not
	 * have to work out why one of them has a different chevron. A workspace
	 * with three groups carries a search box it does not need, which is a
	 * smaller price than a control that changes shape with the row count.
	 */
	import { createInWorkspace, workspaceLists } from '$lib/workspace-data.svelte';

	import { Select } from '../select/index.js';

	let {
		groups,
		creatable = false,
		/** The group id, or `UNGROUPED`. */
		value = $bindable(),
		onChange,
		onCreate,
		createLabel,
		placeholder = 'Select group',
		ungroupedLabel = 'Ungrouped',
		searchPlaceholder = 'Search groups',
		ariaLabel,
		disabled = false,
		updating = false,
		inDataTable = false,
		id,
		class: className
	}: {
		/** Omitted, the workspace's own groups. */
		groups?: GroupItem[];
		/**
		 * Offer a create row. The group is made in this session's workspace
		 * and then selected.
		 */
		creatable?: boolean;
		value?: string;
		onChange?: (id: string) => void;
		onCreate?: (name: string) => void;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		placeholder?: string;
		ungroupedLabel?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		updating?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const lists = workspaceLists();

	const options = $derived(groups ?? lists.groups);

	const items = $derived([
		{ value: UNGROUPED, label: ungroupedLabel },
		...options.map((group) => ({ value: group.id, label: group.name }))
	]);

	const create = $derived(
		onCreate ??
			(creatable
				? async (name: string) => {
						const created = await createInWorkspace.group(name);
						if (created) {
							value = created.id;
							onChange?.(created.id);
						}
					}
				: undefined)
	);
</script>

<Select
	{id}
	{items}
	bind:value
	{onChange}
	onCreate={create}
	{createLabel}
	{placeholder}
	{disabled}
	{updating}
	{ariaLabel}
	{searchPlaceholder}
	variant={inDataTable ? 'in-cell' : 'outline'}
	class={className}
/>
