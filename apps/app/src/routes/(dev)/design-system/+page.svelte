<script lang="ts">
	/**
	 * The design system, measured against app.oewang.com.
	 *
	 * Every primitive in `$lib/components/ui` appears here, expanded: all
	 * variants, sizes and states visible at once, nothing behind a toggle
	 * except the overlays that have to be opened to be seen.
	 *
	 * Development only, and on a bare page: a shell around it would be two
	 * more things whose styles could be mistaken for the specimen's.
	 *
	 * The comparison table at the end is the point. Every row holds a value
	 * read from the live app with getComputedStyle beside what this build
	 * renders right now, so a drift is visible on the page instead of needing
	 * devtools and a second browser tab.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Command from '$lib/components/ui/command';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Input } from '$lib/components/ui/input';
	import * as InputGroup from '$lib/components/ui/input-group';
	import { Label } from '$lib/components/ui/label';
	import * as Popover from '$lib/components/ui/popover';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Toaster } from '$lib/components/ui/sonner';
	import * as Table from '$lib/components/ui/table';
	import { Textarea } from '$lib/components/ui/textarea';

	import CategoryCombobox from './category-combobox.svelte';

	// ---------------------------------------------------------------- data

	type Row = {
		id: string;
		date: string;
		name: string;
		category: string;
		wallet: string;
		amount: string;
		note: string;
	};

	const groups: Array<{ day: string; income: string; expense: string; rows: Row[] }> = [
		{
			day: 'WEDNESDAY, 2 NOV 2026',
			income: 'Rp 0',
			expense: 'Rp 111.500',
			rows: [
				{ id: 'a', date: '02/11/2026', name: 'Warung Tekko', category: 'Food', wallet: 'Cash', amount: '-Rp 87.500', note: 'Lunch with the team. Receipt attached.' },
				{ id: 'b', date: '02/11/2026', name: 'Gojek', category: 'Transport', wallet: 'Cash', amount: '-Rp 24.000', note: 'Ride to the office.' }
			]
		},
		{
			day: 'SUNDAY, 1 NOV 2026',
			income: 'Rp 9.500.000',
			expense: '$49,99',
			rows: [
				{ id: 'c', date: '01/11/2026', name: 'Salary', category: 'Salary', wallet: 'BCA', amount: '+Rp 9.500.000', note: 'Monthly salary.' },
				{ id: 'd', date: '01/11/2026', name: 'Figma', category: 'Shopping', wallet: 'Wise', amount: '-$49,99', note: 'Entered in USD, converted at 16.250.' }
			]
		}
	];

	let collapsed = $state<Record<string, boolean>>({});
	let expanded = $state<string | null>(null);
	let selected = $state<Record<string, boolean>>({});

	const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Salary'];
	let category = $state('Food');
	let picked = $state('Food');
	let rowCategory = $state<Record<string, string>>(
		Object.fromEntries(groups.flatMap((g) => g.rows.map((r) => [r.id, r.category])))
	);
	let showArchived = $state(true);

	// ------------------------------------------------- measured comparison

	type Reading = { label: string; live: string; ours: string; ok: boolean; skipped: boolean };

	/** Values read from app.oewang.com with getComputedStyle on 2026-11-02. */
	const measured: Array<{
		label: string;
		live: string;
		read: () => string;
		/** Only measurable while its overlay is open. */
		overlay?: boolean;
	}> = [
		{ label: 'Root font size', live: '15px', read: () => prop('html', 'fontSize') },
		{ label: 'Body font', live: 'Hedvig Letters Sans', read: () => family('body') },
		{ label: 'Serif weight', live: '400', read: () => prop('#spec-serif', 'fontWeight') },
		{ label: 'Body text', live: '13.125px', read: () => prop('#spec-body-text', 'fontSize') },
		{ label: 'Small text', live: '11.25px', read: () => prop('#spec-small-text', 'fontSize') },
		{ label: 'Heading, lg', live: '16.875px / 500', read: () => `${prop('#spec-h2', 'fontSize')} / ${prop('#spec-h2', 'fontWeight')}` },
		{ label: 'Label', live: '13.125px / 500', read: () => `${prop('#spec-label', 'fontSize')} / ${prop('#spec-label', 'fontWeight')}` },
		{ label: 'Radius scale, sm', live: '3.5px', read: () => probe('rounded-sm', 'borderRadius') },
		{ label: 'Radius scale, md', live: '5.5px', read: () => probe('rounded-md', 'borderRadius') },
		{ label: 'Radius scale, lg', live: '7.5px', read: () => probe('rounded-lg', 'borderRadius') },
		{ label: 'Button radius', live: '0px', read: () => prop('#spec-button', 'borderRadius') },
		{ label: 'Button height', live: '33.75px', read: () => prop('#spec-button', 'height') },
		{ label: 'Button weight', live: '500', read: () => prop('#spec-button', 'fontWeight') },
		{ label: 'Button padding', live: '15px', read: () => prop('#spec-button', 'paddingLeft') },
		{ label: 'Input height', live: '33.75px', read: () => prop('#spec-input', 'height') },
		{ label: 'Input radius', live: '0px', read: () => prop('#spec-input', 'borderRadius') },
		{ label: 'Input border', live: '1px rgb(219, 218, 215)', read: () => hairline('#spec-input') },
		{ label: 'Input padding', live: '11.25px', read: () => prop('#spec-input', 'paddingLeft') },
		{ label: 'Select trigger height', live: '33.75px', read: () => prop('#spec-select', 'height') },
		{ label: 'Select trigger radius', live: '0px', read: () => prop('#spec-select', 'borderRadius') },
		{ label: 'Checkbox size', live: '15px', read: () => prop('#spec-checkbox', 'width') },
		{ label: 'Checkbox radius', live: '0px', read: () => prop('#spec-checkbox', 'borderRadius') },
		{ label: 'Card radius', live: '0px', read: () => prop('#spec-card', 'borderRadius') },
		{ label: 'Card border', live: '1px rgb(219, 218, 215)', read: () => hairline('#spec-card') },
		{ label: 'Card shadow', live: 'none', read: () => prop('#spec-card', 'boxShadow') },
		{ label: 'Focus outline', live: 'none', read: focusOutline },
		{ label: 'In-cell editor height', live: '33.75px', read: () => prop('#spec-incell', 'height') },
		{ label: 'In-cell editor border', live: '0px', read: () => hairlineWidth('#spec-incell') },
		{ label: 'Menu item height', live: '30px', read: () => prop('[data-slot="dropdown-menu-item"]', 'height'), overlay: true },
		{ label: 'Menu item padding', live: '7.5px', read: () => prop('[data-slot="dropdown-menu-item"]', 'paddingLeft'), overlay: true },
		{ label: 'Menu item radius', live: '3.5px', read: () => prop('[data-slot="dropdown-menu-item"]', 'borderRadius'), overlay: true },
		{ label: 'Menu surface radius', live: '0px', read: () => prop('[data-slot="dropdown-menu-content"]', 'borderRadius'), overlay: true },
		{ label: 'Table header height', live: '45px', read: () => prop('thead th', 'height') },
		{ label: 'Table header colour', live: 'rgb(102, 102, 102)', read: () => prop('thead th', 'color') },
		{ label: 'Table header weight', live: '500', read: () => prop('thead th', 'fontWeight') },
		{ label: 'Table cell padding', live: '15px', read: () => prop('#spec-cell', 'paddingLeft') },
		{ label: 'Table row height', live: '45px', read: () => prop('#spec-row', 'height') },
		{ label: 'Row rule', live: '1px on the cell', read: () => `${hairlineWidth('#spec-cell', 'borderBottomWidth')} on the cell` },
		{ label: 'Group row height', live: '40px', read: () => prop('#spec-group-row', 'height') },
		// The tint sits on the cell, as the rule does; a tr with a background
		// paints under the cells rather than through them.
		{ label: 'Group row background', live: 'rgb(251, 251, 250)', read: () => prop('#spec-group-cell', 'backgroundColor') }
	];

	let readings = $state<Reading[]>([]);

	function measure() {
		readings = measured.map(({ label, live, read, overlay }) => {
			let ours: string;
			try {
				ours = read();
			} catch {
				ours = 'unreadable';
			}
			const absent = overlay === true && ours === 'not found';
			return { label, live, ours: absent ? 'not open' : ours, ok: same(ours, live), skipped: absent };
		});
	}

	onMount(measure);

	function prop(selector: string, property: string): string {
		const el = selector === 'html' ? document.documentElement : document.querySelector(selector);
		if (!el) return 'not found';
		// Indexed access, not getPropertyValue: the latter wants kebab-case and
		// returns an empty string for a camelCase name, which reads as a
		// mismatch when nothing is wrong.
		return (getComputedStyle(el) as unknown as Record<string, string>)[property] ?? 'unreadable';
	}

	function family(selector: string): string {
		return prop(selector, 'fontFamily').split(',')[0].replace(/["']/g, '');
	}

	/** Measure a utility class without hard-coding what it should resolve to. */
	function probe(className: string, property: string): string {
		const el = document.createElement('div');
		el.className = className;
		document.body.append(el);
		const value = (getComputedStyle(el) as unknown as Record<string, string>)[property];
		el.remove();
		return value ?? 'unreadable';
	}

	/*
	 * Chrome reports a hairline border already snapped to a device pixel, so a
	 * literal 1px reads as 0.5556px on a 1.8x display. Report the authored
	 * width and compare the colour exactly; chasing the sub-pixel value would
	 * mean chasing the monitor.
	 */
	function hairlineWidth(selector: string, property = 'borderTopWidth'): string {
		const raw = parseFloat(prop(selector, property));
		if (Number.isNaN(raw)) return 'unreadable';
		return raw * window.devicePixelRatio >= 0.5 ? '1px' : '0px';
	}

	function hairline(selector: string): string {
		return `${hairlineWidth(selector)} ${prop(selector, 'borderTopColor')}`;
	}

	function focusOutline(): string {
		const el = document.querySelector<HTMLInputElement>('#spec-input');
		if (!el) return 'not found';
		el.focus();
		const value = getComputedStyle(el).outlineStyle;
		el.blur();
		return value;
	}

	const same = (a: string, b: string) =>
		a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

	const mismatches = $derived(readings.filter((r) => !r.ok && !r.skipped).length);
	const skipped = $derived(readings.filter((r) => r.skipped).length);
</script>

<svelte:head><title>Design system</title></svelte:head>

<Toaster />

{#snippet section(id: string, title: string, note?: string)}
	<div class="space-y-1">
		<h2 {id} class="text-lg font-medium tracking-tight">{title}</h2>
		{#if note}<p class="text-subtle text-xs">{note}</p>{/if}
	</div>
{/snippet}

<div class="mx-auto max-w-5xl space-y-12 pb-24">
	<header>
		<h1 id="spec-serif" class="font-serif text-2xl tracking-tight">Design system</h1>
		<p class="text-subtle mt-2 max-w-2xl text-sm">
			Every primitive in <code class="font-mono text-xs">$lib/components/ui</code>, measured
			against app.oewang.com rather than estimated. Development only; this route answers 404
			anywhere else.
		</p>
	</header>

	<!-- ------------------------------------------------------- typography -->
	<section class="space-y-4">
		{@render section('spec-h2', 'Typography', 'Hedvig Letters Sans for everything, Serif for page titles, Geist Mono for amounts.')}
		<div class="space-y-2">
			<p class="font-serif text-2xl tracking-tight">Hedvig Letters Serif, 400</p>
			<p id="spec-body-text" class="text-sm">
				Hedvig Letters Sans at 13.125px. This is the size almost everything uses: of the
				elements on the live transactions page, 86 render at it.
			</p>
			<p id="spec-small-text" class="text-subtle text-xs">
				11.25px, muted. Secondary lines, group labels, hints.
			</p>
			<p class="font-mono text-sm">Geist Mono 13.125px, for amounts and identifiers.</p>
		</div>
		<dl class="text-subtle grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
			<div><dt class="inline font-medium">base</dt> <dd class="inline">15px</dd></div>
			<div><dt class="inline font-medium">text-sm</dt> <dd class="inline">13.125px</dd></div>
			<div><dt class="inline font-medium">text-xs</dt> <dd class="inline">11.25px</dd></div>
			<div><dt class="inline font-medium">text-lg</dt> <dd class="inline">16.875px</dd></div>
		</dl>
		<p class="text-subtle max-w-2xl text-xs">
			The serif ships one weight. `font-synthesis-weight: none` is set on `.font-serif` so a
			stray `font-semibold` renders unchanged instead of as a faked bold.
		</p>
	</section>

	<!-- ----------------------------------------------------------- colour -->
	<section class="space-y-4">
		{@render section('colour', 'Colour')}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each [['background', 'bg-background'], ['foreground', 'bg-foreground'], ['primary', 'bg-primary'], ['secondary', 'bg-secondary'], ['muted', 'bg-muted'], ['accent', 'bg-accent'], ['card', 'bg-card'], ['popover', 'bg-popover'], ['border', 'bg-border'], ['sidebar', 'bg-sidebar'], ['destructive', 'bg-destructive'], ['subtle', 'bg-subtle'], ['green', 'bg-green'], ['red', 'bg-red']] as [name, cls] (name)}
				<div class="space-y-1">
					<div class="h-10 border {cls}"></div>
					<p class="text-subtle font-mono text-xs">{name}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ---------------------------------------------------------- buttons -->
	<section class="space-y-4">
		{@render section('button', 'Button')}
		<div class="flex flex-wrap items-center gap-2">
			<Button id="spec-button">Default</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="link">Link</Button>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Button size="sm">Small</Button>
			<Button size="default">Default</Button>
			<Button size="lg">Large</Button>
			<Button size="icon" aria-label="Add"><Plus /></Button>
			<Button loading>Loading</Button>
			<Button disabled>Disabled</Button>
			<Button href="#button">As a link</Button>
		</div>
	</section>

	<!-- ------------------------------------------------------------ badge -->
	<section class="space-y-4">
		{@render section('badge', 'Badge')}
		<div class="flex flex-wrap items-center gap-2">
			<Badge>Default</Badge>
			<Badge variant="secondary">Secondary</Badge>
			<Badge variant="outline">Outline</Badge>
			<Badge variant="destructive">Destructive</Badge>
			<Badge variant="ghost">Ghost</Badge>
			<Badge variant="link" href="#badge">Link</Badge>
		</div>
	</section>

	<!-- ----------------------------------------------------------- fields -->
	<section class="space-y-4">
		{@render section('fields', 'Input, label, textarea', 'Square, a plain border, and no focus ring anywhere.')}
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label id="spec-label" for="spec-input">Input</Label>
				<Input id="spec-input" placeholder="Placeholder" />
			</div>
			<div class="space-y-2">
				<Label for="spec-input-value">With a value</Label>
				<Input id="spec-input-value" value="Warung Tekko" />
			</div>
			<div class="space-y-2">
				<Label for="spec-input-disabled">Disabled</Label>
				<Input id="spec-input-disabled" disabled placeholder="Disabled" />
			</div>
			<div class="space-y-2">
				<Label for="spec-input-invalid">Invalid</Label>
				<Input id="spec-input-invalid" aria-invalid="true" value="not-an-email" />
				<p class="text-destructive text-xs">Enter an email address.</p>
			</div>
			<div class="space-y-2">
				<Label for="spec-input-password">Password</Label>
				<Input id="spec-input-password" type="password" value="hunter2hunter2" />
			</div>
			<div class="space-y-2">
				<Label for="spec-input-number">Amount</Label>
				<Input id="spec-input-number" inputmode="decimal" value="87500" class="font-mono" />
			</div>
			<div class="space-y-2 sm:col-span-2">
				<Label for="spec-textarea">Textarea</Label>
				<Textarea id="spec-textarea" placeholder="A note on this transaction" rows={3} />
			</div>
		</div>
	</section>

	<!-- ------------------------------------------------------ input group -->
	<section class="space-y-4">
		{@render section('input-group', 'Input group', 'An input with something attached: an icon, a unit, or a button.')}
		<div class="grid gap-4 sm:grid-cols-2">
			<InputGroup.Root>
				<InputGroup.Addon><Search /></InputGroup.Addon>
				<InputGroup.Input placeholder="Search transactions" />
			</InputGroup.Root>
			<InputGroup.Root>
				<InputGroup.Addon><InputGroup.Text>Rp</InputGroup.Text></InputGroup.Addon>
				<InputGroup.Input placeholder="0" inputmode="decimal" class="font-mono" />
				<InputGroup.Addon align="inline-end">
					<InputGroup.Text>IDR</InputGroup.Text>
				</InputGroup.Addon>
			</InputGroup.Root>
			<InputGroup.Root class="sm:col-span-2">
				<InputGroup.Textarea placeholder="A longer note" rows={2} />
				<InputGroup.Addon align="block-end">
					<InputGroup.Button size="sm">Attach receipt</InputGroup.Button>
				</InputGroup.Addon>
			</InputGroup.Root>
		</div>
	</section>

	<!-- --------------------------------------------------------- checkbox -->
	<section class="space-y-4">
		{@render section('checkbox', 'Checkbox')}
		<div class="flex flex-wrap items-center gap-6">
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox" />
				<Label for="spec-checkbox">Unchecked</Label>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox-on" checked />
				<Label for="spec-checkbox-on">Checked</Label>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox-mixed" indeterminate />
				<Label for="spec-checkbox-mixed">Indeterminate</Label>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox-off" disabled />
				<Label for="spec-checkbox-off">Disabled</Label>
			</div>
		</div>
	</section>

	<!-- ------------------------------------------------- select, combobox -->
	<section class="space-y-4">
		{@render section('select', 'Select and combobox', 'The combobox is a button that opens a searchable list, as the live app builds it, not a native select.')}
		<div class="grid gap-4 sm:grid-cols-3">
			<div class="space-y-2">
				<Label for="spec-select">Select</Label>
				<Select.Root type="single" bind:value={category}>
					<Select.Trigger id="spec-select" class="w-full">{category}</Select.Trigger>
					<Select.Content>
						{#each categories as option (option)}
							<Select.Item value={option}>{option}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="space-y-2">
				<Label for="spec-combobox">Combobox</Label>
				<CategoryCombobox id="spec-combobox" options={categories} bind:value={picked} />
			</div>
			<div class="space-y-2">
				<Label for="spec-select-disabled">Disabled</Label>
				<Select.Root type="single" disabled value="Food">
					<Select.Trigger id="spec-select-disabled" class="w-full">Food</Select.Trigger>
					<Select.Content />
				</Select.Root>
			</div>
		</div>
	</section>

	<!-- ---------------------------------------------------------- command -->
	<section class="space-y-4">
		{@render section('command', 'Command', 'The same list the combobox opens, inline so its own styling is visible.')}
		<Command.Root class="max-w-sm border">
			<Command.Input placeholder="Search categories..." />
			<Command.List>
				<Command.Empty>No match.</Command.Empty>
				<Command.Group heading="Categories">
					{#each categories as option (option)}
						<Command.Item value={option}>
							<Check class="size-4 {option === picked ? 'opacity-100' : 'opacity-0'}" />
							{option}
						</Command.Item>
					{/each}
				</Command.Group>
				<Command.Separator />
				<Command.Group heading="Actions">
					<Command.Item value="new">
						<Plus class="size-4" />
						New category
						<Command.Shortcut>⌘N</Command.Shortcut>
					</Command.Item>
				</Command.Group>
			</Command.List>
		</Command.Root>
	</section>

	<!-- ------------------------------------------------ menus and overlays -->
	<section class="space-y-4">
		{@render section('overlays', 'Menus and overlays', 'Square surfaces, a 1px rule, no shadow. Menu items keep the 3.5px radius the live app gives them. Open the dropdown, then press Re-measure at the foot of the page to check its four rows.')}
		<div class="flex flex-wrap items-center gap-2">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Dropdown menu</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-52" align="start">
					<DropdownMenu.Label>This row</DropdownMenu.Label>
					<DropdownMenu.Group>
						<DropdownMenu.Item>
							Edit
							<DropdownMenu.Shortcut>⌘E</DropdownMenu.Shortcut>
						</DropdownMenu.Item>
						<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
						<DropdownMenu.CheckboxItem bind:checked={showArchived}>
							Show archived
						</DropdownMenu.CheckboxItem>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<DropdownMenu.Sub>
						<DropdownMenu.SubTrigger>Move to</DropdownMenu.SubTrigger>
						<DropdownMenu.SubContent>
							{#each categories as option (option)}
								<DropdownMenu.Item>{option}</DropdownMenu.Item>
							{/each}
						</DropdownMenu.SubContent>
					</DropdownMenu.Sub>
					<DropdownMenu.Separator />
					<DropdownMenu.Item class="text-destructive">Delete</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<Popover.Root>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Popover</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="w-64" align="start">
					<p class="text-sm">A popover holds anything: a form, a filter, a date range.</p>
				</Popover.Content>
			</Popover.Root>

			<Dialog.Root>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Dialog</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content class="sm:max-w-md">
					<Dialog.Header>
						<Dialog.Title>Delete this transaction?</Dialog.Title>
						<Dialog.Description>
							It is removed from the list and the wallet balance is recomputed. Deletes
							are soft, so it can be restored.
						</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer>
						<Dialog.Close>
							{#snippet child({ props })}
								<Button variant="outline" {...props}>Cancel</Button>
							{/snippet}
						</Dialog.Close>
						<Button variant="destructive">Delete</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>

			<Sheet.Root>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Sheet</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="right">
					<Sheet.Header>
						<Sheet.Title>New transaction</Sheet.Title>
						<Sheet.Description>The form the transactions page opens.</Sheet.Description>
					</Sheet.Header>
					<div class="space-y-4 px-4">
						<div class="space-y-2">
							<Label for="sheet-name">Description</Label>
							<Input id="sheet-name" placeholder="Warung Tekko" />
						</div>
						<div class="space-y-2">
							<Label for="sheet-amount">Amount</Label>
							<Input id="sheet-amount" class="font-mono" placeholder="0" />
						</div>
					</div>
					<Sheet.Footer>
						<Button>Save</Button>
					</Sheet.Footer>
				</Sheet.Content>
			</Sheet.Root>

			<Button variant="outline" onclick={() => toast.success('Transaction saved')}>
				Toast
			</Button>
			<Button variant="outline" onclick={() => toast.error('Wallet balance would go negative')}>
				Toast, error
			</Button>
		</div>
	</section>

	<!-- -------------------------------------------------------- separator -->
	<section class="space-y-4">
		{@render section('separator', 'Separator')}
		<Separator />
		<!-- A vertical separator stretches to its row, and `items-center`
		     stops it, so the height is given here as the live header does. -->
		<div class="flex h-8 items-center gap-3 text-sm">
			<span>Transactions</span>
			<Separator orientation="vertical" class="h-4" />
			<span>Chat</span>
			<Separator orientation="vertical" class="h-4" />
			<span>Settings</span>
		</div>
	</section>

	<!-- ------------------------------------------------------- data table -->
	<section class="space-y-4">
		{@render section('table', 'Data table', 'Rows group by day with that day’s totals on the right, a group collapses, a row expands in place, and the category is edited in the cell. Amounts carry colour and a sign, never colour alone.')}

		<div class="overflow-x-auto border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-10"></Table.Head>
						<Table.Head>Date</Table.Head>
						<Table.Head>Description</Table.Head>
						<Table.Head>Category</Table.Head>
						<Table.Head>Wallet</Table.Head>
						<Table.Head class="text-right">Amount</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each groups as group (group.day)}
						<Table.Row id={group.day === groups[0].day ? 'spec-group-row' : undefined}>
							<Table.Cell
								id={group.day === groups[0].day ? 'spec-group-cell' : undefined}
								colspan={6}
								class="h-[40px] bg-[rgb(251,251,250)] px-4 py-0 dark:bg-[rgb(20,20,20)]"
							>
								<div class="flex h-full items-center gap-2">
									<button
										type="button"
										class="text-subtle flex items-center gap-2 text-xs"
										aria-expanded={!collapsed[group.day]}
										onclick={() =>
											(collapsed = { ...collapsed, [group.day]: !collapsed[group.day] })}
									>
										<span class="inline-block w-3">{collapsed[group.day] ? '›' : '⌄'}</span>
										{group.day}
									</button>
									<span class="text-green ml-auto font-mono text-xs">{group.income}</span>
									<span class="text-red font-mono text-xs">{group.expense}</span>
								</div>
							</Table.Cell>
						</Table.Row>

						{#if !collapsed[group.day]}
							{#each group.rows as row (row.id)}
								<Table.Row id={row.id === 'a' ? 'spec-row' : undefined}>
									<Table.Cell class="w-10 px-4">
										<Checkbox
											checked={selected[row.id] ?? false}
											onCheckedChange={(v) => (selected = { ...selected, [row.id]: v === true })}
											aria-label="Select row"
										/>
									</Table.Cell>
									<Table.Cell id={row.id === 'a' ? 'spec-cell' : undefined} class="whitespace-nowrap">
										{row.date}
									</Table.Cell>
									<Table.Cell>
										<button
											type="button"
											class="text-left underline-offset-2 hover:underline"
											aria-expanded={expanded === row.id}
											onclick={() => (expanded = expanded === row.id ? null : row.id)}
										>
											{row.name}
										</button>
									</Table.Cell>
									<!-- In-cell editor: borderless, the full height of the
									     cell, opening the same list as the standalone combobox. -->
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
									<Table.Cell>{row.wallet}</Table.Cell>
									<Table.Cell
										class="text-right font-mono whitespace-nowrap {row.amount.startsWith('+')
											? 'text-green'
											: 'text-red'}"
									>
										{row.amount}
									</Table.Cell>
								</Table.Row>

								{#if expanded === row.id}
									<!-- The expanded cell: one row's detail, in place, spanning
									     every column so nothing has to line up with the grid. -->
									<Table.Row>
										<Table.Cell colspan={6} class="bg-muted/40 px-4 py-3">
											<dl class="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
												<div>
													<dt class="text-subtle text-xs">Note</dt>
													<dd>{row.note}</dd>
												</div>
												<div>
													<dt class="text-subtle text-xs">Wallet</dt>
													<dd>{row.wallet}</dd>
												</div>
												<div>
													<dt class="text-subtle text-xs">Category</dt>
													<dd>{rowCategory[row.id]}</dd>
												</div>
											</dl>
										</Table.Cell>
									</Table.Row>
								{/if}
							{/each}
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<!-- ------------------------------------------------------------- card -->
	<section class="space-y-4">
		{@render section('card', 'Card', 'Flat: a rule, no radius, no shadow, and the page background rather than a raised surface.')}
		<div class="grid gap-4 sm:grid-cols-2">
			<Card.Root id="spec-card">
				<Card.Header>
					<Card.Title>This month</Card.Title>
					<Card.Description>1 to 30 November 2026</Card.Description>
					<Card.Action>
						<Button variant="ghost" size="sm">Export</Button>
					</Card.Action>
				</Card.Header>
				<Card.Content>
					<p class="font-mono text-2xl">Rp 9.388.500</p>
					<p class="text-green mt-1 font-mono text-xs">+Rp 9.500.000 in, -Rp 111.500 out</p>
				</Card.Content>
				<Card.Footer>Updated 2 minutes ago</Card.Footer>
			</Card.Root>

			<Card.Root>
				<Card.Header class="border-b">
					<Card.Title>Wallets</Card.Title>
					<Card.Description>Three wallets, one currency each.</Card.Description>
				</Card.Header>
				<Card.Content class="pt-6">
					<ul class="space-y-2 text-sm">
						<li class="flex justify-between"><span>Cash</span> <span class="font-mono">Rp 412.000</span></li>
						<li class="flex justify-between"><span>BCA</span> <span class="font-mono">Rp 8.976.500</span></li>
						<li class="flex justify-between"><span>Wise</span> <span class="font-mono">$120,10</span></li>
					</ul>
				</Card.Content>
				<Card.Footer class="gap-2">
					<Button size="sm" variant="outline">Add wallet</Button>
				</Card.Footer>
			</Card.Root>
		</div>
	</section>

	<!-- --------------------------------------------------------- measured -->
	<section class="space-y-4">
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="text-lg font-medium tracking-tight">Measured against app.oewang.com</h2>
			<div class="flex items-center gap-3">
				<p class="font-mono text-xs {mismatches === 0 ? 'text-green' : 'text-red'}">
					{mismatches === 0 ? `${readings.length - skipped} match` : `${mismatches} differ`}{skipped
						? `, ${skipped} need an open menu`
						: ''}
				</p>
				<Button size="sm" variant="outline" onclick={measure}>Re-measure</Button>
			</div>
		</div>

		<div class="overflow-x-auto border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Property</Table.Head>
						<Table.Head>Live</Table.Head>
						<Table.Head>Ours</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each readings as reading (reading.label)}
						<Table.Row>
							<Table.Cell>{reading.label}</Table.Cell>
							<Table.Cell class="font-mono text-xs">{reading.live}</Table.Cell>
							<!-- Sign as well as colour, so a mismatch reads without hue. -->
							<Table.Cell
								class="font-mono text-xs {reading.skipped
									? 'text-subtle'
									: reading.ok
										? 'text-green'
										: 'text-red'}"
							>
								{reading.skipped ? '—' : reading.ok ? '=' : '≠'}
								{reading.ours}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>
</div>
