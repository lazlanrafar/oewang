<script lang="ts">
	/** Atoms combined into one job: a field, an empty state, a row, a money box. */
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Search from '@lucide/svelte/icons/search';
	import Wallet from '@lucide/svelte/icons/wallet';

	import { Button } from '$lib/components/atoms/button';
	import { ChartArea, ChartBar, ChartDonut, ChartPanel } from '$lib/components/molecules/chart';
	import { Checkbox } from '$lib/components/atoms/checkbox';
	import { Input } from '$lib/components/atoms/input';
	import { Switch } from '$lib/components/atoms/switch';
	import { FileCard } from '$lib/components/molecules/file-card';
	import { FileIcon } from '$lib/components/molecules/file-icon';
	import { FilePicker, type PickerFile } from '$lib/components/molecules/file-picker';
	import { FilePreview } from '$lib/components/molecules/file-preview';
	import { FileTile } from '$lib/components/molecules/file-tile';
	import * as ButtonGroup from '$lib/components/molecules/button-group';
	import { Combobox } from '$lib/components/molecules/combobox';
	import { ConfirmDialog } from '$lib/components/molecules/confirm-dialog';
	import { SelectAccount } from '$lib/components/molecules/select-account';
	import { SelectColumn } from '$lib/components/molecules/select-column';
	import { SelectCurrency } from '$lib/components/molecules/select-currency';
	import { SelectGroup } from '$lib/components/molecules/select-group';
	import { SelectCategory } from '$lib/components/molecules/select-category';
	import { CurrencyInput } from '$lib/components/molecules/currency-input';
	import { DataTable, DataTableEmptyState } from '$lib/components/molecules/data-table';
	import { DataTableFilter } from '$lib/components/molecules/data-table-filter';
	import type { DataTableFilterState, Facet } from '$lib/components/molecules/data-table-filter';
	import { emptyFilterState } from '$lib/components/molecules/data-table-filter';
	import { DatePicker } from '$lib/components/molecules/date-picker';
	import { DateRangePicker } from '$lib/components/molecules/date-range-picker';
	import type { DateRange } from '$lib/components/molecules/date-range-picker';
	import * as Empty from '$lib/components/molecules/empty';
	import * as Field from '$lib/components/molecules/field';
	import { FieldError } from '$lib/components/molecules/field-error';
	import { FileDropzone } from '$lib/components/molecules/file-dropzone';
	import type { UploadedFile } from '$lib/components/molecules/file-dropzone';
	import { FormError } from '$lib/components/molecules/form-error';
	import { Select } from '$lib/components/molecules/select';
	import * as InputGroup from '$lib/components/molecules/input-group';
	import { PasswordInput } from '$lib/components/molecules/password-input';
	import * as Item from '$lib/components/molecules/item';
	import { CountUp } from '$lib/components/atoms/count-up';
	import { PageCard } from '$lib/components/molecules/page-card';
	import { StatCard } from '$lib/components/molecules/stat-card';
	import { formatMoney } from '$lib/money';
	import {
		categories as mockCategories,
		wallets as mockWallets,
		sampleColumns,
		sampleGroups,
		sampleLabel,
		sampleRows,
		sampleTags
	} from '../mock';
	import Specimen from '../specimen.svelte';
	import { cn } from '$lib/utils';


	/* The pickers take `{ id, label }`; the fixture speaks the API's `name`. */
	const categories = mockCategories.map(({ id, name, colorClass }) => ({
		id,
		label: name,
		colorClass
	}));
	const accounts = mockWallets.map(({ id, name }) => ({ id, label: name }));

	/* Three rows for the Item specimen, from the same fixture the pickers use. */
	const itemRows = mockWallets.map((wallet, index) => [
		wallet.name,
		['Rp 412.000', 'Rp 8.976.500', '$120,10'][index] ?? 'Rp 0'
	]);

	const sampleAccountGroups = [
		{ id: 'group-cash', name: 'Cash' },
		{ id: 'group-bank', name: 'Bank' }
	];
	let group = $state('group-bank');
	let column = $state('Amount');

	let picked = $state(categories[0].id);
	let account = $state(accounts[1].id);
	let amount = $state('87500');
	let notify = $state(true);

	const facets: Facet[] = [
		{ id: 'category', label: 'Category', options: categories.map(({ id, label, colorClass }) => ({ id, name: label, colorClass })) },
		{ id: 'wallet', label: 'Account', options: accounts.map(({ id, label }) => ({ id, name: label })) },
		{ id: 'direction', label: 'Direction', multiple: false, options: [{ id: 'in', name: 'Money in' }, { id: 'out', name: 'Money out' }] }
	];

	let filters = $state<DataTableFilterState>({
		...emptyFilterState(),
		facets: { category: [categories[0].id], direction: ['out'] }
	});

	let range = $state<DateRange | undefined>(undefined);
	let day = $state('2026-11-05');
	let uploads = $state<UploadedFile[]>([]);
	let confirming = $state(false);
	let confirmed = $state(0);
	let currency = $state('IDR');
	let sampleSelected = $state<Record<string, boolean>>({});
	let sampleTag = $state<Record<string, string>>({});
	let sampleWidths = $state<Record<string, number | undefined>>({});
	let sampleCollapsed = $state<Record<string, boolean>>({});
	const tagItems = sampleTags.map((tag) => ({ id: tag.id, label: tag.label, colorClass: tag.colorClass }));
	const labelOfGroup = (key: string) => sampleGroups.find((group) => group.key === key)?.label ?? key;
	let grouping = $state('daily');

	/*
	 * Mock transport. The real one lives in `$lib/files.ts` and is spread in
	 * by the feature that uses the component; here it is faked, so the
	 * specimen fetches nothing and the progress bar still means something.
	 */
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	async function fakeUpload(file: File, onProgress: (sent: number, total: number) => void) {
		for (let chunk = 0; chunk <= 4; chunk += 1) {
			onProgress(chunk, 4);
			await wait(120);
		}
		return { id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size };
	}

	const PIXEL =
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

	/** Vault rows for the picker and the tiles, with a pixel for a preview. */
	const sampleFiles: PickerFile[] = [
		{ id: 'f1', name: 'warung-tekko.png', type: 'image/png', size: 184320 },
		{ id: 'f2', name: 'statement-october.pdf', type: 'application/pdf', size: 2_411_724, thumbnail: false },
		{ id: 'f3', name: 'parking.jpg', type: 'image/jpeg', size: 96_000 },
		{ id: 'f4', name: 'invoice-0042.pdf', type: 'application/pdf', size: 640_000, thumbnail: false }
	];
	const fakeThumbnail = (file: { type: string; thumbnail?: boolean | null }) =>
		file.type.startsWith('image/') && file.thumbnail !== false ? PIXEL : null;
	const fakeBytes = (bytes: number) =>
		bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	async function fakeList() {
		await wait(200);
		return { files: sampleFiles, total_pages: 1 };
	}
	const fakeTile = {
		thumbnail: fakeThumbnail,
		formatBytes: fakeBytes,
		openLabel: (name: string) => `Open ${name}`,
		removeLabel: (name: string) => `Remove ${name}`
	};
	const fakePicker = {
		list: fakeList,
		upload: fakeUpload,
		thumbnail: fakeThumbnail,
		formatOf: (type: string) => type.split('/')[1] ?? type,
		formatBytes: fakeBytes,
		accept: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
		pageSize: 12,
		labels: {
			title: 'Select file',
			search: 'Search files...',
			sort: 'Sort',
			sorts: {
				newest: 'Newest first',
				name_asc: 'Name (A-Z)',
				name_desc: 'Name (Z-A)',
				size_desc: 'Size (Largest)',
				size_asc: 'Size (Smallest)'
			},
			listView: 'List view',
			gridView: 'Grid view',
			fileType: 'File type',
			types: { '': 'All types', image: 'Images', pdf: 'Documents' },
			fileSize: 'File size',
			sizes: { '': 'Any size', lt1: 'Under 1MB', '1to5': '1MB - 5MB', gt5: 'Over 5MB' },
			sizesShort: { lt1: '< 1MB', '1to5': '1-5MB', gt5: '> 5MB' },
			addMedia: 'Add media',
			drop: 'Drag and drop images and PDFs',
			loading: 'Loading vault…',
			empty: 'No vault files found.',
			emptyFiltered: 'No files match these filters.',
			clearSelection: 'Clear selection',
			page: (page: number, total: number) => `Page ${page} of ${total}`,
			previous: 'Previous page',
			next: 'Next page',
			cancel: 'Cancel',
			done: 'Done',
			select: (name: string) => `Select ${name}`,
			uploading: (count: number) => `Uploading ${count} files...`,
			uploaded: 'All files uploaded successfully',
			uploadFailed: 'Some files failed to upload'
		}
	};
	let pickerOpen = $state(false);
	let pickedFiles = $state<PickerFile[]>([]);
	let cardSelected = $state('f1');
	/** Bumped to remount the page cards, so the count-up can be watched again. */
	let countRun = $state(0);

	/** A 1x1 PNG, so the view has real bytes to show without a server. */
	async function fakeLoad(_file: unknown, onProgress: (done: number, total: number) => void) {
		onProgress(0, 1);
		await wait(400);
		const response = await fetch(
			'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
		);
		onProgress(1, 1);
		return response.blob();
	}
