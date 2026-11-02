<script lang="ts">
	/**
	 * The combobox, in the two shapes the live app uses it in.
	 *
	 * `inline` is the in-cell editor: a borderless button sized to the cell
	 * that opens the same list. The live app builds it the same way, as a
	 * button with aria-haspopup="dialog" rather than a native select, which is
	 * why the trigger here is a button and not an <select>.
	 */
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';

	import * as Command from '$lib/components/ui/command';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';

	let {
		options,
		value = $bindable(),
		inline = false,
		id,
		placeholder = 'Search...'
	}: {
		options: string[];
		value: string;
		inline?: boolean;
		id?: string;
		placeholder?: string;
	} = $props();

	let open = $state(false);
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		{id}
		class={cn(
			'flex h-9 items-center justify-between gap-2 text-sm',
			inline ? 'w-full px-0 text-left' : 'w-full border px-3 focus:border-primary'
		)}
		role="combobox"
		aria-expanded={open}
	>
		{value}
		{#if !inline}
			<ChevronsUpDown class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
		{/if}
	</Popover.Trigger>
	<Popover.Content class="w-56 p-0" align="start">
		<Command.Root>
			<Command.Input {placeholder} />
			<Command.List>
				<Command.Empty>No match.</Command.Empty>
				<Command.Group>
					{#each options as option (option)}
						<Command.Item
							value={option}
							onSelect={() => {
								value = option;
								open = false;
							}}
						>
							<Check
								class={cn('size-4', value === option ? 'opacity-100' : 'opacity-0')}
								aria-hidden="true"
							/>
							{option}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
