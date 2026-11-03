<script lang="ts">
	/**
	 * The filter bar above a data table, ported from the old app's
	 * organisms/data-table-filter and filter-list.
	 *
	 * The old shape, kept: one search field with the magnifier inside it on
	 * the left and the filter menu inside it on the right, and underneath, a
	 * row of chips for the filters that are applied. A chip shows its value
	 * and reveals a clear control on hover.
	 *
	 * This component holds no data and fetches nothing: the caller passes the
	 * facets and binds the state. In a real page that state is the query
	 * string (UI-8), so a filtered view survives a refresh and can be shared.
	 */
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';

	import { Button } from '../../atoms/button/index.js';
	import { Checkbox } from '../../atoms/checkbox/index.js';
	import * as Command from '../../atoms/command/index.js';
	import * as DropdownMenu from '../../atoms/dropdown-menu/index.js';
	import { Input } from '../../atoms/input/index.js';
	import { RangeCalendar } from '../../atoms/range-calendar/index.js';
	import { CurrencyInput } from '../../molecules/currency-input/index.js';
	import { cn } from '$lib/utils.js';
	import type { DataTableFilterState, Facet } from './types.js';
	import { hasActiveFilters } from './types.js';

	let {
		filters = $bindable(),
		facets = [],
		placeholder = 'Search',
		showAmount = true,
		showDate = true,
		/**
		 * Chips this bar does not draw, by key.
		 *
		 * A filter can be owned by a control outside the bar, and then a chip
		 * for it is the same fact stated twice: the transactions page has a
		 * date range picker in its header that already reads the range back,
		 * so the bar showing `Date: 2026-08-01 - 2026-11-30` beside it is
		 * noise. The filter still applies; only the chip is withheld. The old
		 * app does the same thing under the name `excludeKeys`.
		 */
		hideChips = [],
		currencySymbol = 'Rp',
		class: className
	}: {
		filters: DataTableFilterState;
		facets?: Facet[];
		placeholder?: string;
		showAmount?: boolean;
		showDate?: boolean;
		hideChips?: string[];
		currencySymbol?: string;
		class?: string;
	} = $props();

	const active = $derived(hasActiveFilters(filters));

	const nameOf = (facet: Facet, id: string) =>
		facet.options.find((option) => option.id === id)?.name ?? id;

	function selected(facetId: string): string[] {
		return filters.facets[facetId] ?? [];
	}

	function toggleValue(facet: Facet, optionId: string) {
		const current = selected(facet.id);
		const next = current.includes(optionId)
			? current.filter((id) => id !== optionId)
			: facet.multiple === false
				? [optionId]
				: [...current, optionId];
		filters = { ...filters, facets: { ...filters.facets, [facet.id]: next } };
	}

	function clearFacetValue(facetId: string, optionId: string) {
		const next = selected(facetId).filter((id) => id !== optionId);
		filters = { ...filters, facets: { ...filters.facets, [facetId]: next } };
	}

	function clearAll() {
		filters = { search: '', facets: {} };
	}

	/** One chip per applied value, as the old filter list renders them. */
	type Chip = { key: string; label: string; clear: () => void };

	const chips = $derived.by<Chip[]>(() => {
		const list: Chip[] = [];

		// One chip per facet, naming every value it holds, rather than one
		// chip per value. Three categories are one answer to one question,
		// and three chips read as three separate filters.
		for (const facet of facets) {
			const values = selected(facet.id);
			if (values.length === 0) continue;

			list.push({
				key: facet.id,
				label: `${facet.label}: ${values.map((id) => nameOf(facet, id)).join(', ')}`,
				clear: () => (filters = { ...filters, facets: { ...filters.facets, [facet.id]: [] } })
			});
		}

		const { min, max } = filters.amount ?? {};
		if (min || max) {
			const text = min && max ? `${min} - ${max}` : min ? `from ${min}` : `up to ${max}`;
			list.push({
				key: 'amount',
				label: `Amount: ${text}`,
				clear: () => (filters = { ...filters, amount: undefined })
			});
		}

		const range = filters.dateRange;
		if (range?.start) {
			const text = range.end
				? `${range.start.toString()} - ${range.end.toString()}`
				: range.start.toString();
			list.push({
				key: 'date',
				label: `Date: ${text}`,
				clear: () => (filters = { ...filters, dateRange: undefined })
			});
		}

		return list.filter((chip) => !hideChips.includes(chip.key));
	});
</script>

<!-- The chips sit beside the search box rather than under it. They answer
     the same question the box does, and a second row costs the table a row
     of its own height on every screen. -->