</script>

<Specimen title="Field"
	note="A label, a control, a description and an error, as one unit.">
	<Field.Group class="max-w-lg">
		<Field.Root>
			<Field.Label for="field-name">Description</Field.Label>
			<Input id="field-name" placeholder="What the money was for" />
			<Field.Description>What the money was for.</Field.Description>
		</Field.Root>

		<Field.Root invalid>
			<Field.Label for="field-amount">Amount</Field.Label>
			<Input id="field-amount" aria-invalid="true" value="-" class="font-mono" />
			<Field.Error>Enter an amount greater than zero.</Field.Error>
		</Field.Root>

		<Field.Root orientation="horizontal">
			<Field.Label for="field-notify">Email me a receipt</Field.Label>
			<Switch id="field-notify" bind:checked={notify} />
		</Field.Root>

		<Field.Separator>or</Field.Separator>

		<Field.Root orientation="horizontal">
			<Checkbox id="field-recurring" />
			<Field.Label for="field-recurring">Repeat every month</Field.Label>
		</Field.Root>
	</Field.Group>
</Specimen>

<Specimen title="Password input">
	<div class="grid gap-4 sm:grid-cols-2">
		<PasswordInput placeholder="Password" autocomplete="off" value="correct horse battery" />
		<PasswordInput placeholder="Invalid" autocomplete="off" aria-invalid="true" />
		<PasswordInput placeholder="Disabled" autocomplete="off" disabled />
	</div>
	<p class="text-subtle text-small">
		The eye at the end shows and hides what was typed. Every attribute goes to the input, so a
		label and a password manager find it as before.
	</p>
