<script lang="ts">
	/** Type, colour and shape: the tokens every component is built from. */
	import * as Table from '$lib/components/atoms/table';
	import Specimen from '../specimen.svelte';

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

</script>

<Specimen title="Type scale"
	note="Named by role, not by size. Each token carries its own size, line height, weight and letter spacing, so one class sets all four.">

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
</Specimen>

<Specimen title="Colour">
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each colours as [name, cls] (name)}
			<div class="space-y-1">
				<div class="h-10 border {cls}"></div>
				<p class="text-subtle text-small font-mono">{name}</p>
			</div>
		{/each}
	</div>
</Specimen>

<Specimen title="Shape"
	note="Copied from the old app, not invented here, and the table at the foot of the page checks both.">
	<ul class="text-body list-disc space-y-1 pl-5">
		<li>
			The radius scale is live: --radius is 0.5rem, so rounded-sm is 3.5px, rounded-md 5.5px
			and rounded-lg 7.5px. Almost nothing applies it. A button, an input, a card and a table
			are square because their own class strings carry no radius; an avatar, a switch, a
			radio, a progress track, a pill badge and a kbd are round because theirs say so.
		</li>
		<li>
			The shadow scale stops at sm: every step above it is none, so a component keeps the
			shadow-md or shadow-lg class it was written with and paints nothing.
		</li>
	</ul>
</Specimen>
