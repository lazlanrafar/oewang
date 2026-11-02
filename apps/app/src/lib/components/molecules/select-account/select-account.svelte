<script lang="ts">
	/**
	 * Ported from the old app's molecules/select-account.
	 *
	 * The account picker, with the landmark mark beside the name. Inside a
	 * data table it is borderless and fills the cell, which is the class
	 * string the old transaction columns pass it verbatim.
	 *
	 * Accounts come in as a prop. The old component fetched them itself; here
	 * a component that fetches is a mistake, so the page loads them once and
	 * every cell shares the list.
	 */
	import Landmark from '@lucide/svelte/icons/landmark';

	import { Combobox, type ComboboxItem } from '../combobox/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { cn } from '$lib/utils.js';

	let {
		accounts,
		value = $bindable(),
		onChange,
		onCreate,
		placeholder = 'Select account',
		disabled = false,
		updating = false,
		inDataTable = false,
		id,
		class: className
	}: {
		accounts: ComboboxItem[];
		value?: string;
		onChange?: (id: string) => void;
		onCreate?: (name: string) => void;
		placeholder?: string;
		disabled?: boolean;
		/** Shows the spinner the old cell shows while a change is in flight. */
		updating?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();
</script>

<div class={cn('relative', inDataTable && 'h-full w-full')}>
	<Combobox
		{id}
		items={accounts}
		bind:value
		onSelect={onChange}
		{onCreate}
		{placeholder}
		disabled={disabled || updating}
		searchPlaceholder="Search account"
		variant={inDataTable ? 'ghost' : 'outline'}
		triggerClass={cn(
			inDataTable &&
				'h-full w-full justify-start border-none px-3 hover:bg-transparent max-w-[280px]',
			className
		)}
	>
		{#snippet selected(item)}
			<span class="flex items-center space-x-2">
				<Landmark class="text-subtle size-3 shrink-0" aria-hidden="true" />
				<span class="text-body max-w-[90%] truncate text-left font-medium">{item.label}</span>
			</span>
		{/snippet}
		{#snippet item(entry)}
			<span class="flex items-center space-x-2 py-1">
				<Landmark class="text-subtle size-3 shrink-0" aria-hidden="true" />
				<span class="text-body line-clamp-1 font-medium">{entry.label}</span>
			</span>
		{/snippet}
	</Combobox>

	{#if updating}
		<div class="bg-background/50 absolute inset-0 z-20 flex items-center justify-center">
			<Spinner size={12} />
		</div>
	{/if}
</div>
