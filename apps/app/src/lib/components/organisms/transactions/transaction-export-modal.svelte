<script lang="ts">
	/**
	 * Ported from the old app's transaction-export-modal: a date range, the
	 * filters already applied, and the format. The old one also mails a backup,
	 * which this product does not do.
	 *
	 * Exported rows are marked `is_exported` by the API (TXN-10), so the modal
	 * says what the export will cover rather than making the user guess.
	 */
	import { Button } from '../../atoms/button/index.js';
	import { Checkbox } from '../../atoms/checkbox/index.js';
	import * as Dialog from '../../atoms/dialog/index.js';
	import { Label } from '../../atoms/label/index.js';
	import * as RadioGroup from '../../atoms/radio-group/index.js';
	import { DateRangePicker, type DateRange } from '../../molecules/date-range-picker/index.js';

	let {
		open = $bindable(false),
		range = $bindable(),
		rowCount,
		filtered = false,
		exporting = false,
		onExport
	}: {
		open?: boolean;
		range?: DateRange;
		/** How many rows the current view holds, so the count is not a guess. */
		rowCount: number;
		filtered?: boolean;
		exporting?: boolean;
		onExport?: (options: { format: 'csv' | 'xlsx'; applyFilters: boolean }) => void;
	} = $props();

	let format = $state<'csv' | 'xlsx'>('csv');
	let applyFilters = $state(true);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Export transactions</Dialog.Title>
			<Dialog.Description>
				{rowCount} transaction{rowCount === 1 ? '' : 's'} in the current view.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="space-y-2">
				<Label>Date range</Label>
				<DateRangePicker bind:value={range} class="w-full" />
			</div>

			<div class="space-y-2">
				<Label>Format</Label>
				<RadioGroup.Root bind:value={format}>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="csv" id="export-csv" />
						<Label for="export-csv">CSV</Label>
					</div>
					<div class="flex items-center gap-2">
						<RadioGroup.Item value="xlsx" id="export-xlsx" />
						<Label for="export-xlsx">Excel</Label>
					</div>
				</RadioGroup.Root>
			</div>

			{#if filtered}
				<div class="flex items-center gap-2">
					<Checkbox id="export-filters" bind:checked={applyFilters} />
					<Label for="export-filters">Keep the filters that are applied</Label>
				</div>
			{/if}

			<p class="text-subtle text-small">
				Amounts are written as decimals, not as display strings, so a spreadsheet can add
				them up.
			</p>
		</div>

		<Dialog.Footer>
			<Dialog.Close>
				{#snippet child({ props })}
					<Button variant="outline" {...props}>Cancel</Button>
				{/snippet}
			</Dialog.Close>
			<Button loading={exporting} onclick={() => onExport?.({ format, applyFilters })}>
				Export
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
