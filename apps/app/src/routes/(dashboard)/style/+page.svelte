<script lang="ts">
	/**
	 * The design system on one page.
	 *
	 * Exists so the port can be checked in a browser rather than read out of
	 * class strings, and so a regression in a primitive shows up here before
	 * it reaches a feature screen.
	 *
	 * The measured table is the point: every row is a value taken from
	 * app.oewang.com with getComputedStyle, and the second column reports what
	 * this build actually renders. A mismatch is visible without opening
	 * devtools.
	 */
	import { onMount } from 'svelte';

	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import { t } from '$lib/i18n';

	const rows = [
		{ date: '2 Nov 2026', name: 'Warung Tekko', category: 'Food', wallet: 'Cash', amount: '-Rp 87.500' },
		{ date: '1 Nov 2026', name: 'Gojek', category: 'Transport', wallet: 'Cash', amount: '-Rp 24.000' },
		{ date: '1 Nov 2026', name: 'Salary', category: 'Salary', wallet: 'BCA', amount: '+Rp 9.500.000' },
		{ date: '31 Okt 2026', name: 'Figma', category: 'Shopping', wallet: 'Wise', amount: '-$49,99' }
	];

	/** What the live app reports, measured on 2026-11-02. */
	const measured: Array<{ label: string; live: string; read: () => string }> = [
		{ label: 'Root font size', live: '15px', read: () => getComputedStyle(document.documentElement).fontSize },
		{
			label: 'Body font',
			live: 'Hedvig Letters Sans',
			read: () => getComputedStyle(document.body).fontFamily.split(',')[0].replace(/"/g, '')
		},
		{ label: 'Button radius', live: '0px', read: () => style('[data-slot=button]', 'borderRadius') },
		{ label: 'Button height', live: '33.75px', read: () => style('#spec-button', 'height') },
		{ label: 'Input height', live: '33.75px', read: () => style('#spec-input', 'height') },
		{ label: 'Input radius', live: '0px', read: () => style('#spec-input', 'borderRadius') },
		{
			label: 'Input border',
			live: '1px rgb(219, 218, 215)',
			// Chrome reports a hairline border already snapped to a device
			// pixel, so a literal 1px reads as 0.5556px on a 1.8x display.
			// Round the width and compare the colour exactly; chasing the
			// sub-pixel value would mean chasing the monitor.
			read: () =>
				`${Math.round(parseFloat(style('#spec-input', 'borderTopWidth')) * window.devicePixelRatio) / window.devicePixelRatio >= 0.5 ? '1px' : '0px'} ${style('#spec-input', 'borderTopColor')}`
		},
		{ label: 'Input padding left', live: '11.25px', read: () => style('#spec-input', 'paddingLeft') },
		{ label: 'Focus outline', live: 'none', read: () => focusOutline() },
		{ label: 'Table header height', live: '45px', read: () => style('thead th', 'height') },
		{ label: 'Table header colour', live: 'rgb(102, 102, 102)', read: () => style('thead th', 'color') },
		{ label: 'Table cell padding', live: '15px', read: () => style('tbody td', 'paddingLeft') },
		{ label: 'Sidebar width', live: '240px', read: () => style('.md\\:block.w-64', 'width') },
		{ label: 'Header height', live: '45px', read: () => style('header', 'height') },
		{ label: 'Nav item height', live: '33.75px', read: () => style('nav a, nav span[aria-disabled]', 'height') }
	];

	function style(selector: string, property: string): string {
		const el = document.querySelector(selector);
		if (!el) return 'not found';
		// Indexed access, not getPropertyValue: the latter wants kebab-case
		// and silently returns an empty string for a camelCase name, which
		// reads as a mismatch when nothing is wrong.
		const value = (getComputedStyle(el) as unknown as Record<string, string>)[property];
		return value ?? 'unreadable';
	}

	function focusOutline(): string {
		const el = document.querySelector<HTMLInputElement>('#spec-input');
		if (!el) return 'not found';
		el.focus();
		const value = getComputedStyle(el).outlineStyle;
		el.blur();
		return value;
	}

	let readings = $state<Array<{ label: string; live: string; ours: string; ok: boolean }>>([]);

	onMount(() => {
		readings = measured.map(({ label, live, read }) => {
			const ours = read();
			return { label, live, ours, ok: normalise(ours) === normalise(live) };
		});
	});

	const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
</script>

<div class="space-y-10">
	<div>
		<h1 class="font-serif text-2xl font-semibold tracking-tight">{t('style.title')}</h1>
		<p class="text-muted-foreground mt-2 max-w-2xl text-sm">{t('style.subtitle')}</p>
	</div>

	<section class="space-y-3">
		<h2 class="text-sm font-medium">{t('style.buttons')}</h2>
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
			<Button loading>Loading</Button>
			<Button disabled>Disabled</Button>
		</div>
	</section>

	<section class="max-w-sm space-y-3">
		<h2 class="text-sm font-medium">{t('style.inputs')}</h2>
		<Input id="spec-input" placeholder="Placeholder" />
		<Input value="With a value" />
		<Input disabled placeholder="Disabled" />
		<p class="text-muted-foreground text-xs">{t('style.focus_note')}</p>
		<div class="flex gap-2">
			<Badge>Badge</Badge>
			<Badge variant="secondary">Secondary</Badge>
			<Badge variant="outline">Outline</Badge>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-medium">{t('style.table')}</h2>
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{t('style.col_date')}</Table.Head>
						<Table.Head>{t('style.col_name')}</Table.Head>
						<Table.Head>{t('style.col_category')}</Table.Head>
						<Table.Head>{t('style.col_wallet')}</Table.Head>
						<Table.Head class="text-right">{t('style.col_amount')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each rows as row (row.name + row.date)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap">{row.date}</Table.Cell>
							<Table.Cell>{row.name}</Table.Cell>
							<Table.Cell>{row.category}</Table.Cell>
							<Table.Cell>{row.wallet}</Table.Cell>
							<!-- The live app colours the whole amount: red out, green
							     in. Sign and colour both, never colour alone. -->
							<Table.Cell
								class="text-right font-mono whitespace-nowrap {row.amount.startsWith('+')
									? 'text-green'
									: 'text-red'}"
							>
								{row.amount}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-medium">{t('style.measured')}</h2>
		<div class="overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{t('style.property')}</Table.Head>
						<Table.Head>app.oewang.com</Table.Head>
						<Table.Head>{t('style.ours')}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each readings as reading (reading.label)}
						<Table.Row>
							<Table.Cell>{reading.label}</Table.Cell>
							<Table.Cell class="font-mono text-xs">{reading.live}</Table.Cell>
							<!-- Sign as well as colour, so a mismatch reads without
							     relying on hue. -->
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