</Specimen>

<Specimen title="Input group and currency input">
	<div class="grid gap-4 sm:grid-cols-2">
		<InputGroup.Root>
			<InputGroup.Addon><Search /></InputGroup.Addon>
			<InputGroup.Input placeholder="Search transactions" />
		</InputGroup.Root>
		<InputGroup.Root>
			<InputGroup.Addon><InputGroup.Text>Rp</InputGroup.Text></InputGroup.Addon>
			<InputGroup.Input placeholder="0" inputmode="decimal" class="font-mono" />
			<InputGroup.Addon align="inline-end"><InputGroup.Text>IDR</InputGroup.Text></InputGroup.Addon>
		</InputGroup.Root>
		<InputGroup.Root class="sm:col-span-2">
			<InputGroup.Textarea placeholder="A longer note" rows={2} />
			<InputGroup.Addon align="block-end">
				<InputGroup.Button size="sm">Attach receipt</InputGroup.Button>
			</InputGroup.Addon>
		</InputGroup.Root>
		<div class="space-y-2">
			<CurrencyInput bind:value={amount} />
			<p class="text-subtle text-small">
				Bound value: <code class="font-mono">{amount || '(empty)'}</code>. A decimal string,
				never a number (D12).
			</p>
		</div>
		<div class="space-y-2">
			<Combobox items={categories} bind:value={picked} />
			<p class="text-subtle text-small">A button that opens a searchable list.</p>
		</div>
	</div>
</Specimen>

<Specimen
	title="Select"
	note="One component, options as a prop: a call site passes `items` and binds a value, and writes no trigger, no panel, no row and no classes. Searchable by default, with an optional create row; unset `searchable` and it is the plain control a short fixed list wants. The account and category pickers below are thin wrappers over it, which is what stopped the same five class strings being written twice."