<div class={cn('flex min-w-0 flex-wrap items-center gap-2', className)}>
	<!-- Sized, not full width: `w-full` would take the whole flex line and
	     push the chips onto a second row, which is the row this layout
	     exists to avoid. -->
	<div class="group relative min-w-0 max-w-sm flex-1 basis-64">
		<div class="relative flex items-center">
			<Search
				class="text-subtle group-focus-within:text-foreground pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 transition-colors"
			/>
			<Input
				{placeholder}
				bind:value={filters.search}
				class="bg-secondary/10 placeholder:text-subtle text-small h-9 pr-16 pl-9"
			/>
			<div class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5">
				{#if filters.search}
					<Button
						variant="ghost"
						size="icon"
						class="text-subtle hover:text-foreground size-7 hover:bg-transparent"
						aria-label="Clear search"
						onclick={() => (filters = { ...filters, search: '' })}
					>
						<X />
					</Button>
				{/if}

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								variant="ghost"
								size="icon"
								class="text-subtle hover:text-foreground size-7 hover:bg-transparent"
								aria-label="Filters"
								{...props}
							>
								<ListFilter />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-[200px] p-0">
						<div class="flex flex-col py-1">
							{#each facets as facet (facet.id)}
								<DropdownMenu.Sub>
									<DropdownMenu.SubTrigger class="px-3 py-2.5 text-xs">
										{facet.label}
									</DropdownMenu.SubTrigger>
									<DropdownMenu.SubContent class="min-w-[200px] p-0">
										<Command.Root>
											<Command.Input placeholder={facet.label} />
											<Command.List>
												<Command.Empty>No match.</Command.Empty>
												<Command.Group>
													{#each facet.options as option (option.id)}
														<Command.Item
															value={option.name}
															onSelect={() => toggleValue(facet, option.id)}
														>
															<Checkbox
																checked={selected(facet.id).includes(option.id)}
																tabindex={-1}
																aria-hidden="true"
															/>
															{#if option.colorClass}
																<span
																	class={cn('inline-block size-2', option.colorClass)}
																></span>
															{/if}
															<span class="flex-1 truncate">{option.name}</span>
														</Command.Item>
													{/each}
												</Command.Group>
											</Command.List>
										</Command.Root>
									</DropdownMenu.SubContent>
								</DropdownMenu.Sub>
							{/each}

							{#if showAmount}
								<DropdownMenu.Sub>
									<DropdownMenu.SubTrigger class="px-3 py-2.5 text-xs">
										Amount
									</DropdownMenu.SubTrigger>
									<DropdownMenu.SubContent class="min-w-[200px] p-3">
										<div class="flex flex-col gap-3">
											<div class="flex flex-col gap-1.5">
												<span class="text-subtle text-caption px-0.5 font-medium uppercase">
													At least
												</span>
												<CurrencyInput
													symbol={currencySymbol}
													value={filters.amount?.min ?? ''}
													onValueChange={(min) =>
														(filters = { ...filters, amount: { ...filters.amount, min } })}
												/>
											</div>
											<div class="flex flex-col gap-1.5">
												<span class="text-subtle text-caption px-0.5 font-medium uppercase">
													At most
												</span>
												<CurrencyInput
													symbol={currencySymbol}
													value={filters.amount?.max ?? ''}
													onValueChange={(max) =>
														(filters = { ...filters, amount: { ...filters.amount, max } })}
												/>
											</div>
											<p class="text-subtle text-caption">
												Compared on the absolute amount, so an expense and an income of the
												same size both match.
											</p>
										</div>
									</DropdownMenu.SubContent>
								</DropdownMenu.Sub>
							{/if}

							{#if showDate}
								<DropdownMenu.Sub>
									<DropdownMenu.SubTrigger class="px-3 py-2.5 text-xs">
										Date
									</DropdownMenu.SubTrigger>
									<DropdownMenu.SubContent class="w-auto min-w-[500px] p-0">
										<RangeCalendar
											value={filters.dateRange}
											onValueChange={(dateRange) => (filters = { ...filters, dateRange })}
										/>
									</DropdownMenu.SubContent>
								</DropdownMenu.Sub>
							{/if}
						</div>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</div>
	</div>

	<!-- The row exists only when it has something to say. `active` alone is
	     not enough: a filter whose chip this bar withholds, such as the date
	     range the transactions header owns, would otherwise leave a bare
	     "Clear all" under an empty row. -->
	{#if chips.length > 0}
		<div class="flex min-w-0 items-center gap-2">
			<ul class="flex min-w-0 flex-wrap gap-2">
				{#each chips as chip (chip.key)}
					<li>
						<button
							type="button"
							class="bg-secondary hover:bg-secondary text-subtle/80 group flex h-9 items-center space-x-1 px-2 font-normal"
							onclick={chip.clear}
						>
							<X
								class="w-0 scale-0 transition-all group-hover:w-4 group-hover:scale-100"
								aria-hidden="true"
							/>
							<span class="text-foreground/90 text-small font-medium whitespace-nowrap">
								{chip.label}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
