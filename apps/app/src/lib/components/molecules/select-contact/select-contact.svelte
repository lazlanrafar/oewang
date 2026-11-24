<script lang="ts" module>
	export type ContactItem = { id: string; name: string };
</script>

<script lang="ts">
	/**
	 * Ported from the old app's molecules/select-contact.
	 *
	 * The contact picker (D79, D80). The contacts come from the workspace, so
	 * this is the app's own picker, never a native `<select>`. With no
	 * `contacts` prop it reads the workspace's list, published by the
	 * dashboard layout: `<SelectContact creatable />` is the whole call.
	 * `creatable` makes the typed name a contact in this session's workspace
	 * (AUTH-4) and selects it.
	 */
	import { createInWorkspace, workspaceLists } from '$lib/workspace-data.svelte';

	import { Select } from '../select/index.js';

	let {
		contacts,
		creatable = false,
		/** Contact ids the list leaves out, such as the one being merged. */
		exclude = [],
		value = $bindable(),
		onChange,
		createLabel,
		placeholder = 'Select contact',
		searchPlaceholder = 'Search contacts',
		ariaLabel,
		disabled = false,
		inDataTable = false,
		id,
		class: className
	}: {
		/** Omitted, the workspace's own contacts. */
		contacts?: ContactItem[];
		creatable?: boolean;
		exclude?: string[];
		value?: string;
		onChange?: (id: string) => void;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		placeholder?: string;
		searchPlaceholder?: string;
		ariaLabel?: string;
		disabled?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const lists = workspaceLists();

	const items = $derived(
		(contacts ?? lists.contacts)
			.filter((contact) => !exclude.includes(contact.id))
			.map((contact) => ({ value: contact.id, label: contact.name }))
	);

	const create = $derived(
		creatable
			? async (name: string) => {
					const created = await createInWorkspace.contact(name);
					if (created) {
						value = created.id;
						onChange?.(created.id);
					}
				}
			: undefined
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
	{ariaLabel}
	{searchPlaceholder}
	variant={inDataTable ? 'in-cell' : 'outline'}
	class={className}
/>