>
	<div class="flex max-w-xl flex-col gap-3">
		<Select
			items={[
				{ value: 'IDR', label: 'IDR' },
				{ value: 'USD', label: 'USD' },
				{ value: 'SGD', label: 'SGD' }
			]}
			bind:value={currency}
			placeholder="Currency"
			searchPlaceholder="Search currency"
		/>
		<Select
			items={[
				{ value: 'none', label: 'No grouping' },
				{ value: 'daily', label: 'Daily' },
				{ value: 'weekly', label: 'Weekly' },
				{ value: 'monthly', label: 'Monthly' }
			]}
			bind:value={grouping}
			searchable={false}
			class="w-36"
		/>
		<p class="text-subtle text-small font-mono">{currency} / {grouping}</p>
	</div>
</Specimen>

<Specimen
	title="The pickers"
	note="One per dynamic list, each a few lines over Select: accounts, categories, account groups, currencies and the columns of an uploaded file. A list whose options are data never gets a native select, whose drop-down the operating system draws in its own type, at its own size, with a tick nobody chose (D79). A new list means a new picker here, not a mapping at the call site."
	source="molecules/select-account, select-category, select-group, select-currency, select-column"
>
	<div class="grid gap-4 sm:grid-cols-2">
		<SelectAccount {accounts} bind:value={account} />
		<SelectCategory {categories} bind:value={picked} />
		<SelectGroup groups={sampleAccountGroups} bind:value={group} />
		<SelectCurrency currencies={['IDR', 'USD', 'SGD', 'EUR']} bind:value={currency} />
		<SelectColumn columns={['Date', 'Description', 'Amount', 'Balance']} bind:value={column} />
	</div>
</Specimen>

<Specimen
	title="A picker in a table cell"
	note="In a cell a picker is borderless, fills the cell and keeps its chevron at the right edge; outside one it is an ordinary outlined control. All three are the same control: the account and category cells of the transactions table and the group cell of the accounts table differ in what they hold, never in how they look or behave."
>
	<div class="grid gap-4 sm:grid-cols-2">
		<SelectAccount {accounts} bind:value={account} />
		<SelectCategory {categories} bind:value={picked} />
		<div class="border">
			<div class="flex h-[45px] items-center border-b">
				<div class="w-48 border-r px-4 text-subtle text-small">In a data table cell</div>
				<div class="h-full flex-1"><SelectAccount {accounts} bind:value={account} inDataTable /></div>
			</div>
			<div class="flex h-[45px] items-center border-b">
				<div class="w-48 border-r px-4 text-subtle text-small">With a colour square</div>
				<div class="h-full flex-1">
					<SelectCategory {categories} bind:value={picked} inDataTable />
				</div>
			</div>
			<div class="flex h-[45px] items-center">
				<div class="w-48 border-r px-4 text-subtle text-small">The group picker</div>
				<div class="h-full flex-1">
					<SelectGroup groups={sampleAccountGroups} bind:value={group} inDataTable />
				</div>
			</div>
		</div>
		<div class="border">
			<div class="flex h-[45px] items-center border-b">
				<div class="w-48 border-r px-4 text-subtle text-small">While saving</div>
				<div class="h-full flex-1">
					<SelectAccount {accounts} value={account} inDataTable updating />
				</div>
			</div>
			<div class="flex h-[45px] items-center">
				<div class="w-48 border-r px-4 text-subtle text-small">Disabled</div>
				<div class="h-full flex-1">
					<SelectCategory {categories} value={picked} inDataTable disabled />
				</div>
			</div>
		</div>
	</div>
</Specimen>

<Specimen title="Button group">
	<div class="flex flex-wrap items-center gap-6">
		<ButtonGroup.Root>
			<Button variant="outline">Day</Button>
			<Button variant="outline">Week</Button>
			<Button variant="outline">Month</Button>
		</ButtonGroup.Root>
		<ButtonGroup.Root>
			<ButtonGroup.Text>https://</ButtonGroup.Text>
			<Input class="w-48" value="oewang.com" />
			<Button variant="outline">Check</Button>
		</ButtonGroup.Root>
	</div>
</Specimen>

<Specimen title="Item"
	note="The settings and picker rows."
	framed={false}
