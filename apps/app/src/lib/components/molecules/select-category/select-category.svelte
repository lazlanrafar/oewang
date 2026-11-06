<script lang="ts" module>
	export type CategoryItem = { id: string; label: string; colorClass?: string };
</script>

<script lang="ts">
	/**
	 * Ported from the old app's molecules/select-category.
	 *
	 * The category picker: the app's `Select` with a square beside the name
	 * in the category's type colour, income or expense, which is the user's
	 * own choice of the two (D100). A category whose type is not known
	 * falls back to the colour the caller gave, then to grey. The create row
	 * carries the colour of the type it files under.
	 *
	 * With no `categories` prop it reads the workspace's own list, published
	 * by the dashboard layout, and `type` narrows it to the income or the
	 * expense half: `<SelectCategory type="expense" />` is the whole call.
	 * That list is this session's workspace and no other (AUTH-4). A caller
	 * with its own list passes `categories`, which wins.
	 */
	import { categoryColorClass } from '$lib/colors';
	import { createInWorkspace, workspaceLists } from '$lib/workspace-data.svelte';

	import { Select } from '../select/index.js';

	let {
		categories,
		type,
		creatable = false,
		value = $bindable(),
		onChange,
		onCreate,
		createLabel,
		placeholder = 'Select category',
		disabled = false,
		updating = false,
		inDataTable = false,
		id,
		class: className
	}: {
		/** Omitted, the workspace's own categories. */
		categories?: CategoryItem[];
		/**
		 * Which half of the list to offer. A category is income or expense,
		 * and a form that is recording one should not be offering the other.
		 * It is also the type a created category is filed under.
		 */
		type?: 'income' | 'expense';
		/**
		 * Offer a create row. The category is made in this session's
		 * workspace, under `type`, and then selected.
		 */
		creatable?: boolean;
		value?: string;
		onChange?: (id: string) => void;
		onCreate?: (name: string) => void;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		placeholder?: string;
		disabled?: boolean;
		updating?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const lists = workspaceLists();

	/** Each category's type, so a caller's own list is filtered and coloured too. */
	const typeOf = $derived(new Map(lists.categories.map((category) => [category.id, category.type])));

	/*
	 * `type` narrows a caller's own list as well as the workspace's: a row
	 * recording an expense must not be offered an income category because
	 * its page happened to pass the whole list. An entry whose type is not
	 * known, such as a "none" row, stays, and so does the current value, so
	 * an older row filed under the other type still shows what it holds.
	 */
	const options = $derived<CategoryItem[]>(
		(
			categories ??
			lists.categories.map((category) => ({ id: category.id, label: category.name }))
		).filter((category) => {
			const known = typeOf.get(category.id);
			return !type || !known || known === type || category.id === value;
		})
	);

	const items = $derived(
		options.map((category) => {
			const known = typeOf.get(category.id);
			return {
				value: category.id,
				label: category.label,
				colorClass: known ? categoryColorClass(known) : category.colorClass
			};
		})
	);

	/*
	 * A created category needs a type, and only the caller knows which, so
	 * the create row is offered only where one was stated. Guessing would
	 * file half of them in the wrong half of the list, where the picker that
	 * needed them cannot see them.
	 */
	const create = $derived(
		onCreate ??
			(creatable && type
				? async (name: string) => {
						const created = await createInWorkspace.category(name, type);
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
	searchPlaceholder="Search category"
	mark={{ colorClass: categoryColorClass(type) }}
	variant={inDataTable ? 'in-cell' : 'outline'}
	class={className}
/>
