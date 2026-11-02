<script lang="ts">
	/** Type, colour and shape: the tokens every component is built from. */
	import * as Table from '$lib/components/atoms/table';

	const typeScale = [
		{ token: 'text-h1', use: 'Page title, serif', size: '22.5px', weight: '400' },
		{ token: 'text-h2', use: 'Section', size: '16.875px', weight: '500' },
		{ token: 'text-h3', use: 'Sub-section', size: '15px', weight: '500' },
		{ token: 'text-h4', use: 'Label above a group', size: '11.25px', weight: '600' },
		{ token: 'text-body', use: 'Everything else', size: '13.125px', weight: '400' },
		{ token: 'text-small', use: 'Secondary line, hint', size: '11.25px', weight: '400' },
		{ token: 'text-caption', use: 'Table footnote, stamp', size: '10px', weight: '400' }
	];

	const colours = [
		['background', 'bg-background'],
		['foreground', 'bg-foreground'],
		['primary', 'bg-primary'],
		['secondary', 'bg-secondary'],
		['muted', 'bg-muted'],
		['accent', 'bg-accent'],
		['card', 'bg-card'],
		['popover', 'bg-popover'],
		['border', 'bg-border'],
		['sidebar', 'bg-sidebar'],
		['destructive', 'bg-destructive'],
		['subtle', 'bg-subtle'],
		['green', 'bg-green'],
		['red', 'bg-red']
	];

	let { heading }: { heading: import('svelte').Snippet<[string, string?]> } = $props();
</script>

<section class="space-y-4">
	{@render heading('Type scale', 'Named by role, not by size. Each token carries its own size, line height, weight and letter spacing, so one class sets all four.')}

	<div class="space-y-3">
		<p class="text-h1">Heading 1, serif, the page title</p>
		<p id="spec-h2" class="text-h2">Heading 2, a section</p>
		<p class="text-h3">Heading 3, a sub-section</p>
		<p id="spec-h4" class="text-h4">HEADING 4, A LABEL ABOVE A GROUP</p>
		<p id="spec-body-text" class="text-body">
			Body. Hedvig Letters Sans at 13.125px, the size almost everything uses: of the elements on
			the live transactions page, 86 render at it.
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
		h1 to h4 take these tokens in the base layer, so a plain heading element is already correct
		and a utility still wins where a page needs something else. The serif ships one weight, 400,
		and font-synthesis-weight is off, so a stray font-semibold cannot fake a bold.
	</p>
</section>

<section class="space-y-4">
	{@render heading('Colour')}
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each colours as [name, cls] (name)}
			<div class="space-y-1">
				<div class="h-10 border {cls}"></div>
				<p class="text-subtle text-small font-mono">{name}</p>
			</div>
		{/each}
	</div>
</section>

<section class="space-y-4">
	{@render heading('Shape', 'Two rules, and the table at the foot of the page checks both over every element it renders.')}
	<ul class="text-body list-disc space-y-1 pl-5">
		<li>No radius. The whole scale is zero, so a leftover rounded-lg is square.</li>
		<li>
			No shadow. Every step of the shadow scale is none and no component carries a shadow or
			ring class, so the computed property reads none.
		</li>
	</ul>
	<p class="text-subtle text-small max-w-2xl">
		These two rules are where the port departs from the old package: the old avatar, switch,
		radio, progress track, kbd and menu item are rounded, and its tooltip and alert dialog cast a
		shadow. Everything here is square and flat (D52).
	</p>
</section>