>
	<Item.Group class="max-w-xl border">
		{#each itemRows as [name, balance] (name)}
			<Item.Root class="border-b last:border-b-0">
				<Item.Media><Wallet /></Item.Media>
				<Item.Content>
					<Item.Title>{name}</Item.Title>
					<Item.Description>Updated 2 minutes ago</Item.Description>
				</Item.Content>
				<Item.Actions>
					<span class="font-mono">{balance}</span>
					<Button size="sm" variant="ghost">Edit</Button>
				</Item.Actions>
			</Item.Root>
		{/each}
	</Item.Group>
</Specimen>

<Specimen title="Empty state">
	<Empty.Root class="max-w-xl">
		<Empty.Header>
			<Empty.Media><Inbox /></Empty.Media>
			<Empty.Title>No transactions yet</Empty.Title>
			<Empty.Description>
				Add one by hand, import a statement, or forward a receipt to the assistant.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button>Add transaction</Button>
		</Empty.Content>
	</Empty.Root>
</Specimen>

<Specimen title="Stat card"
	note="The value is formatted by the caller; this component never does arithmetic on money. A Count (a decimal string and its formatter) counts up from zero when it arrives (D108); a plain string shows as given.">
	<div class="grid gap-4 sm:grid-cols-3">
		<StatCard
			label="Income"
			value={{ value: '9500000', format: (v) => formatMoney(v, 'IDR') }}
			change={12}
			changeLabel="vs last month"
		/>
		<StatCard label="Expenses" value="Rp 111.500" change={-4} changeLabel="vs last month" />
		<StatCard label="Net" value="Rp 9.388.500" loading />
	</div>
	<div class="mt-4 grid gap-4 sm:grid-cols-2">
		<StatCard
			label="Total expenses"
			icon={Wallet}
			value="Rp 4.250.000"
			change={8.5}
			changeLabel="vs previous period"
			invert
			hint="1 Dec 2025 to 30 Nov 2026"
			onclick={() => {}}
		/>
		<StatCard label="Tracked balance" value="Rp 12.400.000" hint="3 included accounts" />
	</div>
</Specimen>

<Specimen
	title="Page card and count-up"
	note="The summary card above a list table, the old DataTablePageCard: a 10px tracked label over a serif figure. A Count animates over 0.8s with an ease-out; the decimal string moves through lerpDecimal, never a float (D12), and nothing counts on hydration or under reduced motion. While loading, the label stays and the figure is a skeleton. The tone is a variant, never a call-site class."
	source="molecules/page-card, atoms/count-up"
	framed={false}
>
	{#key countRun}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<PageCard
				label="Total balance"
				value={{ value: '9340125.0000', format: (v) => formatMoney(v, 'IDR') }}
				hint="1 account left out: no rate today"
			/>
			<PageCard label="Accounts" value={{ value: '4', format: (v) => v }} tone="positive" />
			<PageCard label="Overall usage" value="" loading />
		</div>
	{/key}
	<div class="mt-4 flex items-center gap-4">
		<Button variant="outline" size="sm" onclick={() => (countRun += 1)}>Count again</Button>
		<span class="font-mono text-xl">
			<CountUp value="1234.56" format={(v) => formatMoney(v, 'USD')} />
		</span>
	</div>
</Specimen>

<Specimen
	title="Charts"
	note="The hatch is the chart style of this product (D93): a 2px solid line over a 45° hatch, dashed averages and grid, bare axes, monotone curves, upright hatched columns with an outline. layerchart underneath (D89); heights come from chartValue, which is geometry only, and every figure in a tooltip or legend is the API's formatted string. `outflow` is the burn-rate form, lighter and dotted. The panel is the old CanvasChart. The donut keeps the old grey ring."
	source="molecules/chart"
>
	<div class="flex flex-col gap-8">
		<ChartArea
			label="This period"
			compareLabel="Year before"
			average={{ value: 4200000, formatted: 'Rp 4.200.000', label: 'Average' }}
			points={[
				{ month: '2026-06', value: 3100000, formatted: 'Rp 3.100.000', compare: 2800000, compareFormatted: 'Rp 2.800.000' },
				{ month: '2026-07', value: 4800000, formatted: 'Rp 4.800.000', compare: 3900000, compareFormatted: 'Rp 3.900.000' },
				{ month: '2026-08', value: 3900000, formatted: 'Rp 3.900.000', compare: 4100000, compareFormatted: 'Rp 4.100.000' },
				{ month: '2026-09', value: 5200000, formatted: 'Rp 5.200.000', compare: 3600000, compareFormatted: 'Rp 3.600.000' },
				{ month: '2026-10', value: 4400000, formatted: 'Rp 4.400.000', compare: 4300000, compareFormatted: 'Rp 4.300.000' },
				{ month: '2026-11', value: 3800000, formatted: 'Rp 3.800.000', compare: 4000000, compareFormatted: 'Rp 4.000.000' }
			]}
		/>
		<ChartPanel
			title="Burn rate"
			legend={[
				{ label: 'Current', type: 'solid' },
				{ label: 'Average', type: 'pattern' }
			]}
		>
			<ChartArea
				label="Current"
				legend={false}
				outflow
				average={{ value: 4200000, formatted: 'Rp 4.200.000', label: 'Average' }}
				points={[
					{ month: '2026-06', value: 3100000, formatted: 'Rp 3.100.000' },
					{ month: '2026-07', value: 4800000, formatted: 'Rp 4.800.000' },
					{ month: '2026-08', value: 3900000, formatted: 'Rp 3.900.000' },
					{ month: '2026-09', value: 5200000, formatted: 'Rp 5.200.000' }
				]}
			/>
		</ChartPanel>
		<ChartPanel title="Nothing yet" empty="No expenses in this range." height={120}>
			<span></span>
		</ChartPanel>
		<ChartBar
			label="Expense"
			items={[
				{ label: 'Food', value: 1850000, formatted: 'Rp 1.850.000', share: '43.5%' },
				{ label: 'Transport', value: 920000, formatted: 'Rp 920.000', share: '21.6%' },
				{ label: 'Rent', value: 750000, formatted: 'Rp 750.000', share: '17.6%' },
				{ label: 'Other', value: 730000, formatted: 'Rp 730.000', share: '17.2%' }
			]}
		/>
		<ChartDonut
			label="Expense by category"
			slices={[
				{ label: 'Food', value: 1850000, formatted: 'Rp 1.850.000', share: '43.5%' },
				{ label: 'Transport', value: 920000, formatted: 'Rp 920.000', share: '21.6%' },
				{ label: 'Rent', value: 750000, formatted: 'Rp 750.000', share: '17.6%' },
				{ label: 'Other', value: 730000, formatted: 'Rp 730.000', share: '17.2%' }
			]}
		/>
	</div>
</Specimen>

<Specimen
	title="Data table"
	note="One table for every screen. It owns the scrollport, the sticky header, the per-column widths and sticky offsets, the table roles, the resize handles, the sideways arrows at the seam where the scrolling columns start, group rows that stick while their block is on screen, and the trigger that asks for the next page. A caller passes columns and two snippets: what a header says and what a cell renders. The rows here are a JSON fixture, not a workspace."
	source="molecules/data-table/data-table.svelte"
	framed={false}
>
	<div class="h-[420px]">
		<DataTable
			columns={sampleColumns}
			rows={sampleRows}
			groups={sampleGroups}
			label={sampleLabel}
			bind:widths={sampleWidths}
			bind:collapsed={sampleCollapsed}
			columnArrows
			onRowClick={() => {}}
			rowClass={(row) => (sampleSelected[row.id] ? 'bg-row-hover' : undefined)}
		>
			{#snippet head(column, arrows)}
				{#if column.key === 'select'}
					<div class="flex h-full w-full items-center justify-center">
						<Checkbox
							checked={sampleRows.every((row) => sampleSelected[row.id])}
							onCheckedChange={(checked) =>
								(sampleSelected = checked
									? Object.fromEntries(sampleRows.map((row) => [row.id, true]))
									: {})}
							aria-label="Select every row"
						/>
					</div>
				{:else if column.key === 'actions'}
					<span class="sr-only">Actions</span>
				{:else}
					<div class="flex w-full items-center justify-between overflow-hidden">
						<div class="min-w-0 overflow-hidden"><span class="truncate">{column.label}</span></div>
						{#if arrows}{@render arrows()}{/if}
					</div>
				{/if}
			{/snippet}

			{#snippet cell(column, row)}
				{#if column.key === 'select'}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						class="flex h-full w-full items-center justify-center"
						onclick={(event) => event.stopPropagation()}
					>
						<Checkbox
							checked={sampleSelected[row.id] ?? false}
							onCheckedChange={(checked) =>
								(sampleSelected = { ...sampleSelected, [row.id]: checked === true })}
							aria-label="Select {row.name}"
						/>
					</div>
				{:else if column.key === 'date'}
					<div class="w-full truncate overflow-hidden">{row.date}</div>
				{:else if column.key === 'name'}
					<div class="flex w-full items-center gap-2 overflow-hidden">
						<span class="truncate">{row.name}</span>
					</div>
				{:else if column.key === 'tag'}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div class="h-full w-full" onclick={(event) => event.stopPropagation()}>
						<SelectCategory
							categories={tagItems}
							value={sampleTag[row.id] ?? row.tagId}
							onChange={(value) => (sampleTag = { ...sampleTag, [row.id]: value })}
							inDataTable
						/>
					</div>
				{:else if column.key === 'amount'}
					<div class="w-full overflow-hidden text-right">
						<div class={cn('truncate font-mono', row.negative ? 'text-red' : 'text-green')}>
							{row.amount}
						</div>
					</div>
				{:else}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<div
						class="flex h-full w-full items-center justify-center"
						onclick={(event) => event.stopPropagation()}
					>
						<Button variant="ghost" size="icon" class="size-7" aria-label="Actions for {row.name}">
							<Ellipsis />
						</Button>
					</div>
				{/if}
			{/snippet}

			{#snippet groupRow({ key, collapsed, toggle })}
				<button
					type="button"
					class="text-subtle text-small flex items-center gap-1"
					aria-expanded={!collapsed}
					onclick={toggle}
				>
					{#if collapsed}<ChevronRight class="size-3" />{:else}<ChevronDown class="size-3" />{/if}
					{labelOfGroup(key)}
				</button>
			{/snippet}
		</DataTable>
	</div>
</Specimen>

<Specimen
	title="Data table, loading"
	note="The old app's table skeleton: the header stays and the body is shimmering rows in the columns' real widths, each cell shaped by the column's `skeleton` spec (text, checkbox, icon-text, avatar-text, badge, tags, icon). The table is aria-busy and the rows are hidden from assistive technology. A page shows it while a navigation that changes its load's parameters is under way (`reloading` in url-state), and the dashboard shell shows the page's frame with it while a list page is being opened (D108)."
	framed={false}
>
	<div class="h-64">
		<DataTable columns={sampleColumns} rows={[]} label={sampleLabel} loading skeletonRows={8}>
			{#snippet head(column)}<span class="truncate">{column.label}</span>{/snippet}
			{#snippet cell()}{/snippet}
		</DataTable>
	</div>
</Specimen>

<Specimen
	title="Data table, empty"
	note="A table with nothing in it yet. The empty state sits in a row, because a rowgroup may hold nothing else and a loose box there breaks the table for a screen reader."
	framed={false}
>
	<div class="h-48">
		<DataTable columns={sampleColumns} rows={[]} label={sampleLabel}>
			{#snippet head(column)}<span class="truncate">{column.label}</span>{/snippet}
			{#snippet cell()}{/snippet}
			{#snippet empty()}
				<DataTableEmptyState
					title="Nothing here yet"
					description="Rows arrive as a prop; this table fetches nothing."
				/>
			{/snippet}
		</DataTable>
	</div>
</Specimen>

<Specimen title="Filter bar"
	note="The search field with the magnifier inside it on the left and the filter menu inside it on the right, and a chip per applied filter underneath. It holds no data: the facets and the state come in as props, and on a real page that state is the query string (UI-8), so a filtered view survives a refresh and can be shared.">
	<div class="max-w-2xl">
		<DataTableFilter bind:filters {facets} placeholder="Search transactions" />
	</div>
	<p class="text-subtle text-small font-mono">{JSON.stringify(filters)}</p>
</Specimen>

<Specimen title="Date picker"
	note="One day, from the same trigger and the same panel as the range picker. The value is an ISO `YYYY-MM-DD` string, which is what a transaction carries on the wire, so a call site converts nothing. A date is a list of days, not free text, so it gets the app's calendar rather than the native date input the operating system draws in its own type (D79). `name` posts the value, because the trigger is a button.">
	<DatePicker bind:value={day} class="max-w-xs" />
</Specimen>

<Specimen title="Date range picker"
	note="The presets people actually use beside a two-month calendar for the one time a month they need something else. The value is a `DateValue` range, not a `Date`, so the browser’s time zone cannot move the day boundary.">
	<DateRangePicker bind:value={range} class="max-w-xs" />
</Specimen>

<Specimen title="Form error and field error"
	note="The two ways a failure reaches the page. The form error is announced, so a failed save is not silent for a screen reader; the field error sits under the control it belongs to. Both take a resolved string: the mapping from an error code to a dictionary key happens in the load or the action (UI-1).">
	<div class="max-w-lg">
		<FormError message="That email and password do not match." />
		<Input aria-invalid="true" value="not-an-email" />
		<FieldError message="Enter a valid email address." />
	</div>
</Specimen>

<Specimen title="File dropzone"
	note="The old transaction sheet's attachments block: the attached files as square tiles, and a dashed box where a click opens the vault picker and a drop uploads straight to the vault. The transport, the picker's list and the previews are handed in from `$lib/files.ts`; here they are faked.">
	<FileDropzone
		bind:files={uploads}
		class="max-w-sm"
		upload={fakeUpload}
		label="Attachments"
		browseLabel="Click to browse"
		prompt="or drag and drop files here"
		hint="Images and PDFs from your computer or Vault"
		busyLabel="Saving..."
		errorMessage={() => 'Upload failed.'}
		tile={fakeTile}
		picker={fakePicker}
	/>
</Specimen>

<Specimen title="File icon"
	note="A file's type as an icon, one copy where the old app kept three: image, video, PDF, anything else.">
	<div class="flex items-center gap-4 text-muted-foreground">
		<FileIcon type="image/png" />
		<FileIcon type="video/mp4" />
		<FileIcon type="application/pdf" />
		<FileIcon type="text/plain" />
	</div>
</Specimen>

<Specimen title="File tile"
	note="One attached file as a square, the old AttachmentCard. An image shows the API's small preview (D91), anything else its type icon; name and size on hover; remove top-right, only when the reader may detach. Clickable when the caller can open the file.">
	<div class="grid max-w-sm grid-cols-3 gap-2">
		{#each sampleFiles.slice(0, 3) as file (file.id)}
			<FileTile {file} {...fakeTile} onopen={() => {}} onremove={() => {}} />
		{/each}
	</div>
</Specimen>

<Specimen title="File card"
	note="A file in the vault grid, the old VaultItemCard: the preview filling a square, the name on a gradient. The selected one is ringed.">
	<div class="grid max-w-xl grid-cols-2 gap-4 md:grid-cols-4">
		{#each sampleFiles as file (file.id)}
			<FileCard
				{file}
				thumbnail={fakeThumbnail}
				label={file.name}
				selected={cardSelected === file.id}
				onselect={() => (cardSelected = file.id)}
			/>
		{/each}
	</div>
</Specimen>

<Specimen title="File picker"
	note="The old VaultPickerModal: search, sort, grid or list, type and size filters, a drop target, pages of 12. Unlike the old one, every filter goes to the server and covers every page, and a pick comes back whole.">
	<div class="flex items-center gap-3">
		<Button variant="outline" onclick={() => (pickerOpen = true)}>Open picker</Button>
		<span class="text-subtle text-small">{pickedFiles.length} picked</span>
	</div>
	<FilePicker bind:open={pickerOpen} selected={pickedFiles} onconfirm={(files) => (pickedFiles = files)} {...fakePicker} />
</Specimen>

<Specimen title="File preview"
	note="A file shown back from a Blob URL that is revoked when the view goes away (VLT-3, D23). `box` is the old vault panel's 16:9 box; `full` fills a sheet. `load` is handed in; this one returns a 1x1 PNG."
	framed={false}
>
	<div class="max-w-sm">
		<FilePreview
			file={{ id: 'f1', name: 'warung-tekko.png', type: 'image/png', size: 184320 }}
			variant="box"
			load={fakeLoad}
			loadingLabel={(done, total) => `Fetching ${done} of ${total}.`}
			failedLabel="Those bytes could not be read."
			unavailableLabel="Preview not available for this file type"
			openOriginalLabel="Open Original File"
		/>
	</div>
</Specimen>

<Specimen title="Confirm dialog"
	note="Asked before anything irreversible (UI-4). The design system’s alert dialog rather than the browser’s `confirm`, which blocks the renderer until it is dismissed and cannot be translated.">
	<div class="flex items-center gap-3">
		<Button variant="destructive" onclick={() => (confirming = true)}>Delete transaction</Button>
		<span class="text-subtle text-small">Confirmed {confirmed} times</span>
	</div>
	<ConfirmDialog
		bind:open={confirming}
		title="Delete this transaction?"
		description="It is hidden from every view and the wallet balance is corrected. Nothing is erased."
		onConfirm={() => (confirmed += 1)}
	/>
</Specimen>
