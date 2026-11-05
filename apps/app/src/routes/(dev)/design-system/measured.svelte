<script lang="ts">
	/**
	 * The page measures itself.
	 *
	 * Each row holds a value read from the live app with getComputedStyle
	 * beside what this build renders. A row can only be read while its tab is
	 * on screen, so readings accumulate as the tabs are browsed and are kept
	 * afterwards: that is why this component outlives any one tab.
	 */
	import { onMount, tick } from 'svelte';

	import { Button } from '$lib/components/atoms/button';
	import * as Table from '$lib/components/atoms/table';

	let {
		/** Changes whenever the open tab does, which re-reads what is now visible. */
		trigger
	}: { trigger: unknown } = $props();

	// ------------------------------------------------- measured comparison

	type Reading = { label: string; live: string; ours: string; ok: boolean; pending: boolean };

	/** Thrown by `prop` when the element is not on screen to be measured. */
	const OFF_SCREEN = 'off-screen';

	/**
	 * The data table specimen on the Molecules tab.
	 *
	 * Measured through the roles the shell renders rather than through ids
	 * planted in the table for this page's benefit: the table is the product,
	 * and scaffolding that only the design system reads does not belong in
	 * it. Anchored to the specimen so a second table on the page cannot be
	 * measured by accident.
	 */
	const TABLE = '#specimen-data-table [role="table"]';

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
		// The old app's own shape rules, which are not "nothing is rounded":
		// the scale is live, and every shadow step above `sm` is `none`, so a
		// component keeps its `shadow-md` class and paints nothing (D66).
		{ label: 'Radius scale, sm', live: '3.5px', read: () => probe('rounded-sm', 'borderRadius') },
		{ label: 'Radius scale, md', live: '5.5px', read: () => probe('rounded-md', 'borderRadius') },
		{ label: 'Radius scale, lg', live: '7.5px', read: () => probe('rounded-lg', 'borderRadius') },
		{ label: 'Shadow above sm', live: 'none none none', read: () => ['shadow-md', 'shadow-lg', 'shadow-xl'].map((c) => probe(c, 'boxShadow')).join(' ') },
		{ label: 'Button radius', live: '0px', read: () => prop('#spec-button', 'borderRadius') },
		{ label: 'Button height', live: '33.75px', read: () => prop('#spec-button', 'height') },
		{ label: 'Button weight', live: '500', read: () => prop('#spec-button', 'fontWeight') },
		{ label: 'Button padding', live: '15px', read: () => prop('#spec-button', 'paddingLeft') },
		{ label: 'Input height', live: '33.75px', read: () => prop('#spec-input', 'height') },
		{ label: 'Input border', live: '1px rgb(219, 218, 215)', read: () => hairline('#spec-input') },
		{ label: 'Focus outline', live: 'none', read: () => whileFocused('#spec-input', (s) => s.outlineStyle) },
		{ label: 'Input padding', live: '11.25px', read: () => prop('#spec-input', 'paddingLeft') },
		{ label: 'Select trigger height', live: '33.75px', read: () => prop('#spec-select', 'height') },
		{ label: 'Checkbox size', live: '15px', read: () => prop('#spec-checkbox', 'width') },
		{ label: 'Card border', live: '1px rgb(219, 218, 215)', read: () => hairline('#spec-card') },
		{ label: 'Menu item height', live: '30px', read: () => prop('[data-slot="dropdown-menu-item"]', 'height') },
		{ label: 'Menu item padding', live: '7.5px', read: () => prop('[data-slot="dropdown-menu-item"]', 'paddingLeft') },
		// The live in-cell picker is 33.75px inside a 45px row; the old source
		// the owner asked to follow gives it the cell's full height. The
		// deliberate difference is recorded in D61, so only the border, which
		// both agree on, is compared here.
		{ label: 'In-cell picker border', live: '0px', read: () => hairlineWidth(`${TABLE} [data-slot="combobox-trigger"]`) },
		{ label: 'In-cell picker padding', live: '11.25px', read: () => prop(`${TABLE} [data-slot="combobox-trigger"]`, 'paddingLeft') },
		{ label: 'Table header height', live: '45px', read: () => prop(`${TABLE} [role="columnheader"]`, 'height') },
		{ label: 'Table header colour', live: 'rgb(102, 102, 102)', read: () => prop(`${TABLE} [role="columnheader"]`, 'color') },
		{ label: 'Table header weight', live: '500', read: () => prop(`${TABLE} [role="columnheader"]`, 'fontWeight') },
		{ label: 'Table cell padding', live: '15px', read: () => prop(`${TABLE} [role="row"]:not([data-group-row]) [role="cell"]:nth-child(2)`, 'paddingLeft') },
		{ label: 'Table row height', live: '45px', read: () => prop(`${TABLE} [role="row"]:not([data-group-row]):has([role="cell"])`, 'height') },
		{ label: 'Row rule', live: '1px on the cell', read: () => `${hairlineWidth(`${TABLE} [role="row"]:not([data-group-row]) [role="cell"]:nth-child(2)`, 'borderBottomWidth')} on the cell` },
		{ label: 'Group row height', live: '40px', read: () => prop(`${TABLE} [data-group-row]`, 'height') },
		// The day group row spans the table, so it carries the tint itself.
		{ label: 'Group row background', live: 'rgb(251, 251, 250)', read: () => prop(`${TABLE} [data-group-row]`, 'backgroundColor') }
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
	 * Re-read everything currently on screen, keeping the last value for
	 * anything that is not. Browsing the tabs fills the table in.
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
		trigger;
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

	/** Measure a utility class without hard-coding what it should resolve to. */
	function probe(className: string, property: string): string {
		const el = document.createElement('div');
		el.className = className;
		document.body.append(el);
		const value = (getComputedStyle(el) as unknown as Record<string, string>)[property];
		el.remove();
		return value ?? 'unreadable';
	}

	function sizeWeight(selector: string): string {
		return `${prop(selector, 'fontSize')} / ${prop(selector, 'fontWeight')}`;
	}

	function family(selector: string): string {
		return prop(selector, 'fontFamily').split(',')[0].replace(/["']/g, '');
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

	function whileFocused(selector: string, read: (style: CSSStyleDeclaration) => string): string {
		const el = document.querySelector<HTMLInputElement>(selector);
		if (!el) throw OFF_SCREEN;
		if (!el.checkVisibility()) throw OFF_SCREEN;
		// The field animates its border, and this reads it the moment focus
		// lands, so the transition is switched off for the measurement.
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

<section class="space-y-4">
	<div class="flex items-baseline justify-between gap-4">
		<div class="space-y-1">
			<h3 class="text-h3">Measured against app.oewang.com</h3>
			<p class="text-subtle text-small max-w-3xl">
				A row is read while its tab is on screen and keeps its value afterwards, so browsing
				the tabs fills the table in. The two menu rows need the dropdown on the Atoms tab
				opened once, then Re-measure. One value is a deliberate departure: the live app gives
				a menu item a 3.5px radius, and this rewrite squares it with everything else (D52).
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-3">
			<p class="text-small font-mono {mismatches === 0 ? 'text-green' : 'text-red'}">
				{mismatches === 0
					? `${readings.length - pending} match`
					: `${mismatches} differ`}{pending ? `, ${pending} not seen yet` : ''}
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
