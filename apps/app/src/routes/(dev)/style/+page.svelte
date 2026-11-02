<script lang="ts">
	/**
	 * The design system, measured against app.oewang.com.
	 *
	 * Development only, and on a bare page: a shell around it would be two
	 * more things whose styles could be mistaken for the specimen's.
	 *
	 * The comparison table at the end is the point. Every row holds a value
	 * read from the live app with getComputedStyle beside what this build
	 * renders right now, so a drift is visible on the page instead of needing
	 * devtools and a second browser tab.
	 */
	import { onMount } from 'svelte';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
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

	// ------------------------------------------------- measured comparison

	type Reading = { label: string; live: string; ours: string; ok: boolean };

	/** Values read from app.oewang.com with getComputedStyle on 2026-11-02. */
	const measured: Array<{ label: string; live: string; read: () => string }> = [
		{ label: 'Root font size', live: '15px', read: () => prop('html', 'fontSize') },
		{ label: 'Body font', live: 'Hedvig Letters Sans', read: () => family('body') },
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
		{ label: 'Focus outline', live: 'none', read: focusOutline },
		{ label: 'In-cell editor height', live: '33.75px', read: () => prop('#spec-incell', 'height') },
		{ label: 'In-cell editor border', live: '0px', read: () => hairlineWidth('#spec-incell') },
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

	onMount(() => {
		readings = measured.map(({ label, live, read }) => {
			let ours: string;
			try {
				ours = read();
			} catch {
				ours = 'unreadable';
			}
			return { label, live, ours, ok: same(ours, live) };
		});
	});

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

	const mismatches = $derived(readings.filter((r) => !r.ok).length);
</script>

<svelte:head><title>Design system</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-12">
	<header>
		<h1 class="font-serif text-2xl font-semibold tracking-tight">Design system</h1>
		<p class="text-muted-foreground mt-2 max-w-2xl text-sm">
			Measured against app.oewang.com, not estimated. Development only; this route answers 404
			anywhere else.
		</p>
	</header>

	<!-- ------------------------------------------------------- typography -->
	<section class="space-y-4">
		<h2 id="spec-h2" class="text-lg font-medium tracking-tight">Typography</h2>
		<div class="space-y-2">
			<p class="font-serif text-2xl font-semibold tracking-tight">
				Hedvig Letters Serif, headings
			</p>
			<p id="spec-body-text" class="text-sm">
				Hedvig Letters Sans at 13.125px. This is the size almost everything uses: of the
				elements on the live transactions page, 86 render at it.
			</p>
			<p id="spec-small-text" class="text-muted-foreground text-xs">
				11.25px, muted. Secondary lines, group labels, hints.
			</p>
			<p class="font-mono text-sm">Geist Mono 13.125px, for amounts and identifiers.</p>
		</div>
		<dl class="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
			<div><dt class="inline font-medium">base</dt> <dd class="inline">15px</dd></div>
			<div><dt class="inline font-medium">text-sm</dt> <dd class="inline">13.125px</dd></div>
			<div><dt class="inline font-medium">text-xs</dt> <dd class="inline">11.25px</dd></div>
			<div><dt class="inline font-medium">text-lg</dt> <dd class="inline">16.875px</dd></div>
		</dl>
	</section>

	<!-- ----------------------------------------------------------- colour -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium tracking-tight">Colour</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each [['background', 'bg-background'], ['foreground', 'bg-foreground'], ['primary', 'bg-primary'], ['secondary', 'bg-secondary'], ['muted', 'bg-muted'], ['accent', 'bg-accent'], ['card', 'bg-card'], ['border', 'bg-border'], ['destructive', 'bg-destructive'], ['green', 'bg-green'], ['red', 'bg-red'], ['sidebar', 'bg-sidebar']] as [name, cls] (name)}
				<div class="space-y-1">
					<div class="h-10 border {cls}"></div>
					<p class="text-muted-foreground font-mono text-xs">{name}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- ---------------------------------------------------------- buttons -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium tracking-tight">Buttons</h2>
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
			<Button size="icon" aria-label="Icon button">+</Button>
			<Button loading>Loading</Button>
			<Button disabled>Disabled</Button>
		</div>
	</section>

	<!-- ----------------------------------------------------------- fields -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium tracking-tight">Fields</h2>
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
			<div class="space-y-2 sm:col-span-2">
				<Label for="spec-textarea">Textarea</Label>
				<Textarea id="spec-textarea" placeholder="A note on this transaction" rows={3} />
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-6">
			<div class="flex items-center gap-2">
				<Checkbox id="spec-checkbox" />
				<Label for="spec-checkbox">Checkbox</Label>
			</div>
			<div class="flex items-center gap-2">
				<Badge>Badge</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="destructive">Destructive</Badge>
			</div>
		</div>
		<p class="text-muted-foreground text-xs">
			No focus ring anywhere. The live app sets outline:none on :focus and :focus-visible and
			this matches it; the accessibility cost is recorded in D51.
		</p>
	</section>

	<!-- ------------------------------------------------------- data table -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium tracking-tight">Data table</h2>
		<p class="text-muted-foreground text-sm">
			Rows group by day with the day's totals on the right, a group collapses, and a row expands
			in place. Amounts carry colour and a sign, never colour alone.
		</p>

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
										class="text-muted-foreground flex items-center gap-2 text-xs"
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
													<dt class="text-muted-foreground text-xs">Note</dt>
													<dd>{row.note}</dd>
												</div>
												<div>
													<dt class="text-muted-foreground text-xs">Wallet</dt>
													<dd>{row.wallet}</dd>
												</div>
												<div>
													<dt class="text-muted-foreground text-xs">Category</dt>
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

	<!-- --------------------------------------------------------- measured -->
	<section class="space-y-4">
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="text-lg font-medium tracking-tight">Measured against app.oewang.com</h2>
			<p class="font-mono text-xs {mismatches === 0 ? 'text-green' : 'text-red'}">
				{mismatches === 0 ? `all ${readings.length} match` : `${mismatches} differ`}
			</p>
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
							<Table.Cell class="font-mono text-xs {reading.ok ? 'text-green' : 'text-red'}">
								{reading.ok ? '=' : '≠'}
								{reading.ours}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>
</div>
