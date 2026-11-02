<script lang="ts">
	/**
	 * The CSV import wizard (TXN-11, D28).
	 *
	 * Four steps, ported from the old wizard: pick a file, map the columns,
	 * match the values, review and commit. The step lives in `?step=` so a
	 * reload lands where the user was (UI-8).
	 *
	 * The browser reads the file's shape and nothing else: column names and
	 * cell text. Every figure and every date is parsed in Rust, which is why
	 * the commit sends the rows as they came out of the file rather than as
	 * transactions. The model, when it is available, maps column names once
	 * and never sees a row.
	 */
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import FileUp from '@lucide/svelte/icons/file-up';

	import { enhance } from '$app/forms';
	import { page } from '$app/state';

	import { Badge } from '$lib/components/atoms/badge';
	import { Button } from '$lib/components/atoms/button';
	import { Input } from '$lib/components/atoms/input';
	import { Label } from '$lib/components/atoms/label';
	import FormError from '$lib/components/shell/form-error.svelte';
	import { parseDelimited, type ParsedFile } from '$lib/csv';
	import { messageForCode } from '$lib/errors';
	import { t } from '$lib/i18n';
	import { readParam, writeParams } from '$lib/url-state';

	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const STEPS = ['file', 'columns', 'values', 'review'] as const;
	const step = $derived(readParam(page.url, 'step', STEPS, 'file'));

	const FIELDS = [
		{ key: 'date', label: 'Date', required: true },
		{ key: 'name', label: 'Description', required: false },
		{ key: 'amount', label: 'Amount (one signed column)', required: false },
		{ key: 'amount_out', label: 'Money out (debit)', required: false },
		{ key: 'amount_in', label: 'Money in (credit)', required: false },
		{ key: 'category', label: 'Category', required: false },
		{ key: 'description', label: 'Notes', required: false }
	] as const;

	type FieldKey = (typeof FIELDS)[number]['key'];

	let file = $state<ParsedFile>({ columns: [], rows: [], dropped: 0 });
	let fileName = $state('');
	let mapping = $state<Partial<Record<FieldKey, string>>>({});
	/*
	 * The wallet every row lands in. It starts at the workspace default and
	 * follows the load until the user picks one, which is what `$state`
	 * seeded from `data` would not do.
	 */
	let chosenWallet = $state('');
	const walletId = $derived(
		chosenWallet ||
			data.wallets.find((wallet) => wallet.is_default)?.id ||
			data.wallets[0]?.id ||
			''
	);
	/** The file's category names, matched to a category in this workspace. */
	let categoryMatches = $state<Record<string, string>>({});
	let mappingPending = $state(false);
	let mappingFailed = $state(false);

	const selectClass = 'border-input bg-background h-9 w-full border px-3 text-sm';

	/*
	 * A reload keeps the step but not the file: the rows live in this
	 * component, and a browser will not hand back a file input's contents.
	 * Rather than show an empty step three, start again at the file.
	 */
	$effect(() => {
		if (file.rows.length === 0 && step !== 'file' && !result) writeParams({ step: null });
	});

	/** The mapping is complete enough to transform rows. */
	const mappable = $derived(
		!!mapping.date && (!!mapping.amount || !!mapping.amount_out || !!mapping.amount_in)
	);

	/** Distinct category names the file holds, as text. */
	const fileCategories = $derived(
		mapping.category
			? [...new Set(file.rows.map((row) => row[mapping.category!] ?? '').filter(Boolean))]
			: []
	);

	async function readFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const chosen = input.files?.[0];
		if (!chosen) return;

		fileName = chosen.name;
		file = parseDelimited(await chosen.text());
		mapping = {};
		categoryMatches = {};

		await writeParams({ step: 'columns' });
		await proposeMapping();
	}

	/**
	 * Ask the assistant which column holds what.
	 *
	 * Column names and two sample rows go out; a mapping comes back. The
	 * call failing or timing out leaves the step empty and the user maps by
	 * hand: the wizard never blocks on it (AI-9).
	 */
	async function proposeMapping() {
		if (file.columns.length === 0) return;

		mappingPending = true;
		mappingFailed = false;

		try {
			const response = await fetch('/transactions/import/map-columns', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					columns: file.columns,
					sample_rows: file.rows.slice(0, 2)
				})
			});

			if (!response.ok) throw new Error(String(response.status));

			const proposed = (await response.json()) as Partial<Record<FieldKey, string>>;
			// Only names the file actually has: a proposal that invented a
			// column would otherwise map a field to nothing.
			mapping = Object.fromEntries(
				Object.entries(proposed).filter(
					([, column]) => typeof column === 'string' && file.columns.includes(column)
				)
			);
		} catch {
			mappingFailed = true;
		} finally {
			mappingPending = false;
		}
	}

	/** What the commit will send, as JSON, for the hidden fields. */
	const payload = $derived({
		mapping: JSON.stringify(mapping),
		rows: JSON.stringify(file.rows),
		categories: JSON.stringify(
			Object.fromEntries(
				Object.entries(categoryMatches)
					.filter(([, id]) => id !== '')
					.map(([name, id]) => [name.toLowerCase(), id])
			)
		)
	});

	const result = $derived(form && 'result' in form ? form.result : null);
