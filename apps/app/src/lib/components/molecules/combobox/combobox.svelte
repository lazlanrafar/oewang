<script lang="ts" module>
	export type ComboboxItem = { id: string; label: string };
</script>

<script lang="ts">
	/**
	 * Ported from the old app's atoms/combobox.tsx: a button that opens a
	 * searchable list, rather than a native select.
	 *
	 * The parts that matter for the data table are kept: the trigger takes a
	 * button variant and a class, so a cell can hand it `ghost`, no border and
	 * the cell's full height; the chevron sits absolutely at the right edge;
	 * and the selected value, the list rows and the create row are rendered by
	 * the caller, which is how the account and category pickers put an icon
	 * beside a name.
	 */
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import type { Snippet } from 'svelte';

	import { Button, type ButtonVariant } from '../../atoms/button/index.js';
	import * as Command from '../../atoms/command/index.js';
	import * as Popover from '../../atoms/popover/index.js';
	import { cn } from '$lib/utils.js';

	let {
		items,
		value = $bindable(),
		onSelect,
		onCreate,
		placeholder = 'Select item...',
		searchPlaceholder = 'Search',
		empty = 'No match.',
		variant = 'outline',
		triggerClass,
		showChevron = true,
		disabled = false,
		id,
		selected,
		item: itemSnippet,
		create: createSnippet
	}: {
		items: ComboboxItem[];
		value?: string;
		onSelect?: (id: string) => void;
		/** Offers a row that makes a new entry from what was typed. */
		onCreate?: (label: string) => void;
		placeholder?: string;
		searchPlaceholder?: string;
		empty?: string;
		variant?: ButtonVariant;
		triggerClass?: string;
		showChevron?: boolean;
		disabled?: boolean;
		id?: string;
		/** How the chosen value is drawn in the trigger. */
		selected?: Snippet<[ComboboxItem]>;
		/** How a row is drawn in the list. */
		item?: Snippet<[ComboboxItem]>;
		/** How the create row is drawn, given what was typed. */
		create?: Snippet<[string]>;
	} = $props();

	let open = $state(false);
	let search = $state('');

	/**
	 * Whether the highlighted row is worth drawing. The command primitive
	 * highlights the first row the moment the list opens and keeps that
	 * highlight on whatever the pointer or the arrow keys reach, so a panel
	 * opened with the mouse arrives with a filled row nobody pointed at,
	 * sitting beside the filled row that is the current value: two marks, and
	 * the one that looks like a choice means nothing yet. The same highlight
	 * is drawn once it does mean something, which is from the first pointer
	 * move across the list, the first arrow key, or a search that narrowed
	 * the list so Enter would take the top match.
	 */
	let interacted = $state(false);
	const showHighlight = $derived(interacted || search.trim() !== '');

	$effect(() => {
		if (open) interacted = false;
	});

	const current = $derived(items.find((entry) => entry.id === value));

	const canCreate = $derived(
		!!onCreate &&
			search.trim() !== '' &&
			!items.some((entry) => entry.label.toLowerCase() === search.trim().toLowerCase())
	);

	function choose(entry: ComboboxItem) {
		value = entry.id;
		onSelect?.(entry.id);
		open = false;
		search = '';
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<!-- `class` and `id` come after the trigger's own props: it carries
			     both, and the caller's have to win, or the trigger is neither
			     styled nor findable. -->
			<Button
				{variant}
				{disabled}
				aria-expanded={open}
				{...props}
				data-slot="combobox-trigger"
				class={cn('relative w-full justify-between font-normal', triggerClass)}
				{id}
			>
				<span class="truncate pr-3 text-ellipsis">
					{#if current}
						{#if selected}{@render selected(current)}{:else}{current.label}{/if}
					{:else}
						{placeholder}
					{/if}
				</span>
				{#if showChevron}
					<ChevronsUpDown class="absolute right-2 size-4 opacity-50" />
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<!-- The panel is the width of the field it belongs to, not a width of its
	     own: a list narrower than its trigger reads as a different control. -->
	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root class="p-0" onkeydown={() => (interacted = true)}>
			<Command.Input placeholder={searchPlaceholder} bind:value={search} />
			<!-- A pointer move anywhere over the rows counts as interaction; a
			     key is caught on the root, because the search input has focus
			     and its keys bubble there. -->
			<Command.List onpointermove={() => (interacted = true)}>
				{#if !canCreate}
					<Command.Empty>{empty}</Command.Empty>
				{/if}
				<Command.Group class="p-0">
					{#each items as entry (entry.id)}
						<!--
							Two marks, and they must not compete. The chosen row
							carries `accent`, which is the stronger of the two,
							because which value is set outlasts where the pointer
							happens to be. The row under the pointer, or under the
							keyboard highlight once that highlight means something,
							is dimmed to a fraction of `muted`, so it reads as a
							hint rather than as a second selection.
						-->
						<Command.Item
							value={entry.label}
							class={cn(
								'px-3 py-2',
								showHighlight ? 'data-selected:bg-muted/40' : 'data-selected:bg-transparent',
								entry.id === value && 'bg-accent data-selected:bg-accent font-medium'
							)}
							onSelect={() => choose(entry)}
						>
							{#if itemSnippet}{@render itemSnippet(entry)}{:else}{entry.label}{/if}
						</Command.Item>
					{/each}
					{#if canCreate}
						<Command.Item
							value={`create-${search}`}
							class={cn(
								'px-3 py-2',
								showHighlight ? 'data-selected:bg-muted/40' : 'data-selected:bg-transparent'
							)}
							onSelect={() => {
								onCreate?.(search.trim());
								open = false;
								search = '';
							}}
						>
							{#if createSnippet}
								{@render createSnippet(search.trim())}
							{:else}
								Create "{search.trim()}"
							{/if}
						</Command.Item>
					{/if}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
