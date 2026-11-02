<script lang="ts">
	/**
	 * The design system, measured against app.oewang.com.
	 *
	 * Organised the way the components are: foundations, then atoms,
	 * molecules and organisms, one tab each, mirroring the folders under
	 * `$lib/components` and the old app's `packages/ui/src/components`.
	 *
	 * Development only, and on a bare page: a shell around it would be two
	 * more things whose styles could be mistaken for the specimen's.
	 *
	 * The comparison table under the tabs is the point. Each row holds a value
	 * read from the live app with getComputedStyle beside what this build
	 * renders. A row can only be read while its tab is on screen, so readings
	 * accumulate as the tabs are browsed.
	 */
	import { onMount, tick } from 'svelte';

	import { page } from '$app/state';

	import { Button } from '$lib/components/atoms/button';
	import { Toaster } from '$lib/components/atoms/sonner';
	import * as Table from '$lib/components/atoms/table';
	import * as Tabs from '$lib/components/atoms/tabs';
	import { readParam, writeParams } from '$lib/url-state';

	import Atoms from './sections/atoms.svelte';
	import Foundations from './sections/foundations.svelte';
	import Molecules from './sections/molecules.svelte';
	import Organisms from './sections/organisms.svelte';

	/*
	 * The open tab lives in `?tab=` (UI-8), so a refresh, a shared link and the
	 * back button all land on the same one. The URL is the state: reading it
	 * back is what makes a bad value harmless.
	 */
	const TABS = ['foundations', 'atoms', 'molecules', 'organisms'] as const;
	const activeTab = $derived(readParam(page.url, 'tab', TABS, 'foundations'));

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
			Every component in <code class="text-small font-mono">$lib/components</code>, by atomic
			layer, ported from the old app's <code class="text-small font-mono">packages/ui</code> and
			measured against app.oewang.com rather than estimated. Nothing is rounded and nothing
			casts a shadow. Development only; this route answers 404 anywhere else.
		</p>
	</header>

	<Tabs.Root value={activeTab} onValueChange={(tab) => writeParams({ tab })}>
		<Tabs.List variant="line">
			<Tabs.Trigger value="foundations" variant="line">Foundations</Tabs.Trigger>
			<Tabs.Trigger value="atoms" variant="line">Atoms</Tabs.Trigger>
			<Tabs.Trigger value="molecules" variant="line">Molecules</Tabs.Trigger>
			<Tabs.Trigger value="organisms" variant="line">Organisms</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="foundations" class="space-y-10 pt-4">
			<Foundations {heading} />
		</Tabs.Content>
		<Tabs.Content value="atoms" class="space-y-10 pt-4">
			<Atoms {heading} />
		</Tabs.Content>
		<Tabs.Content value="molecules" class="space-y-10 pt-4">
			<Molecules {heading} />
		</Tabs.Content>
		<Tabs.Content value="organisms" class="space-y-10 pt-4">
			<Organisms {heading} />
		</Tabs.Content>
	</Tabs.Root>

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
			tabs fills the table in. The two menu rows need the dropdown on the Atoms tab opened
			once, then Re-measure. One value is a deliberate departure: the live app gives a menu item
			a 3.5px radius, and this rewrite squares it with everything else (D52).
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