</script>

<svelte:head><title>{t('import.title')} · {t('app.name')}</title></svelte:head>

<div class="mx-auto flex max-w-3xl flex-col gap-6">
	<div>
		<h1 class="text-h2">{t('import.title')}</h1>
		<p class="text-subtle text-small mt-1">{t('import.subtitle')}</p>
	</div>

	<!-- The four steps, with the one in progress marked. -->
	<ol class="flex flex-wrap items-center gap-2 text-xs">
		{#each STEPS as name, index (name)}
			<li class="flex items-center gap-2">
				<Badge variant={step === name ? 'default' : 'outline'}>
					{index + 1}. {t(`import.step_${name}` as 'import.step_file')}
				</Badge>
				{#if index < STEPS.length - 1}
					<ArrowRight class="text-subtle size-3" />
				{/if}
			</li>
		{/each}
	</ol>

	<FormError message={form?.code ? messageForCode(form.code) : undefined} />

	{#if step === 'file'}
		<section class="space-y-4 border p-6">
			<div class="grid gap-2">
				<Label for="import-wallet" class="text-subtle text-xs font-normal">
					{t('import.wallet')}
				</Label>
				<select id="import-wallet" class={selectClass} value={walletId} onchange={(event) => (chosenWallet = (event.currentTarget as HTMLSelectElement).value)}>
					{#each data.wallets as wallet (wallet.id)}
						<option value={wallet.id}>{wallet.name} · {wallet.currency_code}</option>
					{/each}
				</select>
				<p class="text-subtle text-xs">{t('import.wallet_hint')}</p>
			</div>

			<div class="grid gap-2">
				<Label for="import-file" class="text-subtle text-xs font-normal">
					{t('import.file')}
				</Label>
				<Input id="import-file" type="file" accept=".csv,.tsv,.txt,text/csv" onchange={readFile} />
				<p class="text-subtle text-xs">{t('import.file_hint')}</p>
			</div>
		</section>
	{:else if step === 'columns'}
		<section class="space-y-4 border p-6">
			<div class="flex items-center gap-2">
				<FileUp class="text-subtle size-4" />
				<p class="text-small">
					{t('import.read_summary', { name: fileName, rows: file.rows.length })}
				</p>
			</div>

			{#if mappingPending}
				<p class="text-subtle text-small">{t('import.mapping_pending')}</p>
			{:else if mappingFailed}
				<!-- The assistant is one of two paths, never the only one. -->
				<p class="text-subtle text-small">{t('import.mapping_failed')}</p>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				{#each FIELDS as field (field.key)}
					<div class="grid gap-2">
						<Label for="map-{field.key}" class="text-subtle text-xs font-normal">
							{field.label}{field.required ? ' *' : ''}
						</Label>
						<select
							id="map-{field.key}"
							class={selectClass}
							value={mapping[field.key] ?? ''}
							onchange={(event) =>
								(mapping = {
									...mapping,
									[field.key]: (event.currentTarget as HTMLSelectElement).value || undefined
								})}
						>
							<option value="">{t('common.none')}</option>
							{#each file.columns as column (column)}
								<option value={column}>{column}</option>
							{/each}
						</select>
					</div>
				{/each}
			</div>

			<p class="text-subtle text-xs">{t('import.amount_hint')}</p>
		</section>
	{:else if step === 'values'}
		<section class="space-y-4 border p-6">
			{#if fileCategories.length === 0}
				<p class="text-subtle text-small">{t('import.no_values')}</p>
			{:else}
				<p class="text-small">{t('import.values_hint')}</p>
				<div class="space-y-3">
					{#each fileCategories as name (name)}
						<div class="flex flex-wrap items-center gap-3">
							<span class="text-body w-48 truncate font-mono text-xs">{name}</span>
							<select
								class={selectClass + ' max-w-xs'}
								value={categoryMatches[name] ?? ''}
								onchange={(event) =>
									(categoryMatches = {
										...categoryMatches,
										[name]: (event.currentTarget as HTMLSelectElement).value
									})}
							>
								<option value="">{t('import.leave_uncategorised')}</option>
								{#each data.categories as category (category.id)}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else}
		<section class="space-y-4 border p-6">
			{#if result}
				<!-- Created, duplicate and skipped are counted apart, because
				     the fix for each is different (TXN-16, TXN-23). -->
				<dl class="grid grid-cols-3 gap-4 text-center">
					<div>
						<dt class="text-subtle text-xs tracking-widest uppercase">{t('import.created')}</dt>
						<dd class="font-serif text-3xl">{result.created}</dd>
					</div>
					<div>
						<dt class="text-subtle text-xs tracking-widest uppercase">
							{t('import.duplicates')}
						</dt>
						<dd class="font-serif text-3xl">{result.duplicates}</dd>
					</div>
					<div>
						<dt class="text-subtle text-xs tracking-widest uppercase">{t('import.skipped')}</dt>
						<dd class="font-serif text-3xl">{result.skipped.length}</dd>
					</div>
				</dl>

				{#if result.skipped.length > 0}
					<div class="space-y-1">
						<p class="text-subtle text-xs tracking-widest uppercase">{t('import.skipped')}</p>
						<ul class="max-h-64 space-y-1 overflow-y-auto text-xs">
							{#each result.skipped as row (row.index)}
								<li>
									<span class="font-mono">{t('import.line', { line: row.index + 2 })}</span>
									<span class="ml-2">{row.reason}</span>
									{#if row.code === 'FX_RATE_UNAVAILABLE'}
										<span class="text-subtle ml-1">{t('import.needs_rate')}</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<Button href="/transactions">{t('import.done')}</Button>
			{:else}
				<p class="text-small">
					{t('import.review_hint', { rows: file.rows.length, name: fileName })}
				</p>

				{#if file.dropped > 0}
					<p class="text-subtle text-small">{t('import.dropped', { count: file.dropped })}</p>
				{/if}

				<!-- The first two rows, as the API will see them. -->
				<div class="overflow-x-auto border">
					<table class="w-full text-xs">
						<thead class="bg-muted/5">
							<tr>
								{#each file.columns as column (column)}
									<th class="border-b px-3 py-2 text-left font-medium">{column}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each file.rows.slice(0, 3) as row, index (index)}
								<tr>
									{#each file.columns as column (column)}
										<td class="border-b px-3 py-2 font-mono">{row[column]}</td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!--
					The step rides along in the action URL. A bare `?/commit`
					replaces the whole query string, and the wizard would answer
					the commit on step one with the counts nowhere to be seen.
				-->
				<form method="POST" action="?/commit&step=review" use:enhance>
					<input type="hidden" name="wallet_id" value={walletId} />
					<input type="hidden" name="mapping" value={payload.mapping} />
					<input type="hidden" name="rows" value={payload.rows} />
					<input type="hidden" name="categories" value={payload.categories} />
					<Button type="submit" disabled={!mappable || file.rows.length === 0}>
						{t('import.commit', { rows: file.rows.length })}
					</Button>
				</form>
			{/if}
		</section>
	{/if}

	{#if !result}
		<div class="flex items-center justify-between">
			<Button
				variant="outline"
				disabled={step === 'file'}
				onclick={() => writeParams({ step: STEPS[STEPS.indexOf(step) - 1] })}
			>
				<ArrowLeft />
				{t('import.back')}
			</Button>

			<Button
				variant="outline"
				disabled={step === 'review' ||
					(step === 'file' && file.rows.length === 0) ||
					(step === 'columns' && !mappable)}
				onclick={() => writeParams({ step: STEPS[STEPS.indexOf(step) + 1] })}
			>
				{t('import.next')}
				<ArrowRight />
			</Button>
		</div>
	{/if}
</div>
