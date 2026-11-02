<script lang="ts">
	/**
	 * The transactions table, as the live app builds it, with mock rows.
	 *
	 * This is the specimen for US-017, so everything that table carries is
	 * here: a toolbar (search, grouping, date range, column visibility,
	 * export, add), sortable headers, selection with a bulk bar, day group
	 * rows with that day's totals, a row that expands in place, the in-cell
	 * category editor, a row-actions menu and a footer count.
	 *
	 * The state is local and the data is fixed. In the real page every one of
	 * search, sort, grouping and page would be a query parameter (UI-8) and
	 * the rows would come from a load function.
	 */
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import Download from '@lucide/svelte/icons/download';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';

	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';

	import CategoryCombobox from './category-combobox.svelte';

	type Row = {
		id: string;
		day: string;
		date: string;
		name: string;
		category: string;
		wallet: string;
		/** Minor units, signed. The real table is handed a decimal string. */
		amount: number;
		currency: string;
		note: string;
	};

	const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Salary'];

	const rows: Row[] = [
		{ id: 'a', day: '2026-11-02', date: '02/11/2026', name: 'Warung Tekko', category: 'Food', wallet: 'Cash', amount: -87500, currency: 'Rp', note: 'Lunch with the team. Receipt attached.' },
		{ id: 'b', day: '2026-11-02', date: '02/11/2026', name: 'Gojek', category: 'Transport', wallet: 'Cash', amount: -24000, currency: 'Rp', note: 'Ride to the office.' },
		{ id: 'c', day: '2026-11-01', date: '01/11/2026', name: 'Salary', category: 'Salary', wallet: 'BCA', amount: 9500000, currency: 'Rp', note: 'Monthly salary.' },
		{ id: 'd', day: '2026-11-01', date: '01/11/2026', name: 'Figma', category: 'Shopping', wallet: 'Wise', amount: -49.99, currency: '$', note: 'Entered in USD, converted at 16.250.' }
	];

	const dayLabels: Record<string, string> = {
		'2026-11-02': 'WEDNESDAY, 2 NOV 2026',
		'2026-11-01': 'SUNDAY, 1 NOV 2026'
	};

	// ------------------------------------------------------------- state

	type SortKey = 'date' | 'name' | 'amount';

	let search = $state('');
	let grouping = $state<'day' | 'none'>('day');
	let sortKey = $state<SortKey>('date');
	let sortDescending = $state(true);
	let selected = $state<Record<string, boolean>>({});
	let expandedRow = $state<string | null>(null);
	let collapsedGroups = $state<Record<string, boolean>>({});
	let rowCategory = $state<Record<string, string>>(
		Object.fromEntries(rows.map((r) => [r.id, r.category]))
	);
	let hidden = $state<Record<string, boolean>>({ wallet: false });

	const columns = [
		{ key: 'date', label: 'Date', sortable: true },
		{ key: 'name', label: 'Description', sortable: true },
		{ key: 'category', label: 'Category', sortable: false },
		{ key: 'wallet', label: 'Wallet', sortable: false },
		{ key: 'amount', label: 'Amount', sortable: true }
	] as const;

	const visibleColumns = $derived(columns.filter((c) => !hidden[c.key]));
	/** Checkbox, expand, the visible columns, and the actions column. */
	const columnCount = $derived(visibleColumns.length + 3);

	const matching = $derived(
		rows.filter((row) =>
			`${row.name} ${row.category} ${row.wallet}`.toLowerCase().includes(search.toLowerCase())
		)
	);

	const sorted = $derived(
		[...matching].sort((a, b) => {
			const direction = sortDescending ? -1 : 1;
			if (sortKey === 'amount') return (a.amount - b.amount) * direction;
			if (sortKey === 'name') return a.name.localeCompare(b.name) * direction;
			return a.day.localeCompare(b.day) * direction || a.name.localeCompare(b.name);
		})
	);

	const groups = $derived(
		grouping === 'none'
			? [{ day: '', rows: sorted }]
			: [...new Set(sorted.map((r) => r.day))].map((day) => ({
					day,
					rows: sorted.filter((r) => r.day === day)
				}))
	);

	const selectedIds = $derived(sorted.filter((r) => selected[r.id]).map((r) => r.id));
	const allSelected = $derived(sorted.length > 0 && selectedIds.length === sorted.length);
	const someSelected = $derived(selectedIds.length > 0 && !allSelected);

	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortDescending = !sortDescending;
		} else {
			sortKey = key;
			sortDescending = true;
		}
	}

	function toggleAll(checked: boolean) {
		selected = checked ? Object.fromEntries(sorted.map((r) => [r.id, true])) : {};
	}

	function money(row: Row): string {
		const sign = row.amount > 0 ? '+' : '-';
		const absolute = Math.abs(row.amount);
		const formatted =
			row.currency === '$'
				? absolute.toFixed(2).replace('.', ',')
				: absolute.toLocaleString('de-DE');
		return `${sign}${row.currency} ${formatted}`;
	}

	/**
	 * A day's total, per currency.
	 *
	 * Totalling across currencies would be arithmetic on amounts that are not
	 * comparable, so a day holding both rupiah and dollars shows both, rather
	 * than one number that is wrong. The real table gets these totals from the
	 * API, which is the only thing allowed to do the arithmetic (D27).
	 */
	function dayTotal(dayRows: Row[], direction: 'in' | 'out'): string {
		const wanted = dayRows.filter((r) => (direction === 'in' ? r.amount > 0 : r.amount < 0));
		const byCurrency = new Map<string, number>();
		for (const row of wanted) {
			byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + Math.abs(row.amount));
		}
		if (byCurrency.size === 0) return 'Rp 0';
		return [...byCurrency]
			.map(([currency, total]) =>
				currency === '$'
					? `$ ${total.toFixed(2).replace('.', ',')}`
					: `${currency} ${total.toLocaleString('de-DE')}`
			)
			.join('  ');
	}
