<script lang="ts">
	/**
	 * The design system on one page.
	 *
	 * Exists so the ported look can be checked in a browser rather than read
	 * out of class strings, and so a regression in a primitive is visible
	 * somewhere before it reaches a feature screen.
	 */
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
</script>

<div class="space-y-10">
	<div>
		<h1 class="font-serif text-2xl font-semibold tracking-tight">{t('style.title')}</h1>
		<p class="text-muted-foreground mt-2 text-sm">{t('style.subtitle')}</p>
	</div>

	<section class="space-y-3">
		<h2 class="text-sm font-medium">{t('style.buttons')}</h2>
		<div class="flex flex-wrap items-center gap-2">
			<Button>Default</Button>
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
		<Input placeholder="Placeholder" />
		<Input value="With a value" />
		<Input disabled placeholder="Disabled" />
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
							     in. Sign and colour both, never colour alone (UI-7). -->
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
</div>
