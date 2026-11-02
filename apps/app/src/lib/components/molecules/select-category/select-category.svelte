<script lang="ts" module>
	export type CategoryItem = { id: string; label: string; colorClass?: string };
</script>

<script lang="ts">
	/**
	 * Ported from the old app's molecules/select-category.
	 *
	 * The category picker, with the category's colour square beside the name,
	 * borderless and filling the cell when it sits in a data table.
	 */
	import { Combobox } from '../combobox/index.js';
	import { Spinner } from '../../atoms/spinner/index.js';
	import { cn } from '$lib/utils.js';

	let {
		categories,
		value = $bindable(),
		onChange,
		onCreate,
		placeholder = 'Select category',
		disabled = false,
		updating = false,
		inDataTable = false,
		id,
		class: className
	}: {
		categories: CategoryItem[];
		value?: string;
		onChange?: (id: string) => void;
		onCreate?: (name: string) => void;
		placeholder?: string;
		disabled?: boolean;
		updating?: boolean;
		inDataTable?: boolean;
		id?: string;
		class?: string;
	} = $props();

	const colourOf = (id: string) =>
		categories.find((category) => category.id === id)?.colorClass ?? 'bg-subtle';
</script>

<div class={cn('relative', inDataTable && 'h-full w-full')}>
	<Combobox
		{id}
		items={categories}
		bind:value
		onSelect={onChange}
		{onCreate}
		{placeholder}
		disabled={disabled || updating}
		searchPlaceholder="Search category"
		variant={inDataTable ? 'ghost' : 'outline'}
		triggerClass={cn(
			inDataTable &&
				'h-full w-full justify-start border-none px-3 hover:bg-transparent max-w-[280px]',
			className
		)}
	>
		{#snippet selected(item)}
			<span class="flex items-center space-x-2">
				<span class={cn('size-2 shrink-0', colourOf(item.id))} aria-hidden="true"></span>
				<span class="text-body max-w-[90%] truncate text-left font-medium">{item.label}</span>
			</span>
		{/snippet}
		{#snippet item(entry)}
			<span class="flex items-center space-x-2 py-1">
				<span class={cn('size-2 shrink-0', colourOf(entry.id))} aria-hidden="true"></span>
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
