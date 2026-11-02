<script lang="ts">
	/**
	 * The design system, measured against app.oewang.com.
	 *
	 * Every primitive in `$lib/components/ui` appears here, expanded: all
	 * variants, sizes and states visible at once, grouped into tabs so one
	 * screen is one kind of thing.
	 *
	 * Development only, and on a bare page: a shell around it would be two
	 * more things whose styles could be mistaken for the specimen's.
	 *
	 * The comparison table under the tabs is the point. Each row holds a value
	 * read from the live app with getComputedStyle beside what this build
	 * renders, so a drift is visible on the page instead of needing devtools
	 * and a second browser tab. A row can only be read while its tab is on
	 * screen, so readings accumulate as the tabs are browsed.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';

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
	import * as Tabs from '$lib/components/ui/tabs';
	import { Textarea } from '$lib/components/ui/textarea';

	import { readParam, writeParams } from '$lib/url-state';

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

	/*
	 * The open tab lives in `?tab=` (UI-8), so a refresh, a shared link and the
	 * back button all land on the same one. The URL is the state: reading it
	 * back is what makes a bad value harmless.
	 */
	const TABS = ['foundations', 'controls', 'forms', 'overlays', 'data'] as const;
	const activeTab = $derived(readParam(page.url, 'tab', TABS, 'foundations'));

	/** The type scale, by role. Each row is one `--text-*` token. */
	const typeScale = [
		{ token: 'text-h1', use: 'Page title, serif', size: '22.5px', weight: '400' },
		{ token: 'text-h2', use: 'Section', size: '16.875px', weight: '500' },
		{ token: 'text-h3', use: 'Sub-section', size: '15px', weight: '500' },
		{ token: 'text-h4', use: 'Label above a group', size: '11.25px', weight: '600' },
		{ token: 'text-body', use: 'Everything else', size: '13.125px', weight: '400' },
		{ token: 'text-small', use: 'Secondary line, hint', size: '11.25px', weight: '400' },
		{ token: 'text-caption', use: 'Table footnote, stamp', size: '10px', weight: '400' }
	];

	// ------------------------------------------------- measured comparison

	type Reading = { label: string; live: string; ours: string; ok: boolean; pending: boolean };

	/** Thrown by `prop` when the element is not on screen to be measured. */
	const OFF_SCREEN = 'off-screen';

	/** Values read from app.oewang.com with getComputedStyle on 2026-11-02. */
	const measured: Array<{ label: string; live: string; read: () => string }> = [
		{ label: 'Root font size', live: '15px', read: () => prop('html', 'fontSize') },
		{ label: 'Body font', live: 'Hedvig Letters Sans', read: () => family('body') },
		{ label: 'Serif weight', live: '400', read: () => prop('#spec-h1', 'fontWeight') },
		{ label: 'Heading 2', live: '16.875px / 500', read: () => sizeWeight('#spec-h2') },
		{ label: 'Heading 4', live: '11.25px / 600', read: () => sizeWeight('#spec-h4') },
		{ label: 'Body text', live: '13.125px', read: () => prop('#spec-body-text', 'fontSize') },
		{ label: 'Small text', live: '11.25px', read: () => prop('#spec-small-text', 'fontSize') },
		{ label: 'Label', live: '13.125px / 500', read: () => sizeWeight('#spec-label') },
		// The two rules the owner set for this rewrite, checked over every
		// element the page renders rather than over a chosen specimen.
		{ label: 'Elements with a radius', live: '0', read: () => count('borderRadius', (v) => v !== '0px') },
		{ label: 'Elements with a box-shadow', live: '0', read: () => count('boxShadow', (v) => v !== 'none') },
		{ label: 'Button radius', live: '0px', read: () => prop('#spec-button', 'borderRadius') },
		{ label: 'Button height', live: '33.75px', read: () => prop('#spec-button', 'height') },
		{ label: 'Button weight', live: '500', read: () => prop('#spec-button', 'fontWeight') },
		{ label: 'Button padding', live: '15px', read: () => prop('#spec-button', 'paddingLeft') },
		{ label: 'Input height', live: '33.75px', read: () => prop('#spec-input', 'height') },
		{ label: 'Input border', live: '1px rgb(219, 218, 215)', read: () => hairline('#spec-input') },
		{ label: 'Input padding', live: '11.25px', read: () => prop('#spec-input', 'paddingLeft') },
		{ label: 'Select trigger height', live: '33.75px', read: () => prop('#spec-select', 'height') },
		{ label: 'Checkbox size', live: '15px', read: () => prop('#spec-checkbox', 'width') },
		{ label: 'Card border', live: '1px rgb(219, 218, 215)', read: () => hairline('#spec-card') },
		{ label: 'Focus outline', live: 'none', read: focusOutline },
		{ label: 'Focused input border', live: 'rgb(24, 24, 27)', read: focusBorder },
		{ label: 'Menu item height', live: '30px', read: () => prop('[data-slot="dropdown-menu-item"]', 'height') },
		{ label: 'Menu item padding', live: '7.5px', read: () => prop('[data-slot="dropdown-menu-item"]', 'paddingLeft') },
		{ label: 'In-cell editor height', live: '33.75px', read: () => prop('#spec-incell', 'height') },
		{ label: 'In-cell editor border', live: '0px', read: () => hairlineWidth('#spec-incell') },
		{ label: 'Table header height', live: '45px', read: () => prop('#spec-head', 'height') },
		{ label: 'Table header colour', live: 'rgb(102, 102, 102)', read: () => prop('#spec-head', 'color') },
		{ label: 'Table header weight', live: '500', read: () => prop('#spec-head', 'fontWeight') },
		{ label: 'Table cell padding', live: '15px', read: () => prop('#spec-cell', 'paddingLeft') },
		{ label: 'Table row height', live: '45px', read: () => prop('#spec-row', 'height') },
		{ label: 'Row rule', live: '1px on the cell', read: () => `${hairlineWidth('#spec-cell', 'borderBottomWidth')} on the cell` },
		{ label: 'Group row height', live: '40px', read: () => prop('#spec-group-row', 'height') },
		// The tint sits on the cell, as the rule does; a tr with a background
		// paints under the cells rather than through them.
		{ label: 'Group row background', live: 'rgb(251, 251, 250)', read: () => prop('#spec-group-cell', 'backgroundColor') }
	];

	let readings = $state<Reading[]>(
		measured.map(({ label, live }) => ({
			label,
			live,
			ours: 'not measured yet',
			ok: false,
			pending: true
		}))
	);

	/**
	 * Re-read everything that is currently on screen, keeping the last value
	 * for anything that is not. Browsing the tabs fills the table in.
	 */
	function measure() {
		readings = readings.map((previous, i) => {
			const { label, live, read } = measured[i];
			let ours: string;
			try {
				ours = read();
			} catch (error) {
				if (error === OFF_SCREEN) return previous;
				ours = 'unreadable';
			}
			return { label, live, ours, ok: same(ours, live), pending: false };
		});
	}

	onMount(measure);

	$effect(() => {
		activeTab;
		tick().then(measure);
	});

	function prop(selector: string, property: string): string {
		const el = selector === 'html' ? document.documentElement : document.querySelector(selector);
		if (!el) throw OFF_SCREEN;
		// A tab that is not selected keeps its content in the DOM but hidden,
		// where a height reads `auto`. Treat that as "cannot measure here"
		// rather than as a difference.
		if (!el.checkVisibility()) throw OFF_SCREEN;
		// Indexed access, not getPropertyValue: the latter wants kebab-case and
		// returns an empty string for a camelCase name, which reads as a
		// mismatch when nothing is wrong.
		return (getComputedStyle(el) as unknown as Record<string, string>)[property] ?? 'unreadable';
	}

	function sizeWeight(selector: string): string {
		return `${prop(selector, 'fontSize')} / ${prop(selector, 'fontWeight')}`;
	}

	function family(selector: string): string {
		return prop(selector, 'fontFamily').split(',')[0].replace(/["']/g, '');
	}

	/**
	 * Count every element on the page whose computed value breaks the rule.
	 * Hidden tabs are counted too: a corner that is round only while out of
	 * view is still a round corner.
	 */
	function count(property: string, offending: (value: string) => boolean): string {
		let n = 0;
		for (const el of document.querySelectorAll('*')) {
			const value = (getComputedStyle(el) as unknown as Record<string, string>)[property];
			if (value && offending(value)) n += 1;
		}
		return String(n);
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
		return whileFocused('#spec-input', (style) => style.outlineStyle);
	}

	/**
	 * The one indication of focus the product has (D54). There is no outline
	 * and no ring, so a focused field says so by turning its border `primary`.
	 */
	function focusBorder(): string {
		return whileFocused('#spec-input', (style) => style.borderTopColor);
	}

	function whileFocused(selector: string, read: (style: CSSStyleDeclaration) => string): string {
		const el = document.querySelector<HTMLInputElement>(selector);
		if (!el) throw OFF_SCREEN;
		if (!el.checkVisibility()) throw OFF_SCREEN;
		// The field animates its border, and this reads it the moment focus
		// lands, so the transition is switched off for the measurement.
		// Otherwise the value is whatever colour it happened to be passing
		// through, which looks like a mismatch and changes on every press.
		const transition = el.style.transition;
		el.style.transition = 'none';
		el.focus();
		const value = read(getComputedStyle(el));
		el.blur();
		el.style.transition = transition;
		return value;
	}

	const same = (a: string, b: string) =>
		a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

	const mismatches = $derived(readings.filter((r) => !r.ok && !r.pending).length);
	const pending = $derived(readings.filter((r) => r.pending).length);
</script>

<svelte:head><title>Design system</title></svelte:head>

<Toaster />

{#snippet heading(title: string, note?: string)}
	<div class="space-y-1">
		<h2 class="text-h2">{title}</h2>
		{#if note}<p class="text-subtle text-small">{note}</p>{/if}
	</div>
{/snippet}

<div class="mx-auto max-w-5xl space-y-8 pb-24">
	<header>
		<h1 id="spec-h1">Design system</h1>
		<p class="text-subtle text-body mt-2 max-w-2xl">
			Every primitive in <code class="text-small font-mono">$lib/components/ui</code>, measured
			against app.oewang.com rather than estimated. Nothing is rounded and nothing casts a
			shadow. Development only; this route answers 404 anywhere else.
		</p>
	</header>

	<Tabs.Root value={activeTab} onValueChange={(tab) => writeParams({ tab })}>
		<Tabs.List>
			<Tabs.Trigger value="foundations">Foundations</Tabs.Trigger>
			<Tabs.Trigger value="controls">Controls</Tabs.Trigger>
			<Tabs.Trigger value="forms">Forms</Tabs.Trigger>
			<Tabs.Trigger value="overlays">Overlays</Tabs.Trigger>
			<Tabs.Trigger value="data">Data</Tabs.Trigger>
		</Tabs.List>

		<!-- --------------------------------------------------- foundations -->
		<Tabs.Content value="foundations" class="space-y-10 pt-4">
			<section class="space-y-4">
				{@render heading('Type scale', 'Named by role, not by size. Each token carries its own size, line height, weight and letter spacing, so one class sets all four.')}

				<div class="space-y-3">
					<p class="text-h1">Heading 1, serif, the page title</p>
					<p id="spec-h2" class="text-h2">Heading 2, a section</p>
					<p class="text-h3">Heading 3, a sub-section</p>
					<p id="spec-h4" class="text-h4">HEADING 4, A LABEL ABOVE A GROUP</p>
					<p id="spec-body-text" class="text-body">
						Body. Hedvig Letters Sans at 13.125px, the size almost everything uses: of the
						elements on the live transactions page, 86 render at it.
					</p>
					<p id="spec-small-text" class="text-subtle text-small">
						Small. Secondary lines, group labels, hints.
					</p>
					<p class="text-subtle text-caption">CAPTION. A FOOTNOTE OR A STAMP.</p>
					<p class="text-body font-mono">Geist Mono, for amounts and identifiers.</p>
				</div>

				<div class="overflow-x-auto border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Token</Table.Head>
								<Table.Head>Use</Table.Head>
								<Table.Head>Size</Table.Head>
								<Table.Head>Weight</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each typeScale as row (row.token)}
								<Table.Row>
									<Table.Cell class="text-small font-mono">{row.token}</Table.Cell>
									<Table.Cell>{row.use}</Table.Cell>
									<Table.Cell class="text-small font-mono">{row.size}</Table.Cell>
									<Table.Cell class="text-small font-mono">{row.weight}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>

				<p class="text-subtle text-small max-w-2xl">
					h1 to h4 take these tokens in the base layer, so a plain heading element is
					already correct and a utility still wins where a page needs something else. The
					serif ships one weight, 400, and font-synthesis-weight is off, so a stray
					font-semibold cannot fake a bold.
				</p>
			</section>

			<section class="space-y-4">
				{@render heading('Colour')}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{#each [['background', 'bg-background'], ['foreground', 'bg-foreground'], ['primary', 'bg-primary'], ['secondary', 'bg-secondary'], ['muted', 'bg-muted'], ['accent', 'bg-accent'], ['card', 'bg-card'], ['popover', 'bg-popover'], ['border', 'bg-border'], ['sidebar', 'bg-sidebar'], ['destructive', 'bg-destructive'], ['subtle', 'bg-subtle'], ['green', 'bg-green'], ['red', 'bg-red']] as [name, cls] (name)}
						<div class="space-y-1">
							<div class="h-10 border {cls}"></div>
							<p class="text-subtle text-small font-mono">{name}</p>
						</div>
					{/each}
				</div>
			</section>

			<section class="space-y-4">
				{@render heading('Shape', 'Two rules, and the table below checks both over every element on this page.')}
				<ul class="text-body list-disc space-y-1 pl-5">
					<li>No radius. The whole scale is zero, so a leftover rounded-lg is square.</li>
					<li>
						No shadow. Every step of the shadow scale is none, and no component carries a
						shadow or ring class, so the computed property reads none rather than a
						cleared-but-present shadow. The check below is exact.
					</li>
				</ul>
			</section>
		</Tabs.Content>

		<!-- ------------------------------------------------------ controls -->
		<Tabs.Content value="controls" class="space-y-10 pt-4">
			<section class="space-y-4">
				{@render heading('Button')}
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
					<Button href="#top">As a link</Button>
				</div>
			</section>

			<section class="space-y-4">
				{@render heading('Badge')}
				<div class="flex flex-wrap items-center gap-2">
					<Badge>Default</Badge>
					<Badge variant="secondary">Secondary</Badge>
					<Badge variant="outline">Outline</Badge>
					<Badge variant="destructive">Destructive</Badge>
					<Badge variant="ghost">Ghost</Badge>
					<Badge variant="link" href="#top">Link</Badge>
				</div>
			</section>

			<section class="space-y-4">
				{@render heading('Checkbox')}
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

			<section class="space-y-4">
				{@render heading('Separator')}
				<Separator />
				<!-- A vertical separator stretches to its row, and items-center
				     stops it, so the height is given here as the live header does. -->
				<div class="text-body flex h-8 items-center gap-3">
					<span>Transactions</span>
					<Separator orientation="vertical" class="h-4" />
					<span>Chat</span>
					<Separator orientation="vertical" class="h-4" />
					<span>Settings</span>
				</div>
			</section>

			<section class="space-y-4">
				{@render heading('Tabs', 'The control this page is built from: a rule under the row, which the active trigger overdraws.')}
				<Tabs.Root value="week">
					<Tabs.List>
						<Tabs.Trigger value="week">This week</Tabs.Trigger>
						<Tabs.Trigger value="month">This month</Tabs.Trigger>
						<Tabs.Trigger value="year">This year</Tabs.Trigger>
						<Tabs.Trigger value="all" disabled>All time</Tabs.Trigger>
					</Tabs.List>
					<Tabs.Content value="week" class="text-body pt-3">
						Seven days of transactions.
					</Tabs.Content>
					<Tabs.Content value="month" class="text-body pt-3">November 2026.</Tabs.Content>
					<Tabs.Content value="year" class="text-body pt-3">2026 so far.</Tabs.Content>
				</Tabs.Root>
			</section>
		</Tabs.Content>

		<!-- --------------------------------------------------------- forms -->
		<Tabs.Content value="forms" class="space-y-10 pt-4">
			<section class="space-y-4">
				{@render heading('Input, label, textarea', 'Square, a plain border, and no focus ring anywhere.')}
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
						<p class="text-destructive text-small">Enter an email address.</p>
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

			<section class="space-y-4">
				{@render heading('Input group', 'An input with something attached: an icon, a unit, or a button.')}
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

			<section class="space-y-4">
				{@render heading('Select and combobox', 'The combobox is a button that opens a searchable list, as the live app builds it, not a native select.')}
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
		</Tabs.Content>

		<!-- ------------------------------------------------------ overlays -->
		<Tabs.Content value="overlays" class="space-y-10 pt-4">
			<section class="space-y-4">
				{@render heading('Command', 'The same list the combobox opens, inline so its own styling is visible.')}
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
								<Command.Shortcut>Cmd N</Command.Shortcut>
							</Command.Item>
						</Command.Group>
					</Command.List>
				</Command.Root>
			</section>

			<section class="space-y-4">
				{@render heading('Menus and overlays', 'Square surfaces, a 1px rule, no shadow. The two menu rows in the table below measure once the dropdown has been opened.')}
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
									<DropdownMenu.Shortcut>Cmd E</DropdownMenu.Shortcut>
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
							<p class="text-body">A popover holds anything: a form, a filter, a date range.</p>
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
									It is removed from the list and the wallet balance is recomputed.
									Deletes are soft, so it can be restored.
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
					<Button
						variant="outline"
						onclick={() => toast.error('Wallet balance would go negative')}
					>
						Toast, error
					</Button>
				</div>
			</section>
		</Tabs.Content>

		<!-- ---------------------------------------------------------- data -->
		<Tabs.Content value="data" class="space-y-10 pt-4">
			<section class="space-y-4">
				{@render heading('Data table', 'Rows group by day with that day’s totals on the right, a group collapses, a row expands in place, and the category is edited in the cell. Amounts carry colour and a sign, never colour alone.')}

				<div class="overflow-x-auto border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-10"></Table.Head>
								<Table.Head id="spec-head">Date</Table.Head>
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
												class="text-subtle text-small flex items-center gap-2"
												aria-expanded={!collapsed[group.day]}
												onclick={() =>
													(collapsed = { ...collapsed, [group.day]: !collapsed[group.day] })}
											>
												<span class="inline-block w-3">
													{collapsed[group.day] ? '›' : '⌄'}
												</span>
												{group.day}
											</button>
											<span class="text-green text-small ml-auto font-mono">{group.income}</span>
											<span class="text-red text-small font-mono">{group.expense}</span>
										</div>
									</Table.Cell>
								</Table.Row>

								{#if !collapsed[group.day]}
									{#each group.rows as row (row.id)}
										<Table.Row id={row.id === 'a' ? 'spec-row' : undefined}>
											<Table.Cell class="w-10 px-4">
												<Checkbox
													checked={selected[row.id] ?? false}
													onCheckedChange={(v) =>
														(selected = { ...selected, [row.id]: v === true })}
													aria-label="Select row"
												/>
											</Table.Cell>
											<Table.Cell
												id={row.id === 'a' ? 'spec-cell' : undefined}
												class="whitespace-nowrap"
											>
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
											<!-- The expanded cell: one row's detail, in place,
											     spanning every column so nothing has to line up. -->
											<Table.Row>
												<Table.Cell colspan={6} class="bg-muted/40 px-4 py-3">
													<dl class="text-body grid gap-x-8 gap-y-1 sm:grid-cols-3">
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

			<section class="space-y-4">
				{@render heading('Card', 'Flat: a rule, no radius, no shadow, and the page background rather than a raised surface.')}
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
							<p class="text-h1 font-mono">Rp 9.388.500</p>
							<p class="text-green text-small mt-1 font-mono">
								+Rp 9.500.000 in, -Rp 111.500 out
							</p>
						</Card.Content>
						<Card.Footer>Updated 2 minutes ago</Card.Footer>
					</Card.Root>

					<Card.Root>
						<Card.Header class="border-b">
							<Card.Title>Wallets</Card.Title>
							<Card.Description>Three wallets, one currency each.</Card.Description>
						</Card.Header>
						<Card.Content class="text-body pt-6">
							<ul class="space-y-2">
								<li class="flex justify-between">
									<span>Cash</span> <span class="font-mono">Rp 412.000</span>
								</li>
								<li class="flex justify-between">
									<span>BCA</span> <span class="font-mono">Rp 8.976.500</span>
								</li>
								<li class="flex justify-between">
									<span>Wise</span> <span class="font-mono">$120,10</span>
								</li>
							</ul>
						</Card.Content>
						<Card.Footer class="gap-2">
							<Button size="sm" variant="outline">Add wallet</Button>
						</Card.Footer>
					</Card.Root>
				</div>
			</section>
		</Tabs.Content>
	</Tabs.Root>

	<!-- -------------------------------------------------------- measured -->
	<section class="space-y-4 pt-4">
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="text-h2">Measured against app.oewang.com</h2>
			<div class="flex items-center gap-3">
				<p class="text-small font-mono {mismatches === 0 ? 'text-green' : 'text-red'}">
					{mismatches === 0
						? `${readings.length - pending} match`
						: `${mismatches} differ`}{pending ? `, ${pending} not seen yet` : ''}
				</p>
				<Button size="sm" variant="outline" onclick={measure}>Re-measure</Button>
			</div>
		</div>

		<p class="text-subtle text-small max-w-3xl">
			A row is read while its tab is on screen and keeps its value afterwards, so browsing the
			tabs fills the table in. The two menu rows need the dropdown opened once, then
			Re-measure. One value is a deliberate departure: the live app gives a menu item a 3.5px
			radius, and this rewrite squares it with everything else (D52).
		</p>

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
							<Table.Cell class="text-small font-mono">{reading.live}</Table.Cell>
							<!-- Sign as well as colour, so a mismatch reads without hue. -->
							<Table.Cell
								class="text-small font-mono {reading.pending
									? 'text-subtle'
									: reading.ok
										? 'text-green'
										: 'text-red'}"
							>
								{reading.pending ? '—' : reading.ok ? '=' : '≠'}
								{reading.ours}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>
</div>
