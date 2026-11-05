<script lang="ts">
	/**
	 * Ported from the old app's molecules/select-account.
	 *
	 * The account picker: the app's `Select` with the landmark mark beside
	 * the name. Everything that is not the mark — the trigger, the panel,
	 * the in-cell variant, the spinner — belongs to `molecules/select`, so
	 * this file holds the account's part and nothing else.
	 *
	 * The list is the workspace's own, so it does not have to be passed:
	 * with no `accounts` prop the picker reads the lists the dashboard
	 * layout loaded and published, which is also the only workspace this
	 * session can see (AUTH-4). A caller with a list of its own, such as a
	 * design-system specimen or a filtered subset, passes `accounts` and
	 * that wins.
	 *
	 * The component still fetches nothing itself. `creatable` wires the
	 * create row to the workspace route, which is the one call it makes, and
	 * only when the caller asks for it.
	 */
	import Landmark from '@lucide/svelte/icons/landmark';

	import { createInWorkspace, workspaceLists } from '$lib/workspace-data.svelte';

	import type { ComboboxItem } from '../combobox/index.js';
	import { Select } from '../select/index.js';

	let {
		accounts,
		creatable = false,
		value = $bindable(),
		onChange,
		onCreate,
		createLabel,
		placeholder = 'Select account',
		disabled = false,
		updating = false,
		inDataTable = false,
		id,
		class: className
	}: {
		/** Omitted, the workspace's own accounts. */
		accounts?: ComboboxItem[];
		/**
		 * Offer a create row. The account is made in this session's
		 * workspace and then selected; `onCreate` overrides what that does.
		 */
		creatable?: boolean;
		value?: string;
		onChange?: (id: string) => void;
		onCreate?: (name: string) => void;
		/** The create row's text, resolved by the caller (UI-1). */
		createLabel?: (typed: string) => string;
		placeholder?: string;
		disabled?: boolean;
		/** Shows the spinner the old cell shows while a change is in flight. */
		updating?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const lists = workspaceLists();

	const options = $derived(
		accounts ?? lists.wallets.map((wallet) => ({ id: wallet.id, label: wallet.name }))
	);
	const items = $derived(options.map((account) => ({ value: account.id, label: account.label })));

	const create = $derived(
		onCreate ??
			(creatable
				? async (name: string) => {
						const created = await createInWorkspace.wallet(name);
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
	searchPlaceholder="Search account"
	mark={{ icon: Landmark }}
	variant={inDataTable ? 'in-cell' : 'outline'}
	class={className}
/>
