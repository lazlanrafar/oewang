<script lang="ts">
	/**
	 * Ported from the old app's atoms/combobox.tsx, which is a button that
	 * opens a searchable list rather than a native select.
	 *
	 * `inline` is the in-cell editor the transactions table uses: borderless,
	 * sized to its cell, opening the same list.
	 */
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

	import * as Command from '../../atoms/command/index.js';
	import * as Popover from '../../atoms/popover/index.js';
	import { cn } from '$lib/utils.js';

	let {
		options,
		value = $bindable(),
		onValueChange,
		inline = false,
		id,
		placeholder = 'Search...',
		empty = 'No match.',
		class: className
	}: {
		options: Array<string | { value: string; label: string }>;
		value: string;
		/** Called with the chosen value, for callers that cannot bind. */
		onValueChange?: (value: string) => void;
		inline?: boolean;
		id?: string;
		placeholder?: string;
		empty?: string;
		class?: string;
	} = $props();

	let open = $state(false);

	const items = $derived(
		options.map((option) =>
			typeof option === 'string' ? { value: option, label: option } : option
		)
	);
	const label = $derived(items.find((item) => item.value === value)?.label ?? value);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{id}
		class={cn(
			'flex h-9 items-center justify-between gap-2 text-sm',
			inline ? 'w-full px-0 text-left' : 'focus:border-primary w-full border px-3',
			className
		)}
		role="combobox"
		aria-expanded={open}
	>
		{label}
		{#if !inline}
			<ChevronsUpDown class="text-subtle size-4 shrink-0" aria-hidden="true" />
		{/if}
	</Popover.Trigger>
	<Popover.Content class="w-56 p-0" align="start">
		<Command.Root>
			<Command.Input {placeholder} />
			<Command.List>
				<Command.Empty>{empty}</Command.Empty>
				<Command.Group>
					{#each items as item (item.value)}
						<Command.Item
							value={item.value}
							onSelect={() => {
								value = item.value;
								onValueChange?.(item.value);
								open = false;
							}}
						>
							<Check
								class={cn('size-4', value === item.value ? 'opacity-100' : 'opacity-0')}
								aria-hidden="true"
							/>
							{item.label}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