</script>

<div class="space-y-3">
	<!-- ------------------------------------------------------- toolbar -->
	<div class="flex flex-wrap items-center gap-2">
		<InputGroup.Root class="w-full sm:w-56">
			<InputGroup.Addon><Search /></InputGroup.Addon>
			<InputGroup.Input placeholder="Search" bind:value={search} />
		</InputGroup.Root>

		<Select.Root type="single" bind:value={grouping}>
			<Select.Trigger class="w-36">
				{grouping === 'day' ? 'Group by day' : 'No grouping'}
			</Select.Trigger>
			<Select.Content>
				<Select.Item value="day">Group by day</Select.Item>
				<Select.Item value="none">No grouping</Select.Item>
			</Select.Content>
		</Select.Root>

		<Popover.Root>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>
						<Calendar />
						1 - 30 Nov 2026
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-64" align="start">
				<p class="text-body">The date range picker opens here.</p>
			</Popover.Content>
		</Popover.Root>

		<div class="ml-auto flex items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="icon" aria-label="Columns" {...props}>
							<Columns3 />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-44">
					<DropdownMenu.Label>Columns</DropdownMenu.Label>
					{#each columns as column (column.key)}
						<DropdownMenu.CheckboxItem
							checked={!hidden[column.key]}
							onCheckedChange={(on) => (hidden = { ...hidden, [column.key]: !on })}
						>
							{column.label}
						</DropdownMenu.CheckboxItem>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>
							<Download />
							Export
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-40">
					<DropdownMenu.Item>Export as CSV</DropdownMenu.Item>
					<DropdownMenu.Item>Export selected</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Button>
				<Plus />
				Add
			</Button>
		</div>
	</div>

	<!-- The bulk bar takes the place of the toolbar's results line while a
	     selection is live, which is where the live app puts it. -->
	{#if selectedIds.length > 0}
		<div class="bg-muted flex flex-wrap items-center gap-2 border px-3 py-2">
			<span class="text-body">{selectedIds.length} selected</span>
			<div class="ml-auto flex items-center gap-2">
				<Button size="sm" variant="outline">Edit category</Button>
				<Button size="sm" variant="outline">Export</Button>
				<Button size="sm" variant="destructive">Delete</Button>
				<Button size="sm" variant="ghost" onclick={() => (selected = {})}>Clear</Button>
			</div>
		</div>
	{/if}

	<!-- --------------------------------------------------------- table -->
	<div class="overflow-x-auto border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-10 px-0">
						<span class="flex items-center justify-center">
							<Checkbox
								checked={allSelected}
								indeterminate={someSelected}
								onCheckedChange={(checked) => toggleAll(checked === true)}
								aria-label="Select every row"
							/>
						</span>
					</Table.Head>
					<Table.Head class="w-8 px-0"></Table.Head>
					{#each visibleColumns as column, i (column.key)}
						<Table.Head
							id={i === 0 ? 'spec-head' : undefined}
							class={column.key === 'amount' ? 'text-right' : undefined}
						>
							{#if column.sortable}
								<button
									type="button"
									class="inline-flex items-center gap-1 {column.key === 'amount'
										? 'flex-row-reverse'
										: ''}"
									aria-label="Sort by {column.label}"
									onclick={() => toggleSort(column.key as SortKey)}
								>
									{column.label}
									{#if sortKey !== column.key}
										<ChevronsUpDown class="size-3 opacity-40" />
									{:else if sortDescending}
										<ArrowDown class="size-3" />
									{:else}
										<ArrowUp class="size-3" />
									{/if}
								</button>
							{:else}
								{column.label}
							{/if}
						</Table.Head>
					{/each}
					<Table.Head class="w-10 px-0"></Table.Head>
				</Table.Row>
			</Table.Header>

			<Table.Body>
				{#if sorted.length === 0}
					<Table.Row>
						<Table.Cell colspan={columnCount} class="text-subtle h-24 text-center">
							No transactions match this search.
						</Table.Cell>
					</Table.Row>
				{/if}

				{#each groups as group, groupIndex (group.day)}
					{#if group.day}
						<Table.Row id={groupIndex === 0 ? 'spec-group-row' : undefined}>
							<Table.Cell
								id={groupIndex === 0 ? 'spec-group-cell' : undefined}
								colspan={columnCount}
								class="h-[40px] bg-[rgb(251,251,250)] px-4 py-0 dark:bg-[rgb(20,20,20)]"
							>
								<div class="flex h-full items-center gap-2">
									<button
										type="button"
										class="text-subtle text-small flex items-center gap-1"
										aria-expanded={!collapsedGroups[group.day]}
										onclick={() =>
											(collapsedGroups = {
												...collapsedGroups,
												[group.day]: !collapsedGroups[group.day]
											})}
									>
										{#if collapsedGroups[group.day]}
											<ChevronRight class="size-3" />
										{:else}
											<ChevronDown class="size-3" />
										{/if}
										{dayLabels[group.day]}
									</button>
									<span class="text-green text-small ml-auto font-mono">
										{dayTotal(group.rows, 'in')}
									</span>
									<span class="text-red text-small font-mono">
										{dayTotal(group.rows, 'out')}
									</span>
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}

					{#if !collapsedGroups[group.day]}
						{#each group.rows as row (row.id)}
							<Table.Row
								id={row.id === 'a' ? 'spec-row' : undefined}
								data-state={selected[row.id] ? 'selected' : undefined}
								class={selected[row.id] ? 'bg-muted/50' : undefined}
							>
								<!-- The checkbox sits in the middle of its column: a padded
								     cell puts it off to one side, which is what the live
								     table avoids by giving this column no padding at all. -->
								<Table.Cell class="w-10 px-0">
									<span class="flex items-center justify-center">
										<Checkbox
											checked={selected[row.id] ?? false}
											onCheckedChange={(checked) =>
												(selected = { ...selected, [row.id]: checked === true })}
											aria-label="Select {row.name}"
										/>
									</span>
								</Table.Cell>

								<!-- The expand control is its own column, so a row can be
								     opened without clicking something that also does
								     something else. -->
								<Table.Cell class="w-8 px-0">
									<span class="flex items-center justify-center">
										<button
											type="button"
											class="text-subtle hover:text-foreground flex size-6 items-center justify-center"
											aria-expanded={expandedRow === row.id}
											aria-label="{expandedRow === row.id ? 'Collapse' : 'Expand'} {row.name}"
											onclick={() => (expandedRow = expandedRow === row.id ? null : row.id)}
										>
											{#if expandedRow === row.id}
												<ChevronDown class="size-3.5" />
											{:else}
												<ChevronRight class="size-3.5" />
											{/if}
										</button>
									</span>
								</Table.Cell>

								{#each visibleColumns as column, i (column.key)}
									{#if column.key === 'date'}
										<Table.Cell
											id={row.id === 'a' && i === 0 ? 'spec-cell' : undefined}
											class="whitespace-nowrap"
										>
											{row.date}
										</Table.Cell>
									{:else if column.key === 'name'}
										<Table.Cell>
											<button
												type="button"
												class="text-left underline-offset-2 hover:underline"
												onclick={() => (expandedRow = expandedRow === row.id ? null : row.id)}
											>
												{row.name}
											</button>
										</Table.Cell>
									{:else if column.key === 'category'}
										<!-- In-cell editor: borderless, the full height of the
										     cell, opening the same list as the combobox. -->
										<Table.Cell class="py-0">
											<span class="flex items-center gap-2">
												<span class="bg-red inline-block size-2" aria-hidden="true"></span>
												<CategoryCombobox
													id={row.id === 'a' ? 'spec-incell' : undefined}
													options={categories}
													bind:value={rowCategory[row.id]}
													inline
												/>
											</span>
										</Table.Cell>
									{:else if column.key === 'wallet'}
										<Table.Cell>{row.wallet}</Table.Cell>
									{:else}
										<Table.Cell
											class="text-right font-mono whitespace-nowrap {row.amount > 0
												? 'text-green'
												: 'text-red'}"
										>
											{money(row)}
										</Table.Cell>
									{/if}
								{/each}

								<Table.Cell class="w-10 px-0">
									<span class="flex items-center justify-center">
										<DropdownMenu.Root>
											<DropdownMenu.Trigger>
												{#snippet child({ props })}
													<Button
														variant="ghost"
														size="icon"
														class="size-7"
														aria-label="Actions for {row.name}"
														{...props}
													>
														<Ellipsis />
													</Button>
												{/snippet}
											</DropdownMenu.Trigger>
											<DropdownMenu.Content align="end" class="w-40">
												<DropdownMenu.Item>Edit</DropdownMenu.Item>
												<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
												<DropdownMenu.Separator />
												<DropdownMenu.Item class="text-destructive">Delete</DropdownMenu.Item>
											</DropdownMenu.Content>
										</DropdownMenu.Root>
									</span>
								</Table.Cell>
							</Table.Row>

							{#if expandedRow === row.id}
								<!-- The expanded cell: one row's detail, in place, spanning
								     every column so nothing has to line up with the grid. -->
								<Table.Row>
									<Table.Cell colspan={columnCount} class="bg-muted/40 px-4 py-3">
										<div class="space-y-3">
											<dl class="text-body grid gap-x-8 gap-y-1 sm:grid-cols-4">
												<div>
													<dt class="text-subtle text-small">Note</dt>
													<dd>{row.note}</dd>
												</div>
												<div>
													<dt class="text-subtle text-small">Wallet</dt>
													<dd>{row.wallet}</dd>
												</div>
												<div>
													<dt class="text-subtle text-small">Category</dt>
													<dd>{rowCategory[row.id]}</dd>
												</div>
												<div>
													<dt class="text-subtle text-small">Entered</dt>
													<dd class="font-mono">{row.date} 09:14</dd>
												</div>
											</dl>
											<div class="flex gap-2">
												<Button size="sm" variant="outline">Open</Button>
												<Button size="sm" variant="outline">Attach receipt</Button>
											</div>
										</div>
									</Table.Cell>
								</Table.Row>
							{/if}
						{/each}
					{/if}
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<!-- -------------------------------------------------------- footer -->
	<div class="text-subtle text-small flex items-center justify-between gap-4">
		<span>
			{#if selectedIds.length > 0}{selectedIds.length} selected, {/if}{sorted.length ===
			rows.length
				? `${rows.length} transactions`
				: `${sorted.length} of ${rows.length} transactions`}
		</span>
		<div class="flex items-center gap-2">
			<Button size="sm" variant="outline" disabled>Previous</Button>
			<span>Page 1 of 1</span>
			<Button size="sm" variant="outline" disabled>Next</Button>
		</div>
	</div>
</div>
